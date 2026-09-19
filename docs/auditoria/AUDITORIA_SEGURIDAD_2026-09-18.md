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
   El hash SHA-256 de un PIN de cuatro dígitos estaba versionado. Un espacio de 10.000 combinaciones podía probarse offline.  
   **Estado:** corregido. El PIN y su hash fueron eliminados del modelo; `drive-settings` exige sesión autorizada y reautenticación con la contraseña actual del administrador.

3. **ALTO — RLS y backend real.**  
   El proyecto Supabase `jppykxqsxayzypzdbnqd` fue auditado directamente. Se revisaron usuarios, roles, equipos, policies, vistas, funciones privilegiadas y Advisors.  
   **Estado:** corregido/endurecido. Se cerró ejecución anónima de funciones `SECURITY DEFINER`, se fijó `search_path`, se reforzó `admin_upsert_profile` y se movió el respaldo de hashes desde `public` al esquema privado.

4. **ALTO — vistas críticas.**  
   Se verificaron directamente `tickets_secure`, `schedule_activities_public` y `ticket_attachments_secure`.  
   **Estado:** validado en producción; las tres usan `security_invoker=true`.

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

10. **ALTO — importación de usuarios heredada.**  
    La función desplegada `bulk-import` generaba contraseñas débiles y podía sobrescribir la clave de cuentas existentes.  
    **Estado:** corregido. El código se incorporó al repositorio, exige contraseña fuerte, límites de tamaño/filas y crea usuarios mediante el endpoint canónico `admin-users` sin sobrescribir cuentas. Los slugs legacy `super-action` y `hyper-task` responden 410.

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
- `FUNC` (no operativo)

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

## Estado previo al despliegue

Completado:
1. Acceso y auditoría del proyecto Supabase `jppykxqsxayzypzdbnqd`.
2. Revisión de Security/Performance Advisors, policies, vistas, usuarios, roles y equipos.
3. `security_invoker=true` verificado en las vistas expuestas críticas.
4. Migración de hardening aplicada y versionada.
5. `admin-users` desplegada en versión 4 con JWT obligatorio.
6. `drive-settings` desplegada en versión 2 con reautenticación por contraseña.
7. `bulk-import` desplegada en versión 2 y endpoints legacy neutralizados.
8. Pruebas transaccionales de jerarquía/rol-equipo ejecutadas con rollback.

Pendiente de plataforma/operación:
- Activar protección/ruleset de `main` si la administración de GitHub lo permite.
- Activar Leaked Password Protection en la configuración de Supabase Auth; el conector disponible no expone esa mutación.
- Publicar la versión endurecida de `apps-script-drive/Code.gs` en Google Apps Script; no hay conector de Apps Script disponible en esta sesión.
- Resolver los avisos de rendimiento (índices/RLS initplan) en una fase de optimización sin alterar el comportamiento funcional.

## Riesgo residual

Después de estas correcciones siguen existiendo riesgos que solo pueden descartarse con acceso al backend real: RLS efectivo, grants, funciones privilegiadas, usuarios activos, configuración de Auth, leaked-password protection, MFA/SSO, logs y Advisors. Por ello esta rama debe considerarse **hardening del código y del repositorio**, no certificación de seguridad total.


## Revisión adicional — creación de usuarios y contraseñas

Se ejecutó una segunda revisión específica del flujo de gestión de usuarios.

### Problemas encontrados y corregidos

- **Creación y actualización estaban mezcladas.** El antiguo `upsert_user` podía terminar modificando una cuenta ya existente cuando el operador pretendía crear una nueva. Ahora `create_user` nunca sobrescribe una cuenta: si el correo ya existe devuelve conflicto y exige gestionar el usuario existente.
- **Creación parcial.** Si Supabase Auth creaba la cuenta y después fallaba `admin_upsert_profile`, podía quedar un usuario Auth huérfano. Ahora se intenta rollback automático con `deleteUser`; si ese rollback falla se devuelve un estado explícito de creación parcial para revisión administrativa.
- **Correos institucionales.** Se reemplazó la validación por sufijo por una validación completa de dirección `@sanpedro-valle.gov.co`.
- **Contraseñas.** Para creación y restablecimiento administrativo se exige mínimo 12 caracteres y al menos tres grupos entre minúsculas, mayúsculas, números y símbolos.
- **IDs de usuario.** El restablecimiento de contraseña valida UUID antes de consultar/modificar Auth.
- **Jerarquía administrativa.** Un Administrador TIC no puede administrar cuentas de su mismo nivel ni niveles superiores; un Secretario puede gestionar Administrador TIC y roles operativos; solo Super Admin puede gestionar el nivel Secretario/Super Admin. El cambio de clave propia se hace desde “Mi contraseña”.
- **Rol/equipo.** Comunicaciones solo puede pertenecer a COM; Administrador TIC solo a TIC; requester, Secretario General y Super Admin no reciben equipos operativos TIC/COM.
- **Múltiples roles/equipos.** La interfaz ahora muestra todos los roles encontrados y la auditoría marca como anomalía los perfiles con múltiples roles/equipos cuando la estructura prevista es de un rol principal.
- **Contraseña de cuentas privilegiadas.** Los botones de cambio de clave se ocultan para cuentas del mismo o mayor nivel; el backend vuelve a validar la jerarquía, por lo que manipular el navegador no evita el control.

### Pruebas ejecutadas

Se añadieron pruebas automatizadas en `tests/admin-users-policy.test.mjs`.

Resultado local:

- **11 pruebas ejecutadas**
- **11 aprobadas**
- **0 fallidas**

Cubren correo institucional, nombre, fortaleza de contraseña, roles/equipos permitidos, consistencia rol-equipo, UUID, niveles de privilegio, creación de roles y bloqueo del restablecimiento administrativo de la propia contraseña.

También se verificó sintaxis de:

- `app.js`: OK.
- `supabase/functions/admin-users/policy.mjs`: OK.

Se añadió el workflow `.github/workflows/user-security-tests.yml` para ejecutar `node --check`, las pruebas Node y `deno check` de la Edge Function en cambios futuros. Al momento de esta revisión GitHub no reportó ejecuciones de Actions para esta rama, por lo que el resultado de CI todavía no debe darse por aprobado.

### Auditoría usuario por usuario

Se añadió `supabase/audit/user_auth_audit.sql`. El reporte no expone hashes de contraseña y verifica por usuario:

- existencia de cuenta Auth y perfil;
- coincidencia de correo Auth/perfil;
- correo confirmado;
- existencia de contraseña local, sin revelar su hash;
- estado del perfil;
- roles;
- equipos;
- múltiples roles/equipos;
- inconsistencias rol-equipo;
- perfiles huérfanos;
- correos duplicados.

Esta consulta debe ejecutarse en el proyecto Supabase real antes de declarar cerrado el componente de usuarios.


## Actualización de despliegue — 18/09/2026

- Respaldo de hashes de Auth: movido de `public` a `private`, permisos de `anon/authenticated` revocados.
- Ejecución anónima de RPC `SECURITY DEFINER`: cerrada.
- `set_updated_at` y `set_ticket_status_timestamps`: `search_path` fijado.
- `admin-users`: versión 4 activa, `verify_jwt=true`.
- `drive-settings`: versión 2 activa, `verify_jwt=true`, sin PIN compartido.
- `bulk-import`: versión 2 activa, `verify_jwt=true`, sin contraseñas generadas débiles ni sobrescritura de usuarios.
- `super-action` y `hyper-task`: endpoints heredados neutralizados con HTTP 410.
- Prueba transaccional válida de `admin_upsert_profile`: aprobada con rollback.
- Pruebas negativas: promoción de Secretario a Super Admin y asignación TIC a requester, ambas bloqueadas correctamente.
