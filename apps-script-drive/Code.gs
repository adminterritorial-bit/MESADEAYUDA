/**
 * Mesa de Ayuda TIC · Google Drive Upload Web App
 * Versión: v4.8.12-security-hardened
 *
 * Función:
 * - Recibe archivos en base64 desde la Mesa.
 * - Valida la sesión Supabase del usuario.
 * - Guarda el archivo en Google Drive.
 * - Registra en public.ticket_attachments la ruta Drive y metadatos.
 *
 * Propiedades requeridas del Script:
 * SUPABASE_URL=https://jppykxqsxayzypzdbnqd.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY_DE_SUPABASE
 * DRIVE_ROOT_FOLDER_NAME=Mesa de Ayuda TIC - Archivos
 * DRIVE_FILE_VISIBILITY=DOMAIN_WITH_LINK
 * MAX_UPLOAD_MB=10
 *
 * Opcional:
 * DRIVE_ROOT_FOLDER_ID=ID_DE_CARPETA_EXISTENTE_EN_DRIVE
 */

const DRIVE_UPLOAD_VERSION = 'mesa-tic-v4.8.12-security-hardened';

function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'Mesa de Ayuda TIC Drive Upload',
    version: DRIVE_UPLOAD_VERSION,
    security: 'context-authorization-v2'
  });
}

function doPost(e) {
  try {
    const request = parseRequest_(e);

    if (request.action !== 'upload_file') {
      throw new Error('Acción no soportada: ' + String(request.action || ''));
    }

    const config = getUploadConfig_();
    const accessToken = String(request.access_token || '').trim();
    const user = verifySupabaseUser_(config, accessToken);
    const fileInput = request.file || {};
    const context = request.context || {};

    authorizeUploadContext_(config, user, context);
    const bytes = decodeAndValidateFile_(config, fileInput);

    const saved = saveFileToDrive_(config, user, fileInput, context, bytes);
    const row = registerAttachmentInSupabase_(config, user, saved, context);

    return jsonOutput_({
      ok: true,
      file: Object.assign({}, saved, {
        attachment_id: row && row.id ? row.id : null
      })
    });

  } catch (err) {
    return jsonOutput_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function parseRequest_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('El cuerpo recibido no es JSON válido.');
  }
}

function getUploadConfig_() {
  const props = PropertiesService.getScriptProperties();

  const supabaseUrl = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  const rootFolderId = props.getProperty('DRIVE_ROOT_FOLDER_ID');
  const rootFolderName = props.getProperty('DRIVE_ROOT_FOLDER_NAME') || 'Mesa de Ayuda TIC - Archivos';
  const visibility = props.getProperty('DRIVE_FILE_VISIBILITY') || 'DOMAIN_WITH_LINK';
  const maxUploadMb = Number(props.getProperty('MAX_UPLOAD_MB') || 10);

  if (!supabaseUrl) throw new Error('Falta SUPABASE_URL en propiedades del script.');
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en propiedades del script.');

  return {
    supabaseUrl,
    serviceRoleKey,
    rootFolderId,
    rootFolderName,
    visibility,
    maxUploadBytes: Math.max(1, Math.min(maxUploadMb, 25)) * 1024 * 1024
  };
}

function verifySupabaseUser_(config, accessToken) {
  const token = String(accessToken || '').trim();

  if (!token) {
    throw new Error('No llegó token de sesión Supabase. Vuelve a iniciar sesión en la Mesa.');
  }

  const response = UrlFetchApp.fetch(config.supabaseUrl + '/auth/v1/user', {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + token
    }
  });

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    console.error('No se pudo validar usuario Supabase · HTTP ' + code + ' · ' + response.getContentText());
    throw new Error('No se pudo validar la sesión Supabase.');
  }

  const user = JSON.parse(response.getContentText() || '{}');

  if (!user.id) {
    throw new Error('Supabase no devolvió usuario válido.');
  }

  return {
    id: user.id,
    email: user.email || '',
    raw: user
  };
}

function normalizeUuid_(value, label) {
  const id = String(value || '').trim();
  if (!id) return null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(label + ' no es un identificador válido.');
  }

  return id;
}

function fetchServiceRows_(config, path) {
  const response = UrlFetchApp.fetch(config.supabaseUrl + '/rest/v1/' + path, {
    method: 'get',
    muteHttpExceptions: true,
    headers: supabaseHeaders_(config)
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error('Fallo consultando autorización · HTTP ' + code + ' · ' + response.getContentText());
    throw new Error('No fue posible validar los permisos del archivo.');
  }

  return JSON.parse(response.getContentText() || '[]');
}

function getUploadActor_(config, user) {
  const roles = fetchServiceRows_(
    config,
    'profile_roles?profile_id=eq.' + encodeURIComponent(user.id) + '&select=role_code'
  ).map(row => String(row.role_code || ''));

  const teams = fetchServiceRows_(
    config,
    'profile_teams?profile_id=eq.' + encodeURIComponent(user.id) + '&select=team_code'
  ).map(row => String(row.team_code || ''));

  return {
    id: user.id,
    isAdmin: roles.some(role => ['super_admin', 'secretary_admin', 'tic_admin'].includes(role)),
    teams: teams
  };
}

function canAccessTicket_(config, actor, ticketId) {
  const rows = fetchServiceRows_(
    config,
    'tickets?id=eq.' + encodeURIComponent(ticketId) + '&select=id,requester_id,assigned_team_code&limit=1'
  );

  const ticket = rows[0];
  if (!ticket) return false;

  return actor.isAdmin
    || String(ticket.requester_id || '') === actor.id
    || actor.teams.includes(String(ticket.assigned_team_code || ''));
}

function authorizeUploadContext_(config, user, context) {
  const ticketId = normalizeUuid_(context.ticket_id, 'ticket_id');
  const messageId = normalizeUuid_(context.message_id, 'message_id');
  const activityId = normalizeUuid_(context.activity_id, 'activity_id');
  const actor = getUploadActor_(config, user);

  if (!ticketId && !messageId && !activityId) {
    throw new Error('El archivo debe quedar asociado a una solicitud, mensaje o actividad válida.');
  }

  if (ticketId && !canAccessTicket_(config, actor, ticketId)) {
    throw new Error('No tienes permiso para adjuntar archivos a esta solicitud.');
  }

  if (messageId) {
    const rows = fetchServiceRows_(
      config,
      'ticket_messages?id=eq.' + encodeURIComponent(messageId) + '&select=id,ticket_id,author_id&limit=1'
    );
    const message = rows[0];

    if (!message || (String(message.author_id || '') !== actor.id && !actor.isAdmin)) {
      throw new Error('No tienes permiso para adjuntar archivos a este mensaje.');
    }

    if (ticketId && String(message.ticket_id || '') !== ticketId) {
      throw new Error('El mensaje no pertenece a la solicitud indicada.');
    }

    if (message.ticket_id && !canAccessTicket_(config, actor, String(message.ticket_id))) {
      throw new Error('No tienes permiso sobre la solicitud de este mensaje.');
    }
  }

  if (activityId) {
    const rows = fetchServiceRows_(
      config,
      'activities?id=eq.' + encodeURIComponent(activityId) + '&select=id,ticket_id,created_by&limit=1'
    );
    const activity = rows[0];

    if (!activity || (String(activity.created_by || '') !== actor.id && !actor.isAdmin)) {
      throw new Error('No tienes permiso para adjuntar archivos a esta actividad.');
    }

    if (ticketId && activity.ticket_id && String(activity.ticket_id) !== ticketId) {
      throw new Error('La actividad no pertenece a la solicitud indicada.');
    }

    if (activity.ticket_id && !canAccessTicket_(config, actor, String(activity.ticket_id))) {
      throw new Error('No tienes permiso sobre la solicitud de esta actividad.');
    }
  }
}

function decodeAndValidateFile_(config, fileInput) {
  if (!fileInput || !fileInput.name || !fileInput.base64) {
    throw new Error('No llegó archivo válido.');
  }

  const cleanName = String(fileInput.name || '').trim();
  const mimeType = String(fileInput.type || 'application/octet-stream').toLowerCase();
  const blockedExt = /\.(html?|svg|js|mjs|cjs|exe|msi|bat|cmd|ps1|sh|vbs|scr|com|jar|apk)$/i;
  const blockedMime = /^(text\/html|image\/svg\+xml|application\/(javascript|x-javascript|x-msdownload|x-msdos-program))$/i;

  if (blockedExt.test(cleanName) || blockedMime.test(mimeType)) {
    throw new Error('Este tipo de archivo no está permitido por seguridad.');
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(String(fileInput.base64 || ''));
  } catch (err) {
    throw new Error('El contenido del archivo no es base64 válido.');
  }

  if (!bytes.length) throw new Error('El archivo está vacío.');

  if (bytes.length > config.maxUploadBytes) {
    throw new Error('El archivo supera el tamaño permitido. Máximo: ' + Math.round(config.maxUploadBytes / 1024 / 1024) + ' MB.');
  }

  return bytes;
}

function saveFileToDrive_(config, user, fileInput, context, bytes) {
  const root = getRootFolder_(config);
  const yearFolder = getOrCreateFolder_(root, String(new Date().getFullYear()));
  const ticketLabel = sanitizeName_(context.ticket_number || context.ticket_id || context.source || 'sin-radicado');
  const ticketFolder = getOrCreateFolder_(yearFolder, ticketLabel);

  const mimeType = fileInput.type || 'application/octet-stream';
  const cleanName = sanitizeFileName_(fileInput.name || 'archivo');
  const blob = Utilities.newBlob(bytes, mimeType, cleanName);

  const file = ticketFolder.createFile(blob);
  applySharing_(file, config.visibility);

  const driveFileId = file.getId();
  const driveUrl = file.getUrl();

  return {
    file_name: cleanName,
    mime_type: mimeType,
    size_bytes: bytes.length,
    drive_file_id: driveFileId,
    drive_url: driveUrl,
    drive_download_url: 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(driveFileId),
    drive_folder_id: ticketFolder.getId(),
    uploader_email: user.email || '',
    saved_at: new Date().toISOString()
  };
}

function registerAttachmentInSupabase_(config, user, saved, context) {
  const payload = {
    ticket_id: context.ticket_id || null,
    message_id: context.message_id || null,
    activity_id: context.activity_id || null,
    uploaded_by: user.id,
    source: 'google_drive',
    file_name: saved.file_name,
    mime_type: saved.mime_type,
    size_bytes: saved.size_bytes,
    drive_file_id: saved.drive_file_id,
    drive_url: saved.drive_url,
    drive_download_url: saved.drive_download_url,
    drive_folder_id: saved.drive_folder_id,
    description: context.description || context.title || null,
    metadata: {
      context: context || {},
      uploader_email: user.email || '',
      provider: 'google_apps_script_drive',
      version: DRIVE_UPLOAD_VERSION
    }
  };

  const response = UrlFetchApp.fetch(config.supabaseUrl + '/rest/v1/ticket_attachments', {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      Prefer: 'return=representation'
    }
  });

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    console.error('Fallo registrando adjunto en Supabase · HTTP ' + code + ' · ' + response.getContentText());
    throw new Error('El archivo subió a Drive, pero no se pudo registrar de forma segura en la Mesa.');
  }

  const rows = JSON.parse(response.getContentText() || '[]');
  return Array.isArray(rows) ? rows[0] : rows;
}

function getRootFolder_(config) {
  if (config.rootFolderId) {
    return DriveApp.getFolderById(config.rootFolderId);
  }

  return getOrCreateFolder_(DriveApp.getRootFolder(), config.rootFolderName);
}

function getOrCreateFolder_(parent, name) {
  const safeName = sanitizeName_(name || 'General');
  const folders = parent.getFoldersByName(safeName);

  if (folders.hasNext()) return folders.next();

  return parent.createFolder(safeName);
}

function applySharing_(file, visibility) {
  try {
    if (visibility === 'ANYONE_WITH_LINK') {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } else if (visibility === 'DOMAIN_WITH_LINK') {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } else if (visibility === 'PRIVATE') {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    }
  } catch (err) {
    console.log('No se pudo aplicar visibilidad. Se conserva configuración por defecto: ' + err);
  }
}

function sanitizeName_(value) {
  return String(value || 'General')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'General';
}

function sanitizeFileName_(value) {
  return String(value || 'archivo')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'archivo';
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testConfiguration() {
  const config = getUploadConfig_();
  const root = getRootFolder_(config);

  console.log('Configuración OK.');
  console.log('SUPABASE_URL: ' + config.supabaseUrl);
  console.log('Carpeta raíz: ' + root.getName() + ' · ' + root.getId());
  console.log('Visibilidad: ' + config.visibility);
  console.log('Máximo MB: ' + Math.round(config.maxUploadBytes / 1024 / 1024));
}
