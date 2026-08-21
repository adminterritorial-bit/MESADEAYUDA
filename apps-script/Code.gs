/**
 * Mesa de Ayuda TIC · Notificaciones por correo institucional
 * Versión: v4.8.10 Google Apps Script
 *
 * Propiedades requeridas en Apps Script:
 * SUPABASE_URL=https://jppykxqsxayzypzdbnqd.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
 * MAIL_FROM_NAME=Mesa de Ayuda TIC - Alcaldía de San Pedro
 * EMAIL_BATCH_SIZE=10
 * MESA_APP_URL=https://TU_URL_DE_VERCEL
 */

const DEFAULT_BATCH_SIZE = 10;
const APP_VERSION = 'mesa-tic-v4.8.10-apps-script';

function processPendingEmails() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log('Ya hay otra ejecución activa. Se omite esta corrida.');
    return;
  }

  try {
    const config = getConfig_();
    const remainingQuota = MailApp.getRemainingDailyQuota();

    if (remainingQuota <= 0) {
      console.log('Sin cupo diario de correo disponible.');
      return;
    }

    const limit = Math.min(config.batchSize, remainingQuota);
    const rows = fetchPendingQueue_(config, limit);

    if (!rows.length) {
      console.log('No hay correos pendientes.');
      return;
    }

    rows.forEach(row => processOneEmail_(config, row));

  } catch (err) {
    console.error('Error general en processPendingEmails: ' + err);
  } finally {
    lock.releaseLock();
  }
}

function processOneEmail_(config, row) {
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = Number(row.max_attempts || 3);

  try {
    const destination = String(row.destination || '').trim();

    if (!isValidEmail_(destination)) {
      throw new Error('Destinatario inválido o vacío: ' + destination);
    }

    const payload = row.payload || {};
    const subject = String(payload.subject || 'Actualización Mesa de Ayuda TIC').trim();
    const body = String(payload.body || 'Tu solicitud tiene una actualización de seguimiento.').trim();

    let conversationNote = '';

    if (payload.event_type === 'ticket.closed') {
      conversationNote = fetchTicketConversationSummary_(config, row.ticket_id);
    }

    const ticketLink = buildTicketLink_(config, row, payload);
    const htmlBody = buildHtmlEmail_(payload, body, ticketLink, conversationNote);

    MailApp.sendEmail({
      to: destination,
      subject: subject,
      body: stripHtml_(htmlBody),
      htmlBody: htmlBody,
      name: config.fromName,
      noReply: false
    });

    updateQueueRow_(config, row.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      processed_by: APP_VERSION,
      last_error: null
    });

    console.log('Correo enviado a ' + destination + ' · ' + subject);

  } catch (err) {
    const finalStatus = attempts >= maxAttempts ? 'failed' : 'pending';

    updateQueueRow_(config, row.id, {
      status: finalStatus,
      attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      processed_by: APP_VERSION,
      last_error: String(err && err.message ? err.message : err).slice(0, 900)
    });

    console.error('Error enviando correo de cola ' + row.id + ': ' + err);
  }
}

function fetchPendingQueue_(config, limit) {
  const url = config.supabaseUrl + '/rest/v1/notification_delivery_queue'
    + '?select=id,notification_id,profile_id,ticket_id,channel,destination,status,payload,created_at,sent_at,last_error,attempts,max_attempts'
    + '&status=eq.pending'
    + '&channel=eq.email'
    + '&destination=not.is.null'
    + '&order=created_at.asc'
    + '&limit=' + encodeURIComponent(String(limit));

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: supabaseHeaders_(config)
  });

  assertOk_(response, 'consultar cola pendiente');

  return JSON.parse(response.getContentText() || '[]');
}

function updateQueueRow_(config, id, payload) {
  const url = config.supabaseUrl + '/rest/v1/notification_delivery_queue?id=eq.' + encodeURIComponent(id);

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: Object.assign({}, supabaseHeaders_(config), {
      Prefer: 'return=minimal'
    })
  });

  assertOk_(response, 'actualizar cola ' + id);
}

function fetchTicketConversationSummary_(config, ticketId) {
  if (!ticketId) return '';

  try {
    const url = config.supabaseUrl + '/rest/v1/ticket_messages'
      + '?select=body,created_at'
      + '&ticket_id=eq.' + encodeURIComponent(ticketId)
      + '&order=created_at.desc'
      + '&limit=8';

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: supabaseHeaders_(config)
    });

    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.log('No se pudo consultar conversación del ticket. Se enviará correo sin nota de conversación.');
      return '';
    }

    const rows = JSON.parse(response.getContentText() || '[]');

    if (!rows.length) return '';

    const closureMessage = rows.find(row => {
      return String(row.body || '').toLowerCase().includes('cierre de solicitud');
    });

    return String((closureMessage || rows[0]).body || '').trim();

  } catch (err) {
    console.log('Error consultando conversación del ticket: ' + err);
    return '';
  }
}

function buildTicketLink_(config, row, payload) {
  if (!config.appUrl) return '';

  const ticketId = row.ticket_id || payload.ticket_id;

  if (!ticketId) return config.appUrl;

  return config.appUrl + '/?ticket_id=' + encodeURIComponent(ticketId);
}

function buildHtmlEmail_(payload, fallbackBody, ticketLink, conversationNote) {
  const eventType = String(payload.event_type || '');
  const isCreated = eventType === 'ticket.created';
  const isClosed = eventType === 'ticket.closed';

  const ticketNumber = escapeHtml_(payload.ticket_number || '');
  const ticketTitle = escapeHtml_(payload.ticket_title || '');
  const ticketDescription = escapeHtml_(payload.ticket_description || '');
  const serviceName = escapeHtml_(payload.service_name || 'Mesa de Ayuda TIC');
  const status = escapeHtml_(payload.status_label || statusLabel_(payload.status || ''));
  const requesterName = escapeHtml_(payload.requester_name || '');
  const priority = escapeHtml_(priorityLabel_(payload.priority || 'normal'));
  const preferredDate = escapeHtml_(formatDateText_(payload.preferred_date || ''));
  const assignedResource = escapeHtml_(payload.assigned_resource_name || 'Por definir');
  const workMode = escapeHtml_(workModeLabel_(payload.work_mode || ''));
  const place = escapeHtml_(payload.place || '');
  const channelRequested = escapeHtml_(payload.channel_requested || '');
  const contact = escapeHtml_(payload.contact || '');
  const attachmentsNote = escapeHtml_(payload.attachments_note || '');
  const link = escapeHtml_(ticketLink || '');
  const note = escapeHtml_(conversationNote || '');

  const headerTitle = isCreated
    ? 'Solicitud radicada correctamente'
    : isClosed
      ? 'Solicitud cerrada'
      : 'Seguimiento de solicitud';

  const intro = isCreated
    ? 'Tu solicitud fue recibida por la Mesa de Ayuda TIC. A continuación encuentras los datos registrados para seguimiento.'
    : isClosed
      ? 'Tu solicitud fue cerrada. El caso queda finalizado con trazabilidad en la Mesa de Ayuda TIC.'
      : escapeHtml_(payload.body || fallbackBody || 'Tu solicitud tiene una actualización de seguimiento.');

  const statusBadgeColor = isClosed ? '#18a058' : '#0b57d0';

  return `
  <div style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#102945">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 0">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;width:94%;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dce8f5">
            <tr>
              <td style="padding:26px 30px;background:linear-gradient(135deg,#0b57d0,#18a058);color:white">
                <div style="font-size:13px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">Mesa de Ayuda TIC</div>
                <h1 style="margin:8px 0 0;font-size:25px;line-height:1.2">${headerTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px">
                ${requesterName ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.6">Hola, <strong>${requesterName}</strong>.</p>` : ''}
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6">${intro}</p>

                <div style="padding:18px 20px;border-radius:18px;background:#f8fbff;border:1px solid #dce8f5;margin-bottom:20px">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#61758e;font-weight:bold;margin-bottom:6px">Radicado</div>
                  <div style="font-size:24px;font-weight:bold;color:#0b57d0">${ticketNumber || 'Sin radicado'}</div>
                </div>

                <div style="margin-bottom:20px">
                  <span style="display:inline-block;background:${statusBadgeColor};color:#ffffff;font-weight:bold;border-radius:999px;padding:8px 14px;font-size:13px">Estado: ${status || 'Actualizada'}</span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;font-size:14px">
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Solicitud</td><td style="color:#102945;font-weight:bold">${ticketTitle || 'No indicada'}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Descripción</td><td style="color:#102945;line-height:1.5">${ticketDescription || 'No indicada'}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Servicio</td><td style="color:#102945">${serviceName}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Responsable</td><td style="color:#102945">${assignedResource}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Modalidad</td><td style="color:#102945">${workMode}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Prioridad</td><td style="color:#102945">${priority}</td></tr>
                  <tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Fecha preferida</td><td style="color:#102945">${preferredDate || 'No indicada'}</td></tr>
                  ${place ? `<tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Lugar / punto</td><td style="color:#102945">${place}</td></tr>` : ''}
                  ${channelRequested ? `<tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Canal</td><td style="color:#102945">${channelRequested}</td></tr>` : ''}
                  ${contact ? `<tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Contacto</td><td style="color:#102945">${contact}</td></tr>` : ''}
                  ${attachmentsNote ? `<tr><td style="font-weight:bold;color:#52677f;width:170px;vertical-align:top">Insumos</td><td style="color:#102945">${attachmentsNote}</td></tr>` : ''}
                </table>

                ${isClosed && note ? `
                <div style="margin-top:22px;padding:18px 20px;border-radius:18px;background:#eefaf3;border:1px solid #ccefd8">
                  <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#287045;font-weight:bold;margin-bottom:8px">Nota de cierre / conversación</div>
                  <div style="font-size:14px;line-height:1.6;color:#102945">${note}</div>
                </div>` : ''}

                ${link ? `
                <div style="margin-top:26px;text-align:center">
                  <a href="${link}" style="display:inline-block;background:#0b57d0;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:14px">Ver solicitud en la Mesa</a>
                </div>` : ''}

                <div style="margin-top:24px;padding:16px 18px;border-radius:16px;background:#eef7ff;border:1px solid #cfe6ff;color:#24415f;font-size:14px;line-height:1.5">
                  Este correo fue generado automáticamente por la Mesa de Ayuda TIC de la Alcaldía de San Pedro.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px;background:#f8fbff;color:#657891;font-size:12px;font-weight:bold">Alcaldía Municipal de San Pedro · Seguimiento institucional</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties();

  const supabaseUrl = props.getProperty('SUPABASE_URL');
  const serviceRoleKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  const fromName = props.getProperty('MAIL_FROM_NAME') || 'Mesa de Ayuda TIC - Alcaldía de San Pedro';
  const batchSize = Number(props.getProperty('EMAIL_BATCH_SIZE') || DEFAULT_BATCH_SIZE);
  const appUrl = String(props.getProperty('MESA_APP_URL') || '').replace(/\/$/, '');

  if (!supabaseUrl) throw new Error('Falta Script Property: SUPABASE_URL');
  if (!serviceRoleKey) throw new Error('Falta Script Property: SUPABASE_SERVICE_ROLE_KEY');

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey: serviceRoleKey,
    fromName: fromName,
    batchSize: Math.max(1, Math.min(batchSize, 50)),
    appUrl: appUrl
  };
}

function supabaseHeaders_(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: 'Bearer ' + config.serviceRoleKey
  };
}

function installFiveMinuteTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processPendingEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('processPendingEmails')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('Activador instalado: processPendingEmails cada 5 minutos.');
}

function testConfiguration() {
  const config = getConfig_();
  const rows = fetchPendingQueue_(config, 1);

  console.log('Configuración OK.');
  console.log('Pendientes detectados: ' + rows.length);
  console.log('Cupo diario restante aproximado: ' + MailApp.getRemainingDailyQuota());
}

function sendTestEmailToMe() {
  const config = getConfig_();
  const email = Session.getActiveUser().getEmail();

  if (!isValidEmail_(email)) {
    throw new Error('No se pudo detectar el correo del usuario activo.');
  }

  MailApp.sendEmail({
    to: email,
    subject: 'Prueba Mesa de Ayuda TIC',
    body: 'Correo de prueba enviado correctamente desde Google Apps Script.',
    htmlBody: '<p>Correo de prueba enviado correctamente desde <strong>Google Apps Script</strong>.</p>',
    name: config.fromName,
    noReply: false
  });

  console.log('Correo de prueba enviado a: ' + email);
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function statusLabel_(status) {
  const map = {
    resolved: 'Resuelta',
    closed: 'Cerrada',
    scheduled: 'Programada',
    waiting_user: 'Esperando información',
    in_progress: 'En gestión',
    assigned: 'Asignada',
    new: 'Nueva',
    cancelled: 'Cancelada'
  };

  return map[status] || status;
}

function priorityLabel_(priority) {
  const map = {
    low: 'Baja',
    normal: 'Normal',
    high: 'Alta',
    critical: 'Crítica'
  };

  return map[priority] || priority || 'Normal';
}

function workModeLabel_(mode) {
  const map = {
    presencial: 'Presencial',
    virtual: 'Virtual',
    mixto: 'Mixta',
    mixta: 'Mixta',
    remote: 'Virtual',
    onsite: 'Presencial',
    hybrid: 'Mixta'
  };

  return map[mode] || mode || 'No indicada';
}

function formatDateText_(value) {
  if (!value) return 'No indicada';

  try {
    const raw = String(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parts = raw.split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    return raw;

  } catch (err) {
    return String(value || 'No indicada');
  }
}

function stripHtml_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function assertOk_(response, action) {
  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error('Error al ' + action + ' · HTTP ' + code + ' · ' + response.getContentText());
  }
}
