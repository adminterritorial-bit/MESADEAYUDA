# Checklist v4.8.11 · Mesa de Ayuda TIC

## Servicios
- [ ] En Nueva solicitud aparece **Publicación en página web**.
- [ ] En Nueva solicitud aparece **Solicitud de desarrollo web**.
- [ ] Publicación en página web queda en categoría Publicación y contenidos.
- [ ] Solicitud de desarrollo web queda en categoría Desarrollo web y plataformas / TIC.

## Google Drive
- [ ] Apps Script de archivos tiene propiedades configuradas.
- [ ] `testConfiguration` corre sin error.
- [ ] Web App está desplegado y se copió la URL `/exec`.
- [ ] En Configuración de la Mesa se guardó la URL del Web App.

## Adjuntos
- [ ] Al radicar una solicitud, se puede marcar “Sí envío archivo”.
- [ ] El archivo sube a Google Drive.
- [ ] Supabase registra la ruta en `ticket_attachments`.
- [ ] Al abrir el ticket, se ve la sección **Archivos en Drive**.
- [ ] Al responder un ticket, se puede adjuntar archivo.
- [ ] Al crear una actividad de cronograma, se puede adjuntar soporte.

## Seguridad
- [ ] La service_role key solo está en Apps Script, no en el frontend.
- [ ] El Web App valida sesión Supabase antes de guardar archivos.
- [ ] Supabase no almacena el binario del archivo, solo metadatos y URL.
