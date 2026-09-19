# Mesa de Ayuda TIC

Repositorio depurado para lanzamiento controlado de la Mesa de Ayuda TIC de la Alcaldía de San Pedro.

## Entrada de despliegue

El despliegue principal está en la raíz del repositorio:

- `index.html`
- `app.js`
- `app.css`
- `config.js`
- `site.webmanifest`
- `sw.js`
- `assets/`

La raíz es la única fuente canónica del frontend. El antiguo espejo `frontend/app/` fue eliminado porque duplicaba byte a byte la aplicación y sus assets. Antes de fusionar cambios estructurales, cualquier plataforma externa no conectada debe usar la raíz del repositorio como directorio de despliegue.

## Configuración de Drive

La URL del Web App de Google Apps Script puede configurarse de dos formas:

1. En la app, desde Configuración → Archivos en Google Drive.
2. Globalmente para todos los usuarios, editando `config.js` y pegando la URL `/exec` en:

```js
window.MESA_TIC_UPLOAD_WEBAPP_URL = 'https://script.google.com/macros/s/XXXXX/exec';
```

No guardes claves secretas en este repositorio. La `SUPABASE_SERVICE_ROLE_KEY` solo debe existir en secretos de Supabase Edge Functions o Propiedades del Script de Google Apps Script. El verificador del PIN de Drive debe configurarse como secreto `DRIVE_SETTINGS_PIN_SHA256`.

## SQL y Apps Script

- SQL: carpeta `sql/`.
- Correos institucionales: `apps-script/`.
- Archivos en Drive: `apps-script-drive/`.

## Documentación

La auditoría y checklists quedaron en `docs/`.

## Auditoría de seguridad

- Política de seguridad: `SECURITY.md`.
- Auditoría SQL de RLS, grants, vistas, funciones y usuarios: `supabase/audit/security_audit.sql`.
- Hallazgos y estado de remediación: `docs/auditoria/AUDITORIA_SEGURIDAD_2026-09-18.md`.
- La app mantiene su diseño y navegación; los cambios de esta auditoría se concentran en seguridad, autorización y estructura del repositorio.
