import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TYPES = new Set(['departments', 'users', 'assets', 'emails']);
const ALLOWED_ROLES = new Set(['requester', 'communication_agent', 'tic_admin', 'secretary_admin', 'super_admin']);
const ALLOWED_TEAMS = new Set(['TIC', 'COM', 'FUNC']);
const EMAIL_RE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@sanpedro-valle\.gov\.co$/i;
const MAX_CSV_BYTES = 1024 * 1024;
const MAX_ROWS = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => row[h] = (cols[i] ?? '').trim());
    return row;
  });
}

function passwordError(password: string) {
  if (password.length < 12) return 'La contraseña debe tener mínimo 12 caracteres';
  if (password.length > 72) return 'La contraseña no puede superar 72 caracteres';
  const groups = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  return groups >= 3 ? '' : 'La contraseña debe combinar al menos tres grupos de caracteres';
}

function validateUserRow(r: Record<string,string>, rowNum: number) {
  const errors: Array<{ row: number; error: string }> = [];
  const email = String(r.email || '').trim().toLowerCase();
  const role = String(r.role_code || 'requester').trim();
  const team = String(r.team_code || '').trim();
  const password = String(r.password || '');

  if (!EMAIL_RE.test(email)) errors.push({ row: rowNum, error: 'Correo institucional inválido' });
  if (!String(r.full_name || '').trim()) errors.push({ row: rowNum, error: 'full_name es obligatorio' });
  if (!ALLOWED_ROLES.has(role)) errors.push({ row: rowNum, error: 'Rol inválido: ' + role });
  if (team && !ALLOWED_TEAMS.has(team)) errors.push({ row: rowNum, error: 'Equipo inválido: ' + team });
  if (role === 'communication_agent' && team !== 'COM') errors.push({ row: rowNum, error: 'communication_agent debe usar COM' });
  if (role === 'tic_admin' && team !== 'TIC') errors.push({ row: rowNum, error: 'tic_admin debe usar TIC' });
  if (role === 'requester' && !['', 'FUNC'].includes(team)) errors.push({ row: rowNum, error: 'requester solo puede ir sin equipo o FUNC' });
  if (role === 'secretary_admin' && !['', 'FUNC'].includes(team)) errors.push({ row: rowNum, error: 'secretary_admin solo puede ir sin equipo o FUNC' });

  const passError = passwordError(password);
  if (passError) errors.push({ row: rowNum, error: passError });

  return errors;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json({ error: 'Variables Supabase no configuradas' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice('Bearer '.length).trim();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);

  const { data: allowed, error: permError } = await admin.rpc('has_permission_for_user', {
    p_user_id: userData.user.id,
    p_permission: 'imports.manage',
  }).maybeSingle();
  if (permError || !allowed) return json({ error: 'No autorizado para importaciones' }, 403);

  const body = await req.json().catch(() => ({}));
  const type = String(body.type || '');
  const csv = String(body.csv || '');
  const dryRun = body.dry_run !== false;

  if (!ALLOWED_TYPES.has(type)) return json({ error: 'Tipo de importación no soportado' }, 400);
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) return json({ error: 'CSV supera 1 MB' }, 413);

  const rows = parseCsv(csv);
  if (rows.length > MAX_ROWS) return json({ error: 'Máximo 500 registros por importación' }, 413);

  const errors: Array<{ row: number; error: string }> = [];
  const seenEmails = new Set<string>();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    if (type === 'users') {
      errors.push(...validateUserRow(r, rowNum));
      const email = String(r.email || '').trim().toLowerCase();
      if (seenEmails.has(email)) errors.push({ row: rowNum, error: 'Correo duplicado en el CSV' });
      seenEmails.add(email);
    }
    if (type === 'assets' && !String(r.name || '').trim()) errors.push({ row: rowNum, error: 'El activo requiere name' });
    if (type === 'emails' && !EMAIL_RE.test(String(r.email || '').trim())) errors.push({ row: rowNum, error: 'Correo institucional inválido' });
  });

  if (dryRun || errors.length) {
    return json({ ok: errors.length === 0, total_rows: rows.length, valid_rows: rows.length - errors.length, errors });
  }

  if (type !== 'users') {
    const { error: logOnlyError } = await admin.from('import_jobs').insert({
      import_type: type,
      total_rows: rows.length,
      valid_rows: rows.length,
      error_rows: 0,
      created_by: userData.user.id,
      status: 'validated',
    });
    if (logOnlyError) return json({ error: logOnlyError.message }, 400);
    return json({ ok: true, imported_rows: rows.length, note: 'CSV validado; este tipo permanece en modo validación.' });
  }

  const imported: Array<{ email: string; action: string }> = [];
  const importErrors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    const payload = {
      action: 'create_user',
      email: String(r.email || '').trim().toLowerCase(),
      full_name: String(r.full_name || '').trim(),
      role_code: String(r.role_code || 'requester').trim(),
      team_code: String(r.team_code || '').trim(),
      password: String(r.password || ''),
    };

    try {
      const response = await fetch(url + '/functions/v1/admin-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'apikey': anonKey,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'No fue posible crear el usuario');

      if (String(r.is_active || 'true').trim().toLowerCase() === 'false') {
        const { error: disableError } = await admin.from('profiles').update({ status: 'disabled' }).eq('id', result.user_id);
        if (disableError) throw disableError;
      }

      imported.push({ email: payload.email, action: 'created' });
    } catch (error) {
      importErrors.push({ row: rowNum, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const { error: logError } = await admin.from('import_jobs').insert({
    import_type: type,
    total_rows: rows.length,
    valid_rows: imported.length,
    error_rows: importErrors.length,
    errors: importErrors,
    created_by: userData.user.id,
    status: importErrors.length ? 'imported_with_errors' : 'imported',
  });
  if (logError) return json({ error: logError.message }, 400);

  return json({ ok: importErrors.length === 0, imported_rows: imported.length, errors: importErrors, imported });
});
