MESA DE AYUDA TIC v4.8.11
Servicios web + adjuntos en Google Drive

ORDEN DE INSTALACIÓN

1. SUPABASE
   - Ir a Supabase > SQL Editor.
   - Ejecutar: sql/mesa_tic_v4_8_11_servicios_web_adjuntos_drive.sql

2. GOOGLE APPS SCRIPT PARA ARCHIVOS
   - Entrar con adminterritorial@sanpedro-valle.gov.co a script.google.com.
   - Crear proyecto: Mesa de Ayuda TIC - Archivos Drive.
   - Pegar apps-script-drive/Code.gs.
   - Activar manifiesto y reemplazar appsscript.json.
   - En Propiedades de secuencia de comandos agregar:

     SUPABASE_URL=https://jppykxqsxayzypzdbnqd.supabase.co
     SUPABASE_SERVICE_ROLE_KEY=PEGAR_SERVICE_ROLE_KEY_DE_SUPABASE
     DRIVE_ROOT_FOLDER_NAME=Mesa de Ayuda TIC - Archivos
     DRIVE_FILE_VISIBILITY=DOMAIN_WITH_LINK
     MAX_UPLOAD_MB=10

   - Ejecutar testConfiguration y autorizar.
   - Implementar como Web App:
       Ejecutar como: Yo
       Quién tiene acceso: Cualquier usuario con el enlace / o usuarios del dominio, según lo permita Workspace.
   - Copiar la URL terminada en /exec.

3. FRONTEND
   - Subir frontend/app a Vercel.
   - Redeploy.
   - Ctrl + Shift + R.
   - Entrar a la Mesa > Configuración > Archivos en Google Drive.
   - Pegar la URL del Web App de Apps Script y guardar.

QUÉ CAMBIA

- Nuevo servicio: Publicación en página web.
- Nuevo servicio: Solicitud de desarrollo web.
- En radicación se pregunta si se enviará archivo.
- En conversación se pueden adjuntar archivos.
- En cronograma se pueden adjuntar soportes de actividad.
- Los archivos se guardan realmente en Google Drive.
- Supabase solo guarda ruta, nombre, tipo, tamaño, usuario y ticket asociado.

PRUEBA RECOMENDADA

1. Crear una solicitud nueva de Publicación en página web.
2. Adjuntar un PDF o decreto.
3. Radicar.
4. Verificar en Drive que se creó la carpeta y el archivo.
5. Abrir el ticket y revisar la sección Archivos en Drive.
6. Responder el ticket adjuntando otro archivo.
7. Confirmar que aparece también en Archivos en Drive.
