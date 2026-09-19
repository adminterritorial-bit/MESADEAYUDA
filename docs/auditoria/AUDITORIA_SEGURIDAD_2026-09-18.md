# Auditoría de seguridad y estructura — Mesa de Ayuda TIC

**Fecha:** 18 de septiembre de 2026  
**Repositorio:** adminterritorial-bit/MESADEAYUDA  
**Alcance:** revisión estática de frontend, SQL versionado, Supabase Edge Functions, Google Apps Script, estructura del repositorio, autenticación, autorización y gestión de usuarios.

## Resultado ejecutivo

La aplicación no puede calificarse como “inhackeable”. Ningún sistema puede garantizarlo. El objetivo de esta intervención es reducir superficie de ataque, cerrar fallos concretos y dejar controles auditables.

### Hallazgos de mayor prioridad

1. **CRÍTICO — autorización insuficiente en cargas a Google Drive.**  
   El Web App verificaba que el token perteneciera a un usuario válido, pero aceptaba `ticket_id`, `message_id` y `activity_id` enviados por el navegador y escribía con `service_role`. Esto permitía saltarse RLS durante el registro del adjunto.  
   **Estado:** corregido en esta rama. Ahora el backend vuelve a resolver roles/equipos y valida ownership/acceso antes de guardar.

2. **ALTO — PIN de configuración de Drive derivable fuera de línea.**  
   El hash SHA-256 de un PIN de cuatro dígitos estaba versionado. Un espacio de 10.000 combinaciones puede probarse offline.  
   **Estado:** retirado del código. El hash debe configurarse como secreto `DRIVE_SETTINGS_PIN_SHA256`.

3. **ALTO — RLS real no verificable con los accesos conectados.**  
   El frontend usa el proyecto Supabase `jppykxqsxayzypzdbnqd`, pero la conexión disponible no tiene permiso sobre ese proyecto. Por tanto no fue posible inspeccionar las políticas reales, Advisors, Auth users ni el esquema efectivo.  
   **Estado:** pendiente de validación sobre el proyecto correcto. Se añadió `supabase/audit/security_audit.sql`.

4. **ALTO — vistas críticas no están definidas en el repositorio.**  
   El frontend consume `tickets_secure` y `schedule_activities_public`, pero sus definiciones no están versionadas aquí. Una vista PostgreSQL puede eludir RLS si no está configurada correctamente.  
   **Estado:** pendiente de validar en base real; la auditoría SQL comprueba `security_invoker`.

5. **ALTO — rama `main` sin protección.**  
   GitHub reporta `protected: false` y cero rulesets.  
   **Estado:** pendiente de configuración administrativa en GitHub. Recomendación mínima: PR obligatorio, revisión, checks requeridos y prohibición de force-push/deletion.

6. **MEDIO — dependencia Supabase del navegador sin versión exacta.**  
   Se cargaba `@supabase/supabase-js@2`, por lo que el contenido podía cambiar sin cambio de código.  
   **Estado:** corregido; se fija `2.56.0` para mantener consistencia con las Edge Functions existentes.

7. **MEDIO — URL de adjuntos sin validación de protocolo.**  
   El valor se escapaba como HTML pero no se restringía a HTTPS.  
   **Estado:** corregido con validación de URL externa.

8. **MEDIO — validación de roles/equipos solo parcialmente confiada al backend.**  
   La Edge Function aceptaba cualquier `role_code` y `team_code` recibido.  
   **Estado:** corregido con listas permitidas server-side.

9. **MEDIO — tamaño de archivo confiaba en un número enviado por el cliente.**  
   **Estado:** corregido; se valida el tamaño de los bytes realmente decodificados y se bloquean tipos activos/ejecutables.

10. **MEDIO — código fuente incompleto respecto a funcionalidades.**  
    El frontend invoca `bulk-import`, pero no existe `supabase/functions/bulk-import` en este repositorio. También faltan migraciones fundacionales de varias tablas/RPC.  
    **Estado:** pendiente; no se eliminó la función visible para no cambiar comportamiento.

## Usuarios y autorización

Roles esperados:

- `requester`
- `communication_agent`
- `tic_admin`
- `secretary_admin`
- `super_admin`

Equipos esperados:

- `TIC`
- `COM`

La Edge Function `admin-users` autentica al llamante y exige `users.manage` para administrar terceros. La creación/actualización de usuarios ahora rechaza roles o equipos fuera de catálogo. El cambio de contraseña propia pasa directamente por `supabase.auth.updateUser`, eliminando un uso innecesario de `service_role`.

La auditoría SQL añadida detecta:

- usuarios Auth sin perfil;
- perfiles sin usuario Auth;
- perfiles sin rol;
- roles/equipos inválidos;
- asignaciones duplicadas;
- tablas sin RLS;
- policies y grants;
- funciones `SECURITY DEFINER`;
- funciones abiertas a `PUBLIC`, `anon` o `authenticated`;
- vistas y su configuración de `security_invoker`.

## Repositorio y duplicados

Antes de la limpieza había **83 archivos** y aproximadamente **37,3 MB** versionados. Se detectaron **33 grupos de blobs duplicados** y aproximadamente **21,2 MB** redundantes.

`frontend/app/` contenía una copia byte a byte del frontend raíz. Se eliminaron 34 archivos del espejo. También se retiró `assets/app-icon-source.png`, idéntico a `assets/app-icon.png` y no necesario en runtime.

La raíz del repositorio queda como fuente canónica.

## Exposición de secretos

No se observó una `SUPABASE_SERVICE_ROLE_KEY` literal versionada en los archivos revisados. La publishable key del navegador no se considera secreto y debe quedar protegida mediante RLS correcto.

El endpoint público de Google Apps Script tampoco es un secreto: debe asumirse conocido y protegerse con autenticación/autorización server-side, lo cual se fortaleció en esta rama.

## Controles añadidos

- `.gitignore` para secretos/estado local.
- `SECURITY.md` con reglas de manejo de secretos y controles mínimos.
- auditoría SQL read-only.
- validación de roles/equipos.
- autorización backend para adjuntos.
- validación de tamaño real y tipos peligrosos.
- URLs externas restringidas a HTTPS.
- dependencia de Supabase fijada.
- fuente única del frontend.

## Verificaciones realizadas

- `app.js`: sintaxis JavaScript OK.
- `sw.js`: sintaxis JavaScript OK.
- `apps-script-drive/Code.gs`: sintaxis JavaScript OK.
- `apps-script/Code.gs`: sintaxis JavaScript OK.
- Cambios aislados en rama de auditoría; `main` no se modificó.

## Pendientes antes de fusionar/desplegar

1. Conectar o conceder acceso al proyecto Supabase `jppykxqsxayzypzdbnqd`.
2. Ejecutar `supabase/audit/security_audit.sql` y revisar resultados.
3. Ejecutar Supabase Security y Performance Advisors sobre ese proyecto.
4. Confirmar que `tickets_secure` y `schedule_activities_public` usan `security_invoker=true` o no eluden RLS.
5. Revisar todas las policies de `profiles`, `profile_roles`, `profile_teams`, `tickets`, `ticket_messages`, `activities` y `knowledge_articles`.
6. Configurar el secreto `DRIVE_SETTINGS_PIN_SHA256` antes de desplegar la Edge Function actualizada.
7. Desplegar el nuevo `apps-script-drive/Code.gs` en el Web App institucional.
8. Confirmar si `bulk-import` existe en Supabase; si existe, incorporar su código al repositorio y auditarlo. Si no existe, retirar o implementar esa función en una fase separada.
9. Activar protección/ruleset de `main`.
10. Confirmar que cualquier despliegue externo no conectado usa la raíz del repositorio y no `frontend/app/`.

## Riesgo residual

Después de estas correcciones siguen existiendo riesgos que solo pueden descartarse con acceso al backend real: RLS efectivo, grants, funciones privilegiadas, usuarios activos, configuración de Auth, leaked-password protection, MFA/SSO, logs y Advisors. Por ello esta rama debe considerarse **hardening del código y del repositorio**, no certificación de seguridad total.
