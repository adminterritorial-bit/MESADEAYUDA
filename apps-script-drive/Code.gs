/**
 * Mesa de Ayuda TIC · Google Drive Upload Web App
 * Versión: v4.8.11
 *
 * Función:
 * - Recibe archivos en base64 desde la Mesa.
 * - Valida la sesión Supabase del usuario.
 * - Guarda el archivo en Google Drive.
 * - Registra en public.ticket_attachments la ruta Drive y metadatos.
 *
 * Propiedades requeridas del Script:
 * SUPABASE_URL=https://jppykxqsxayzypzdbnqd.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY_DE_SUPABASE
 * DRIVE_ROOT_FOLDER_NAME=Mesa de Ayuda TIC - Archivos
 * DRIVE_FILE_VISIBILITY=DOMAIN_WITH_LINK
 * MAX_UPLOAD_MB=10
 *
 * Opcional:
 * DRIVE_ROOT_FOLDER_ID=ID_DE_CARPETA_EXISTENTE_EN_DRIVE
 */

const DRIVE_UPLOAD_VERSION = 'mesa-tic-v4.8.11-drive-upload';

function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'Mesa de Ayuda TIC Drive Upload',
    version: DRIVE_UPLOAD_VERSION
  });
}

function doPost(e) {
  try {
    const request = parseRequest_(e);

    if (request.action !== 'upload_file') {
      throw new Error('Acción no soportada: ' + String(request.action || ''));
    }

    const config = getUploadConfig_();
    const user = verifySupabaseUser_(config, request.access_token);
    const fileInput = request.file || {};
    const context = request.context || {};

    validateFile_(config, fileInput);

    const saved = saveFileToDrive_(config, user, fileInput, context);
    const row = registerAttachmentInSupabase_(config, user, saved, context);

    return jsonOutput_({
      ok: true,
      file: Object.assign({}, saved, {
        attachment_id: row && row.id ? row.id : null
      })
    });

  } catch (err) {
    return jsonOutput_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function parseRequest_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('El cuerpo recibido no es JSON válido.');
  }
}

function getUploadConfig_() {
  const props = PropertiesService.getScriptProperties();

  const supabaseUrl = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  const rootFolderId = props.getProperty('DRIVE_ROOT_FOLDER_ID');
  const rootFolderName = props.getProperty('DRIVE_ROOT_FOLDER_NAME') || 'Mesa de Ayuda TIC - Archivos';
  const visibility = props.getProperty('DRIVE_FILE_VISIBILITY') || 'DOMAIN_WITH_LINK';
  const maxUploadMb = Number(props.getProperty('MAX_UPLOAD_MB') || 10);

  if (!supabaseUrl) throw new Error('Falta SUPABASE_URL en propiedades del script.');
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en propiedades del script.');

  return {
    supabaseUrl,
    serviceRoleKey,
    rootFolderId,
    rootFolderName,
    visibility,
    maxUploadBytes: Math.max(1, Math.min(maxUploadMb, 25)) * 1024 * 1024
  };
}

function verifySupabaseUser_(config, accessToken) {
  const token = String(accessToken || '').trim();

  if (!token) {
    throw new Error('No llegó token de sesión Supabase. Vuelve a iniciar sesión en la Mesa.');
  }

  const response = UrlFetchApp.fetch(config.supabaseUrl + '/auth/v1/user', {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + token
    }
  });

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error('No se pudo validar el usuario Supabase. HTTP ' + code + ' · ' + response.getContentText());
  }

  const user = JSON.parse(response.getContentText() || '{}');

  if (!user.id) {
    throw new Error('Supabase no devolvió usuario válido.');
  }

  return {
    id: user.id,
    email: user.email || '',
    raw: user
  };
}

function validateFile_(config, fileInput) {
  if (!fileInput || !fileInput.name || !fileInput.base64) {
    throw new Error('No llegó archivo válido.');
  }

  const size = Number(fileInput.size || 0);

  if (size > config.maxUploadBytes) {
    throw new Error('El archivo supera el tamaño permitido. Máximo: ' + Math.round(config.maxUploadBytes / 1024 / 1024) + ' MB.');
  }
}

function saveFileToDrive_(config, user, fileInput, context) {
  const root = getRootFolder_(config);
  const yearFolder = getOrCreateFolder_(root, String(new Date().getFullYear()));
  const ticketLabel = sanitizeName_(context.ticket_number || context.ticket_id || context.source || 'sin-radicado');
  const ticketFolder = getOrCreateFolder_(yearFolder, ticketLabel);

  const bytes = Utilities.base64Decode(String(fileInput.base64 || ''));
  const mimeType = fileInput.type || 'application/octet-stream';
  const cleanName = sanitizeFileName_(fileInput.name || 'archivo');
  const blob = Utilities.newBlob(bytes, mimeType, cleanName);

  const file = ticketFolder.createFile(blob);
  applySharing_(file, config.visibility);

  const driveFileId = file.getId();
  const driveUrl = file.getUrl();

  return {
    file_name: cleanName,
    mime_type: mimeType,
    size_bytes: Number(fileInput.size || bytes.length),
    drive_file_id: driveFileId,
    drive_url: driveUrl,
    drive_download_url: 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(driveFileId),
    drive_folder_id: ticketFolder.getId(),
    uploader_email: user.email || '',
    saved_at: new Date().toISOString()
  };
}

function registerAttachmentInSupabase_(config, user, saved, context) {
  const payload = {
    ticket_id: context.ticket_id || null,
    message_id: context.message_id || null,
    activity_id: context.activity_id || null,
    uploaded_by: user.id,
    source: 'google_drive',
    file_name: saved.file_name,
    mime_type: saved.mime_type,
    size_bytes: saved.size_bytes,
    drive_file_id: saved.drive_file_id,
    drive_url: saved.drive_url,
    drive_download_url: saved.drive_download_url,
    drive_folder_id: saved.drive_folder_id,
    description: context.description || context.title || null,
    metadata: {
      context: context || {},
      uploader_email: user.email || '',
      provider: 'google_apps_script_drive',
      version: DRIVE_UPLOAD_VERSION
    }
  };

  const response = UrlFetchApp.fetch(config.supabaseUrl + '/rest/v1/ticket_attachments', {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      Prefer: 'return=representation'
    }
  });

  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error('El archivo subió a Drive, pero no se pudo registrar en Supabase. HTTP ' + code + ' · ' + response.getContentText());
  }

  const rows = JSON.parse(response.getContentText() || '[]');
  return Array.isArray(rows) ? rows[0] : rows;
}

function getRootFolder_(config) {
  if (config.rootFolderId) {
    return DriveApp.getFolderById(config.rootFolderId);
  }

  return getOrCreateFolder_(DriveApp.getRootFolder(), config.rootFolderName);
}

function getOrCreateFolder_(parent, name) {
  const safeName = sanitizeName_(name || 'General');
  const folders = parent.getFoldersByName(safeName);

  if (folders.hasNext()) return folders.next();

  return parent.createFolder(safeName);
}

function applySharing_(file, visibility) {
  try {
    if (visibility === 'ANYONE_WITH_LINK') {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } else if (visibility === 'DOMAIN_WITH_LINK') {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } else if (visibility === 'PRIVATE') {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    }
  } catch (err) {
    console.log('No se pudo aplicar visibilidad. Se conserva configuración por defecto: ' + err);
  }
}

function sanitizeName_(value) {
  return String(value || 'General')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'General';
}

function sanitizeFileName_(value) {
  return String(value || 'archivo')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'archivo';
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testConfiguration() {
  const config = getUploadConfig_();
  const root = getRootFolder_(config);

  console.log('Configuración OK.');
  console.log('SUPABASE_URL: ' + config.supabaseUrl);
  console.log('Carpeta raíz: ' + root.getName() + ' · ' + root.getId());
  console.log('Visibilidad: ' + config.visibility);
  console.log('Máximo MB: ' + Math.round(config.maxUploadBytes / 1024 / 1024));
}
