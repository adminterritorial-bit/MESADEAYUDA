# Mesa de Ayuda TIC · v4.8.16 Release Candidate Auditada

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

También se conserva `frontend/app/` como espejo de compatibilidad, por si el proyecto de Vercel estuviera configurado con esa carpeta como raíz.

## Configuración de Drive

La URL del Web App de Google Apps Script puede configurarse de dos formas:

1. En la app, desde Configuración → Archivos en Google Drive.
2. Globalmente para todos los usuarios, editando `config.js` y pegando la URL `/exec` en:

```js
window.MESA_TIC_UPLOAD_WEBAPP_URL = 'https://script.google.com/macros/s/XXXXX/exec';
```

No guardes claves secretas en este repositorio. La `SUPABASE_SERVICE_ROLE_KEY` solo debe ir en Propiedades del Script de Google Apps Script.

## SQL y Apps Script

- SQL: carpeta `sql/`.
- Correos institucionales: `apps-script/`.
- Archivos en Drive: `apps-script-drive/`.

## Documentación

La auditoría y checklists quedaron en `docs/`.

## Validación técnica aplicada

- `node --check app.js`: OK.
- `node --check sw.js`: OK.
- JSON de manifest y Apps Script: OK.
- Eliminados duplicados sueltos de iconos en raíz.
- `frontend/app/` sincronizado con la versión principal para evitar despliegues accidentales antiguos.
