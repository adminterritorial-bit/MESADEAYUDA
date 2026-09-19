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
- `DRIVE_SETTINGS_PIN_SHA256`

`DRIVE_SETTINGS_PIN_SHA256` debe contener un SHA-256 hexadecimal de 64 caracteres y configurarse como secreto de la función. No almacenar el PIN ni su hash en Git.

## Google Apps Script

Usar Script Properties para:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DRIVE_ROOT_FOLDER_ID` o `DRIVE_ROOT_FOLDER_NAME`
- `DRIVE_FILE_VISIBILITY`
- `MAX_UPLOAD_MB`

## Revisión obligatoria antes de producción

Ejecutar `supabase/audit/security_audit.sql` sobre el proyecto Supabase real y resolver cualquier tabla pública sin RLS, vista sin `security_invoker`, función privilegiada abierta o usuario/perfil inconsistente.

## GitHub

La rama `main` debe protegerse con PR obligatorio, al menos una revisión, checks requeridos y bloqueo de force-push/deletion. Los secretos deben mantenerse fuera de Actions y archivos versionados salvo mediante GitHub Secrets.
