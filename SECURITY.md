# Security policy — Mesa de Ayuda TIC

## Principios

- Ningún secreto debe versionarse en Git: `SUPABASE_SERVICE_ROLE_KEY`, claves privadas, tokens, contraseñas, PIN o hashes usados como verificadores.
- La clave publicable de Supabase puede vivir en el frontend; nunca una service role key.
- Toda tabla expuesta por la Data API debe tener RLS habilitado y políticas explícitas por operación.
- La interfaz no es una frontera de autorización. Roles, equipos y ownership deben validarse en PostgreSQL, Edge Functions o servicios de backend.
- Las vistas expuestas deben usar `security_invoker=true` o quedar fuera del acceso de `anon`/`authenticated`.
- Las funciones `SECURITY DEFINER` deben tener `search_path` fijo, permisos de ejecución mínimos y no aceptar decisiones de autorización provenientes del cliente.

## Secretos requeridos fuera del repositorio

### Supabase Edge Functions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

La configuración global de Drive no usa PIN compartido. La Edge Function `drive-settings` exige sesión con `users.manage` y reautenticación mediante la contraseña actual del administrador.

## Google Apps Script

Usar Script Properties para:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DRIVE_ROOT_FOLDER_ID` o `DRIVE_ROOT_FOLDER_NAME`
- `DRIVE_FILE_VISIBILITY`
- `MAX_UPLOAD_MB`

## Revisión obligatoria antes de producción

Ejecutar `supabase/audit/security_audit.sql` y `supabase/audit/user_auth_audit.sql` sobre el proyecto real. Las vistas expuestas deben conservar `security_invoker=true`, y los RPC `SECURITY DEFINER` solo deben ser ejecutables por los roles estrictamente necesarios.

## GitHub

La rama `main` debe protegerse con PR obligatorio, al menos una revisión, checks requeridos y bloqueo de force-push/deletion. Los secretos deben mantenerse fuera de Actions y archivos versionados salvo mediante GitHub Secrets.
