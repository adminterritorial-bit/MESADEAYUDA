MESA DE AYUDA TIC v4.8.10 · PAQUETE COMPLETO
Alcaldía Municipal de San Pedro

CONTENIDO DEL PAQUETE

1. frontend/app
   Archivos para subir a Vercel.
   Incluye tickets, radicación, resolución, cierre, cronograma, notificaciones internas,
   cola de correos y apertura directa del ticket desde enlace ?ticket_id=.

2. sql/mesa_tic_v4_8_10_tickets_notificaciones_correo.sql
   Patch para Supabase.
   Crea/refuerza:
   - columnas operativas de tickets;
   - notificaciones internas;
   - notification_delivery_queue;
   - trigger de correo al radicar;
   - trigger de correo al cerrar;
   - marcas de resolved_at / closed_at.

3. apps-script/Code.gs
   Código completo para Google Apps Script.
   Consulta la cola de Supabase, envía correos desde la cuenta institucional
   y marca enviados/fallidos.

4. apps-script/appsscript.json
   Manifiesto del proyecto Apps Script.

ORDEN DE INSTALACION

1. SUPABASE
   Abrir Supabase → SQL Editor.
   Ejecutar completo el archivo:
   sql/mesa_tic_v4_8_10_tickets_notificaciones_correo.sql

2. GOOGLE APPS SCRIPT
   Entrar con adminterritorial@sanpedro-valle.gov.co a script.google.com.
   Crear proyecto: Mesa de Ayuda TIC - Notificaciones.
   Pegar completo apps-script/Code.gs.
   Configurar las propiedades:

   SUPABASE_URL=https://jppykxqsxayzypzdbnqd.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY_DE_SUPABASE
   MAIL_FROM_NAME=Mesa de Ayuda TIC - Alcaldía de San Pedro
   EMAIL_BATCH_SIZE=10
   MESA_APP_URL=https://TU_URL_DE_VERCEL

   Ejecutar en este orden:
   - testConfiguration
   - sendTestEmailToMe
   - installFiveMinuteTrigger

3. VERCEL
   Subir/reemplazar los archivos dentro de frontend/app.
   Redeploy.
   En navegador: Ctrl + Shift + R.

PRUEBA DE VALIDACION

1. Entrar como funcionario.
2. Radicar una solicitud.
3. Revisar en Supabase la tabla notification_delivery_queue:
   debe aparecer un correo pending con event_type ticket.created.
4. Ejecutar processPendingEmails o esperar 5 minutos.
5. Debe llegar correo de radicación.
6. Entrar como administrador.
7. Abrir ticket y usar Cierre de solicitud.
8. Revisar cola de correos:
   debe aparecer ticket.closed.
9. Ejecutar processPendingEmails o esperar 5 minutos.
10. Debe llegar correo de cierre con botón para ver la solicitud.

NOTA IMPORTANTE

No pegues la service_role key en el chat ni en el frontend.
Solo va en Propiedades de secuencia de comandos de Google Apps Script.
