# Auditoría técnica · Mesa de Ayuda TIC versión auditada

## Resultado general

Estado recomendado: **lista para piloto/lanzamiento controlado**, con validación real de usuarios antes de abrirla a toda la entidad.

## Cambios realizados sin alterar la lógica crítica

1. Se mantuvo la raíz del repositorio como punto principal de despliegue.
2. Se eliminaron iconos PNG sueltos duplicados en la raíz. Las copias canónicas permanecen en `assets/ui-icons/`.
3. Se movieron checklists e instructivos antiguos a `docs/`.
4. Se agregó `config.js` para configurar de forma global la URL del Web App de Drive sin depender del `localStorage` de un solo navegador.
5. Se actualizó cache busting a `versión auditada`.
6. Se actualizó `sw.js` con nuevo cache name y tratamiento especial para `config.js`, evitando que la URL global de Drive quede pegada por caché.
7. Se sincronizó `frontend/app/` con la versión principal para evitar que Vercel despliegue una versión antigua si el proyecto estuviera apuntando a esa carpeta.

## Validaciones ejecutadas

- Sintaxis JavaScript de `app.js`: OK.
- Sintaxis JavaScript de `sw.js`: OK.
- JSON de `site.webmanifest`: OK.
- JSON de `apps-script/appsscript.json`: OK.
- JSON de `apps-script-drive/appsscript.json`: OK.
- Escaneo básico de secretos: no se encontró `service_role` real ni secretos de Google dentro del frontend. Solo hay textos instructivos.

## Hallazgos importantes

### 1. Drive antes dependía de `localStorage`

La URL de Google Apps Script se guardaba solo en el navegador donde se configuraba. Eso podía hacer que otros funcionarios no pudieran adjuntar archivos. Se agregó `config.js` para definir la URL globalmente en el repositorio.

### 2. Existía una copia antigua en `frontend/app/`

`frontend/app/` tenía archivos de una versión anterior. Si Vercel estuviera configurado con esa carpeta como raíz, podía desplegar una versión vieja aunque la raíz estuviera bien. Se sincronizó la carpeta.

### 3. Duplicados de assets

Había iconos duplicados en tres ubicaciones. Se eliminaron los duplicados sueltos de raíz. Se conservaron `assets/ui-icons/` y el espejo de compatibilidad `frontend/app/assets/ui-icons/`.

### 4. Funciones externas no incluidas

La interfaz tiene opciones de `admin-users` y `bulk-import` que dependen de Supabase Edge Functions. Si esas funciones no están desplegadas, esas opciones mostrarán error. No afectan la operación normal de tickets, cierre, notificaciones, correo ni Drive.

### 5. SQL de adjuntos

El SQL de adjuntos asume que existe `public.activities`. Si la base original usa otro nombre para actividades, se debe validar antes de ejecutar en un entorno nuevo. En tu entorno actual probablemente ya está creado por las versiones anteriores.

## Prueba mínima antes de lanzamiento

1. Login como funcionario.
2. Radicar solicitud con archivo PDF.
3. Confirmar correo de radicación.
4. Login como administrador.
5. Abrir ticket, responder y cerrar formalmente.
6. Confirmar correo de cierre.
7. Abrir enlace del correo después del login.
8. Ver archivo en sección “Archivos en Drive”.
9. Crear actividad en cronograma.
10. Probar en celular instalado como PWA.

## No tocar antes del piloto

- No agregar módulos nuevos.
- No cambiar roles.
- No cambiar estructura de tablas sin prueba.
- No reemplazar Apps Script si ya está funcionando.

