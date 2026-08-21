(() => {
'use strict';
console.info('Mesa de Ayuda TIC');
if (window.__MESA_TIC_APP_V4_8_20_LOADED__) {
  console.warn('Mesa de Ayuda TIC: app.js ya fue cargado. Se evita inicialización duplicada.');
  return;
}
window.__MESA_TIC_APP_V4_8_20_LOADED__ = true;

const SUPABASE_URL = 'https://jppykxqsxayzypzdbnqd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CH1hn5LpS3zWPdDWqiM4jg_F7OuK7Ry';
const DRIVE_UPLOAD_URL_STORAGE_KEY = 'mesa_tic_drive_upload_webapp_url';
const APP_VERSION = 'Mesa de Ayuda TIC';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

function oauthRedirectUrl(){
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if(url.pathname.endsWith('/index.html')) url.pathname = url.pathname.replace(/index\.html$/, '');
  return url.toString();
}
function cleanOAuthUrl(){
  try{
    const url = new URL(window.location.href);
    ['code','error','error_code','error_description','state'].forEach(k=>url.searchParams.delete(k));
    window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : ''));
  }catch(_){ /* sin bloqueo */ }
}
async function finishOAuthRedirectIfNeeded(){
  const url = new URL(window.location.href);
  const oauthError = url.searchParams.get('error') || url.searchParams.get('error_code');
  const oauthErrorDescription = url.searchParams.get('error_description');
  const code = url.searchParams.get('code');
  if(oauthError){
    sessionStorage.setItem('mesa_tic_oauth_error', oauthErrorDescription || oauthError);
    cleanOAuthUrl();
    return null;
  }
  if(!code) return null;
  renderSoftLoading('Validando acceso con Google…', 'Estamos cerrando la autenticación institucional con Supabase.');
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  cleanOAuthUrl();
  if(error){
    sessionStorage.setItem('mesa_tic_oauth_error', error.message || 'No se pudo completar el inicio con Google.');
    return null;
  }
  return data?.session || null;
}

const state = {
  session: null,
  user: null,
  profile: null,
  roles: [],
  modules: [],
  services: [],
  resources: [],
  currentView: 'home',
  tickets: [],
  activities: [],
  notifications: [],
  emailQueue: [],
  articles: [],
  profiles: [],
  roleRows: [],
  teamRows: [],
  filter: { status: 'all', team: 'all', service: 'all', kind: 'all', resource: 'all', activityQ: '', q: '', globalQ: '' },
  scheduleDate: isoDate(new Date()),
  scheduleMode: 'day',
  ticketView: 'list',
  activeTicket: null,
  ticketMessages: [],
  ticketAttachments: [],
  onboardingChecked: false,
  tutorialSeen: false,
  tutorialStep: 0,
  pendingTicketId: null,
  openedUrlTicketId: null,
  notificationBaselineReady: false,
  lastUnreadNotificationIds: new Set(),
  notificationPoller: null,
  notificationSoundUnlocked: false
};

const roleLabels = {
  super_admin: 'CIO TIC · Super Admin',
  secretary_admin: 'Secretario General',
  tic_admin: 'Administrador TIC',
  communication_agent: 'Comunicaciones',
  requester: 'Funcionario solicitante'
};

const moduleLabels = {
  home: 'Panel principal',
  new_request: 'Nueva solicitud',
  my_requests: 'Mis solicitudes',
  requests: 'Bandeja de solicitudes',
  communications: 'Comunicaciones',
  schedule: 'Cronograma',
  users: 'Usuarios',
  imports: 'Importaciones',
  knowledge: 'Centro de ayuda',
  notifications: 'Notificaciones',
  reports: 'Reportes',
  launch_check: 'Checklist de lanzamiento',
  settings: 'Configuración'
};

const statusLabels = {
  new: 'Nueva', assigned: 'Asignada', in_progress: 'En gestión', waiting_user: 'Esperando funcionario', scheduled: 'Programada', resolved: 'Resuelta', closed: 'Cerrada', cancelled: 'Cancelada'
};
const priorityLabels = { low:'Baja', normal:'Normal', high:'Alta', critical:'Crítica' };
const kindLabels = { support:'Soporte', publication:'Publicación', coverage:'Cubrimiento', event:'Evento', meeting:'Reunión', internal:'Interna', fieldwork:'Campo', design:'Diseño', video:'Video', campaign:'Campaña' };
const kindOptions = ['support','publication','coverage','event','meeting','internal','fieldwork','design','video','campaign'];
const statusFlow = ['new','assigned','in_progress','waiting_user','scheduled','resolved','closed'];
function drawerStatusOptions(currentStatus){ return currentStatus === 'closed' ? statusFlow : statusFlow.filter(s=>s !== 'closed'); }

function h(strings,...values){ return strings.map((s,i)=>s + (values[i] ?? '')).join(''); }
function safe(v){ const d=document.createElement('div'); d.textContent = v ?? ''; return d.innerHTML; }
function icon(name){
  const icons = {
    home:'M3 11.5 12 4l9 7.5v8.5a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    new_request:'M12 5v14M5 12h14',
    my_requests:'M5 6h14M5 12h14M5 18h9',
    requests:'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 9h8M8 13h8M8 17h5',
    communications:'M4 12a8 8 0 0 1 8-8v16a8 8 0 0 1-8-8zm8-6 8 3v6l-8 3',
    schedule:'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    users:'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0M19 8a3 3 0 0 1 0 6',
    imports:'M12 4v11M8 8l4-4 4 4M5 20h14',
    knowledge:'M5 5a3 3 0 0 1 3-3h11v17H8a3 3 0 0 0-3 3zM5 5v17M9 7h7M9 11h7',
    notifications:'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4',
    search:'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm4.5 10.5L20 20',
    empty:'M12 3l9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
    chart:'M5 19V9M12 19V5M19 19v-8',
    lock:'M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z',
    clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4v5l3 2',
    send:'M4 12 20 4l-5 16-3-7-8-1z',
    check:'M5 13l4 4L19 7',
    plus:'M12 5v14M5 12h14',
    calendar:'M7 3v3M17 3v3M4 8h16M6 12h4v4H6z',
    team:'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 21a5 5 0 0 1 10 0M11 21a5 5 0 0 1 10 0',
    spark:'M12 3l2.2 6.1L21 12l-6.8 2.9L12 21l-2.2-6.1L3 12l6.8-2.9z',
    publication:'M5 19h14M7 17V7l5-3 5 3v10M9 10h6M9 13h6',
    coverage:'M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    event:'M6 4h12M6 20h12M8 4v16M16 4v16M10 8h4M10 12h4M10 16h4',
    meeting:'M4 6h16v10H7l-3 3zM8 10h8M8 13h5',
    fieldwork:'M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    internal:'M12 3l8 4v6c0 5-3.4 7.7-8 9-4.6-1.3-8-4-8-9V7z',
    support:'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c.7.7 1 1.5 1 2h6c0-.5.3-1.3 1-2a7 7 0 0 0-4-12z',
    phone:'M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.5 1.8L7.9 9.5a16 16 0 0 0 6.6 6.6l1.2-1.2a2 2 0 0 1 1.8-.5l2.8.5a2 2 0 0 1 1.7 2z'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.empty}"/></svg>`;
}

const imageAssetMap = {
  'user-security':'assets/ui-icons/user-security.png',
  'workflow-settings':'assets/ui-icons/workflow-settings.png',
  'dashboard-analytics':'assets/ui-icons/dashboard-analytics.png',
  'alerts-support':'assets/ui-icons/alerts-support.png',
  'calendar-planner':'assets/ui-icons/calendar-planner.png',
  'conversation-support':'assets/ui-icons/conversation-support.png',
  'knowledge-book':'assets/ui-icons/knowledge-book.png',
  'ticket-service':'assets/ui-icons/ticket-service.png',
  'headset-support':'assets/ui-icons/headset-support.png',
  'mail-support':'assets/ui-icons/mail-support.png',
  'role-funcionario':'assets/ui-icons/role-funcionario.png',
  'role-secretario-general':'assets/ui-icons/role-secretario-general.png',
  'role-comunicaciones':'assets/ui-icons/role-comunicaciones.png',
  'role-cio-tic':'assets/ui-icons/role-cio-tic.png'
};
function assetIcon(name, alt='', cls='asset-img'){
  const src = imageAssetMap[name];
  if(!src) return icon(name);
  return `<img src="${src}" alt="${safe(alt || name)}" class="${cls}">`;
}
function moduleAsset(code){
  return {
    home:'dashboard-analytics',
    new_request:'ticket-service',
    my_requests:'ticket-service',
    requests:'workflow-settings',
    communications:'conversation-support',
    schedule:'calendar-planner',
    users:'user-security',
    imports:'workflow-settings',
    knowledge:'knowledge-book',
    notifications:'alerts-support',
    reports:'dashboard-analytics',
    launch_check:'workflow-settings',
    settings:'workflow-settings'
  }[code] || 'dashboard-analytics';
}
function serviceAsset(service){
  const code = String(service?.code || '').toLowerCase();
  const name = String(service?.name || '').toLowerCase();
  const hay = `${code} ${name}`;
  if (hay.includes('mail') || hay.includes('correo')) return 'mail-support';
  if (hay.includes('logo') || hay.includes('identidad') || hay.includes('marca')) return 'role-secretario-general';
  if (hay.includes('camp')) return 'role-comunicaciones';
  if (hay.includes('video') || hay.includes('grab')) return 'conversation-support';
  if (hay.includes('public') || hay.includes('redes') || hay.includes('web')) return 'dashboard-analytics';
  if (hay.includes('dise') || hay.includes('pieza') || hay.includes('afiche') || hay.includes('flyer')) return 'ticket-service';
  if (hay.includes('coverage') || hay.includes('cubr') || hay.includes('foto')) return 'conversation-support';
  if (hay.includes('desarrollo web') || hay.includes('website') || hay.includes('sitio') || hay.includes('pagina web') || hay.includes('página web') || hay.includes('app') || hay.includes('auto') || hay.includes('formulario')) return 'workflow-settings';
  if (hay.includes('support') || hay.includes('help') || hay.includes('incid') || hay.includes('equip')) return 'headset-support';
  return service?.team_code === 'COM' ? 'conversation-support' : 'headset-support';
}
function serviceCategory(service){
  const code = String(service?.code || '').toLowerCase();
  const name = String(service?.name || '').toLowerCase();
  const category = String(service?.category || '').trim();
  if(category) return category;
  const hay = `${code} ${name}`;
  if(service?.team_code === 'COM'){
    if(hay.includes('logo') || hay.includes('camp') || hay.includes('dise') || hay.includes('pieza') || hay.includes('publicidad')) return 'Diseño, publicidad y campañas';
    if(hay.includes('video') || hay.includes('cubr') || hay.includes('foto') || hay.includes('grab')) return 'Video, cubrimientos y registro';
    if(hay.includes('public') || hay.includes('redes') || hay.includes('pagina web') || hay.includes('página web') || hay.includes('web') || hay.includes('copy') || hay.includes('bolet')) return 'Publicación y contenidos';
    return 'Comunicaciones generales';
  }
  return 'Soporte TIC';
}
function teamTitle(team){ return team === 'COM' ? 'Comunicaciones' : 'TIC'; }
function teamDescription(team){
  return team === 'COM'
    ? 'Diseño, campañas, publicaciones, cubrimientos, videos y contenidos institucionales.'
    : 'Soporte tecnológico, acceso, correo, conectividad y servicios digitales.';
}
function recommendedCommunicationCategories(){
  return ['Diseño de pieza publicitaria','Diseño de campaña institucional','Diseño de logo / identidad','Grabación de video','Edición básica de video','Publicación en redes sociales','Publicación en página web','Solicitud de desarrollo web','Copy / redacción institucional','Cubrimiento fotográfico o audiovisual'];
}
function isoDate(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function addDays(dateStr, days){ const d=new Date(`${dateStr}T12:00:00`); d.setDate(d.getDate()+days); return isoDate(d); }
function fmtDate(s){ return new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'2-digit',month:'long'}).format(new Date(`${s}T12:00:00`)); }
function fmtShortDate(s){ return new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'short'}).format(new Date(`${s}T12:00:00`)); }
function fmtTime(ts){ if(!ts) return ''; return new Date(ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }
function fmtDateTime(ts){ if(!ts) return ''; return new Date(ts).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function startOfWeek(dateStr){ const d=new Date(`${dateStr}T12:00:00`); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return isoDate(d); }
function startOfMonth(dateStr){ const d=new Date(`${dateStr}T12:00:00`); d.setDate(1); return isoDate(d); }
function addMonths(dateStr, months){ const d=new Date(`${dateStr}T12:00:00`); d.setMonth(d.getMonth()+months); return isoDate(d); }
function endOfMonth(dateStr){ const start=new Date(`${startOfMonth(dateStr)}T12:00:00`); start.setMonth(start.getMonth()+1); start.setDate(0); return isoDate(start); }
function monthName(dateStr){ return new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric'}).format(new Date(`${dateStr}T12:00:00`)); }
function timeToLocalInput(dateStr, time='08:00'){ return `${dateStr}T${time}`; }
function plusMinutesLocal(value, minutes){ const d=new Date(value); d.setMinutes(d.getMinutes()+minutes); const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,16); }
function roleText(){ return state.roles.map(r=>roleLabels[r.code] || r.name || r.code).join(' · ') || 'Sin rol'; }
function hasRole(code){ return state.roles.some(r=>r.code===code); }
function hasAnyRole(list){ return list.some(hasRole); }
function hasModule(code){ return state.modules.some(m=>m.code===code) || (isAdmin() && ['reports','launch_check','settings'].includes(code)); }
function canManageRequests(){ return hasAnyRole(['super_admin','secretary_admin','tic_admin','communication_agent']); }
function canManageSchedule(){ return Boolean(state.user && state.profile); }
function isComms(){ return hasRole('communication_agent'); }
function isAdmin(){ return hasAnyRole(['super_admin','secretary_admin','tic_admin']); }
function toast(message,type='info'){
  let stack=document.querySelector('.toast-stack');
  if(!stack){ stack=document.createElement('div'); stack.className='toast-stack'; document.body.appendChild(stack); }
  const t=document.createElement('div');
  t.className=`toast toast-${type||'info'}`;
  t.textContent=message;
  stack.appendChild(t);
  setTimeout(()=>t.remove(),5200);
}
function unlockNotificationSound(){
  state.notificationSoundUnlocked = true;
  const audio = document.getElementById('notificationSound');
  if(audio){ audio.volume = 0.52; audio.load?.(); }
}
function playNotificationSound(){
  try{
    const audio = document.getElementById('notificationSound');
    if(!audio || !state.notificationSoundUnlocked) return;
    audio.currentTime = 0;
    const p = audio.play();
    if(p?.catch) p.catch(()=>{});
  }catch(_err){ /* el navegador puede bloquear sonido sin interacción */ }
}
function renderSoftLoading(text='Cargando información institucional…', detail='Estamos preparando solicitudes, cronograma y seguimiento.'){
  app.className = 'boot-screen';
  app.innerHTML = `<div class="boot-card boot-card-pro"><div class="boot-icon-wrap"><img class="boot-app-icon" src="assets/app-icon-192.png" alt="Mesa de Ayuda TIC"></div><img class="boot-loader-gif" src="assets/loader-hourglass.gif" alt="Cargando"><strong>${safe(text)}</strong><span>${safe(detail)}</span></div>`;
}
function detectNewNotifications(nextRows){
  const unreadIds = new Set((nextRows||[]).filter(n=>!n.read_at && n.id).map(n=>String(n.id)));
  if(!state.notificationBaselineReady){
    state.lastUnreadNotificationIds = unreadIds;
    state.notificationBaselineReady = true;
    return [];
  }
  const fresh = [...unreadIds].filter(id=>!state.lastUnreadNotificationIds.has(id));
  state.lastUnreadNotificationIds = unreadIds;
  return fresh;
}
function updateNotificationBadges(){
  const unread = unreadNotifications();
  document.querySelectorAll('.notification-top-btn b,.nav-count').forEach(el=>el.remove());
  const top = document.querySelector('.notification-top-btn');
  if(top && unread){ top.insertAdjacentHTML('beforeend', `<b>${unread}</b>`); }
  const navBtn = document.querySelector('[data-view="notifications"]');
  if(navBtn && unread){ navBtn.insertAdjacentHTML('beforeend', `<span class="nav-count">${unread}</span>`); }
}
function startNotificationPoller(){
  if(state.notificationPoller) return;
  state.notificationPoller = setInterval(async()=>{
    if(!state.user || activeWizard()) return;
    await loadNotifications(true);
    updateNotificationBadges();
  }, 60000);
}
function activeModal(){ return Boolean(modalRoot?.querySelector('.modal')); }
function activeWizard(){ return Boolean(modalRoot?.querySelector('#wizardForm')); }
function urlTicketId(){
  try{
    const p = new URLSearchParams(window.location.search);
    return p.get('ticket_id') || p.get('ticket') || p.get('radicado') || '';
  }catch(_){ return ''; }
}
function cleanTicketUrlParam(){
  try{
    const url = new URL(window.location.href);
    ['ticket_id','ticket','radicado'].forEach(k=>url.searchParams.delete(k));
    const next = url.pathname + (url.searchParams.toString()?`?${url.searchParams.toString()}`:'') + url.hash;
    window.history.replaceState({}, '', next);
  }catch(_){ /* no bloquear navegación */ }
}
async function openTicketFromUrlIfNeeded(){
  const id = state.pendingTicketId || urlTicketId();
  if(!id || state.openedUrlTicketId === id || activeWizard()) return;
  state.pendingTicketId = id;
  const exists = state.tickets.some(t=>String(t.id)===String(id));
  if(!exists){
    state.openedUrlTicketId = id;
    toast('No se pudo abrir la solicitud del enlace. Puede no existir o tu usuario no tiene permiso para verla.');
    cleanTicketUrlParam();
    return;
  }
  state.openedUrlTicketId = id;
  cleanTicketUrlParam();
  await openTicket(id);
}
function ticketDirectLink(ticketId){
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('ticket_id', ticketId);
  return url.toString();
}

function driveUploadWebAppUrl(){
  return String(window.MESA_TIC_UPLOAD_WEBAPP_URL || localStorage.getItem(DRIVE_UPLOAD_URL_STORAGE_KEY) || '').trim().replace(/\/$/, '');
}
function saveDriveUploadWebAppUrl(url){
  const clean = String(url || '').trim().replace(/\/$/, '');
  if(clean) localStorage.setItem(DRIVE_UPLOAD_URL_STORAGE_KEY, clean);
  else localStorage.removeItem(DRIVE_UPLOAD_URL_STORAGE_KEY);
  return clean;
}
function uploadEnabled(){ return Boolean(driveUploadWebAppUrl()); }
function renderUploadField(name='support_files', label='¿Enviar archivo de soporte?', hint='Puedes adjuntar PDF, Word, Excel, imágenes o insumos. Se guardará en Google Drive y Supabase solo conservará la ruta.'){ 
  const disabled = uploadEnabled() ? '' : 'disabled';
  const note = uploadEnabled()
    ? 'El archivo se guarda en Drive; la Mesa solo guarda enlace y metadatos.'
    : 'Primero configura la URL del Web App de Google Apps Script en Configuración.';
  return `<div class="field upload-field"><label>${safe(label)}</label><input type="file" name="${safe(name)}" multiple ${disabled}><small>${safe(hint)} ${safe(note)}</small></div>`;
}
function collectWizardFiles(wizard){
  const input = modalRoot.querySelector('#wizardSupportFiles');
  if(input?.files?.length) wizard.files = Array.from(input.files);
}
function fileSizeLabel(bytes){
  const n = Number(bytes || 0);
  if(n >= 1024*1024) return `${(n/(1024*1024)).toFixed(1)} MB`;
  if(n >= 1024) return `${Math.ceil(n/1024)} KB`;
  return `${n} B`;
}
function renderAttachmentList(files){
  const rows = Array.isArray(files) ? files : [];
  if(!rows.length) return emptyState('Sin archivos','No hay documentos o insumos asociados a esta solicitud.');
  return `<div class="attachment-list">${rows.map(f=>`<a class="attachment-item" href="${safe(f.drive_url || f.drive_download_url || '#')}" target="_blank" rel="noopener"><span>${icon('publication')}</span><div><strong>${safe(f.file_name || 'Archivo')}</strong><small>${safe(f.mime_type || 'archivo')} · ${safe(fileSizeLabel(f.size_bytes))}</small></div></a>`).join('')}</div>`;
}
function readFileAsBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() : result);
    };
    reader.onerror = ()=>reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
async function uploadFilesToDrive(files, context={}, msgEl=null){
  const list = Array.from(files || []).filter(Boolean);
  if(!list.length) return [];
  const endpoint = driveUploadWebAppUrl();
  if(!endpoint) throw new Error('Falta configurar la URL del Web App de Google Apps Script para guardar archivos en Drive.');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || '';
  if(!accessToken) throw new Error('Sesión no disponible para verificar subida de archivo.');
  const uploaded = [];
  for(let i=0;i<list.length;i++){
    const file = list[i];
    if(msgEl) msgEl.innerHTML = `<div class="warning">Subiendo archivo ${i+1} de ${list.length} a Google Drive…</div>`;
    const base64 = await readFileAsBase64(file);
    const body = JSON.stringify({
      action:'upload_file',
      access_token: accessToken,
      context,
      file:{ name:file.name, type:file.type || 'application/octet-stream', size:file.size, base64 }
    });
    try{
      const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body });
      const text = await res.text();
      let payload = {};
      try{ payload = JSON.parse(text || '{}'); }catch(_){ payload = { ok: res.ok, raw:text }; }
      if(!res.ok || payload.ok === false) throw new Error(payload.error || `No se pudo subir ${file.name}.`);
      if(payload.file) uploaded.push(payload.file);
    }catch(err){
      // Fallback por restricciones CORS de Apps Script. La petición no-cors suele llegar al Web App,
      // pero el navegador no permite leer la respuesta. Apps Script registra el archivo en Supabase.
      await fetch(endpoint, { method:'POST', mode:'no-cors', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body });
      uploaded.push({ file_name:file.name, size_bytes:file.size, mime_type:file.type, drive_url:'', opaque:true });
    }
  }
  return uploaded;
}
function attachmentLinksText(files){
  const list = Array.from(files || []).filter(f=>f && (f.drive_url || f.file_name));
  if(!list.length) return '';
  return '\n\nArchivos adjuntos en Drive:\n' + list.map(f=>`- ${f.file_name || 'Archivo'}${f.drive_url ? ': ' + f.drive_url : ' (registrado en Drive)'}`).join('\n');
}
function wizardDraftKey(serviceCode){ return `mesa_tic_wizard_${state.user?.id || state.user?.email || 'anon'}_${serviceCode || 'general'}`; }
function loadWizardDraft(serviceCode){
  try{
    const raw = sessionStorage.getItem(wizardDraftKey(serviceCode));
    if(!raw) return null;
    const draft = JSON.parse(raw);
    if(!draft || Date.now() - Number(draft.ts || 0) > 1000*60*60*6) return null;
    return draft;
  }catch(_){ return null; }
}
function saveWizardDraft(wizard){
  try{
    if(!wizard?.service?.code) return;
    sessionStorage.setItem(wizardDraftKey(wizard.service.code), JSON.stringify({ step:wizard.step, data:wizard.data, ts:Date.now() }));
  }catch(_){ /* no bloquear la solicitud por almacenamiento local */ }
}
function clearWizardDraft(serviceCode){ try{ sessionStorage.removeItem(wizardDraftKey(serviceCode)); }catch(_){} }
async function guardedBoot(){
  if(activeWizard()){
    toast('La solicitud sigue abierta. Se bloqueó la actualización para no perder el progreso.');
    return;
  }
  await boot();
}

async function init(){
  ['click','keydown','touchstart'].forEach(evt=>document.addEventListener(evt, unlockNotificationSound, { once:true, passive:true }));
  if(!window.supabase){ renderFatal('No cargó la librería de Supabase. Revisa la conexión a internet.'); return; }
  await finishOAuthRedirectIfNeeded();
  const { data } = await supabase.auth.getSession();
  state.session = data.session; state.user = data.session?.user ?? null;
  state.pendingTicketId = urlTicketId();
  supabase.auth.onAuthStateChange((event, session)=>{
    state.session=session; state.user=session?.user ?? null;
    if(event === 'SIGNED_OUT') { clearModal(); renderLogin(); return; }
    if(event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    if(activeWizard()) { toast('La sesión se actualizó en segundo plano; continuamos sin cerrar la solicitud.'); return; }
    boot();
  });
  await boot();
}
async function boot(){
  if(!activeWizard()) clearModal();
  if(!state.user){ renderLogin(); return; }
  if(!document.querySelector('.shell') && !document.querySelector('.drawer')) renderSoftLoading();
  try{
    const { data, error } = await supabase.rpc('app_bootstrap');
    if(error) throw error;
    state.profile = data?.profile ?? null;
    state.roles = data?.roles ?? [];
    state.modules = data?.modules ?? [];
    state.services = data?.services ?? [];
    state.resources = data?.schedule_resources ?? [];
    if(!state.profile || state.profile.status !== 'active' || !state.roles.length){ renderAccessPending(); return; }
    if(!state.currentView || !hasModule(state.currentView)) state.currentView = 'home';
    await loadViewData();
    renderShell();
    startNotificationPoller();
    await openTicketFromUrlIfNeeded();
  }catch(err){ renderSystemError(err); }
}
function renderFatal(message){
  app.innerHTML = `<section class="access-shell"><div class="access-card"><img src="assets/logo-san-pedro-crop.png"><h1>No se pudo iniciar</h1><p>${safe(message)}</p></div></section>`;
}

function renderLogin(){
  app.className = '';
  app.innerHTML = h`
    <section class="login-shell">
      <div class="login-hero">
        <div class="login-hero-content">
          <img class="login-logo" src="assets/logo-san-pedro-crop.png" alt="Alcaldía de San Pedro">
          <h1>Mesa de Ayuda TIC</h1>
          <p>Acceso institucional para radicar solicitudes, consultar el cronograma compartido y gestionar el trabajo de TIC y Comunicaciones según permisos reales.</p>
          <div class="login-badges">
            <span class="login-badge">Login obligatorio</span>
            <span class="login-badge">Sin datos simulados</span>
            <span class="login-badge">Cronograma compartido</span>
            <span class="login-badge">Roles por Supabase</span>
          </div>
        </div>
      </div>
      <div class="login-panel">
        <form class="login-card" id="loginForm">
          <span class="tag">Alcaldía de San Pedro</span>
          <h2>Iniciar sesión</h2>
          <p>Ingresa con tu correo institucional autorizado.</p>
          <div class="field"><label for="email">Correo</label><input id="email" type="email" required autocomplete="email" placeholder="usuario@sanpedro-valle.gov.co"></div>
          <div class="field"><label for="password">Contraseña</label><input id="password" type="password" required autocomplete="current-password" placeholder="Contraseña"></div>
          <div id="loginMessage"></div>
          <button class="btn btn-primary btn-block" type="submit">Entrar a la Mesa</button>
          <button class="btn btn-google btn-block" id="googleLoginBtn" type="button"><span class="google-dot">G</span>Entrar con Google institucional</button>
          <button class="btn btn-secondary btn-block" id="resetBtn" type="button">Recuperar contraseña</button>
          <p class="help-text">También puedes entrar con Google si el proveedor está activo en Supabase y el correo pertenece al dominio institucional.</p>
        </form>
      </div>
    </section>`;
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('googleLoginBtn')?.addEventListener('click', handleGoogleLogin);
  document.getElementById('resetBtn').addEventListener('click', handleReset);
  const oauthMessage = sessionStorage.getItem('mesa_tic_oauth_error');
  if(oauthMessage){
    sessionStorage.removeItem('mesa_tic_oauth_error');
    const msg = document.getElementById('loginMessage');
    if(msg) msg.innerHTML = `<div class="error">${safe(oauthMessage)}</div>`;
  }
}
async function handleLogin(e){
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('loginMessage');
  msg.innerHTML = '<div class="warning">Validando sesión…</div>';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) msg.innerHTML = `<div class="error">${safe(error.message)}</div>`;
}
async function handleGoogleLogin(){
  const msg = document.getElementById('loginMessage');
  msg.innerHTML = '<div class="warning">Abriendo Google institucional…</div>';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: oauthRedirectUrl(),
      queryParams: { hd: 'sanpedro-valle.gov.co', prompt: 'select_account' }
    }
  });
  if(error) msg.innerHTML = `<div class="error">${safe(error.message)}</div>`;
}
async function handleReset(){
  const email = document.getElementById('email').value.trim().toLowerCase();
  const msg = document.getElementById('loginMessage');
  if(!email){ msg.innerHTML = '<div class="warning">Escribe primero el correo.</div>'; return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: oauthRedirectUrl() });
  msg.innerHTML = error ? `<div class="error">${safe(error.message)}</div>` : '<div class="success">Si la cuenta existe, se enviará el enlace de recuperación.</div>';
}
async function changeMyPassword(){
  const p1 = document.getElementById('myNewPassword')?.value || '';
  const p2 = document.getElementById('myNewPassword2')?.value || '';
  const msg = document.getElementById('myPasswordMsg');
  if(!msg) return;
  if(p1.length < 7){ msg.innerHTML = '<div class="warning">La contraseña debe tener al menos 7 caracteres.</div>'; return; }
  if(p1 !== p2){ msg.innerHTML = '<div class="warning">Las contraseñas no coinciden.</div>'; return; }
  msg.innerHTML = '<div class="warning">Actualizando contraseña…</div>';
  const { error } = await supabase.auth.updateUser({ password: p1 });
  msg.innerHTML = error ? `<div class="error">${safe(error.message)}</div>` : '<div class="success">Contraseña actualizada correctamente.</div>';
}
function renderAccessPending(){
  app.innerHTML = h`<section class="access-shell"><div class="access-card"><img src="assets/logo-san-pedro-crop.png"><h1>Acceso pendiente</h1><p>Tu sesión fue validada, pero la cuenta todavía no tiene perfil activo o rol asignado.</p><p><strong>${safe(state.user?.email)}</strong></p><button class="btn btn-primary" id="logoutPending">Cerrar sesión</button></div></section>`;
  document.getElementById('logoutPending').addEventListener('click',()=>supabase.auth.signOut());
}
function renderSystemError(err){
  app.innerHTML = h`<section class="access-shell"><div class="access-card system-error-card"><img src="assets/app-icon-192.png"><h1>No se pudo cargar la Mesa</h1><p>Revisa internet, sesión o disponibilidad de Supabase. Puedes reintentar sin cerrar sesión.</p><div class="error">${safe(err.message || err)}</div><div class="form-grid"><button class="btn btn-primary" id="retryBootBtn">Reintentar</button><button class="btn btn-secondary" id="logoutError">Cerrar sesión</button></div></div></section>`;
  document.getElementById('retryBootBtn')?.addEventListener('click',boot);
  document.getElementById('logoutError')?.addEventListener('click',()=>supabase.auth.signOut());
}

async function loadViewData(){
  const tasks = [loadTickets(), loadActivities(), loadNotifications()];
  if(isAdmin()) tasks.push(loadEmailQueue().catch(()=>{}));
  if(['knowledge','home'].includes(state.currentView)) tasks.push(loadKnowledge());
  if(['users','home','settings','reports','launch_check','schedule','new_request'].includes(state.currentView) && (hasModule('users') || isAdmin() || state.currentView==='schedule' || state.currentView==='new_request')) tasks.push(loadProfiles().catch(()=>{}));
  await Promise.all(tasks);
}
async function loadTickets(){
  const { data, error } = await supabase.from('tickets_secure').select('*').order('created_at',{ascending:false}).limit(500);
  if(error) throw error;
  state.tickets = data ?? [];
}
async function loadActivities(){
  let startDate = state.scheduleDate;
  let endDate = addDays(startDate, 1);
  if(state.scheduleMode === 'week'){
    startDate = startOfWeek(state.scheduleDate);
    endDate = addDays(startDate, 7);
  }else if(state.scheduleMode === 'month'){
    startDate = startOfMonth(state.scheduleDate);
    endDate = addMonths(startDate, 1);
  }
  const { data, error } = await supabase.from('schedule_activities_public').select('*').gte('start_at', `${startDate}T00:00:00`).lt('start_at', `${endDate}T00:00:00`).order('start_at');
  if(error) throw error;
  state.activities = data ?? [];
}
async function loadNotifications(fromPoll=false){
  const { data, error } = await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(80);
  if(error) { state.notifications=[]; return; }
  const nextRows = data ?? [];
  const fresh = detectNewNotifications(nextRows);
  state.notifications = nextRows;
  if(fresh.length && fromPoll){
    playNotificationSound();
    const first = nextRows.find(n=>fresh.includes(String(n.id)));
    toast(first?.title || 'Nueva notificación de seguimiento', 'success');
  }
}
async function loadEmailQueue(){
  if(!isAdmin()){ state.emailQueue = []; return; }
  const { data, error } = await supabase
    .from('notification_delivery_queue')
    .select('id,notification_id,profile_id,ticket_id,channel,destination,status,payload,created_at,sent_at,last_error,attempts,last_attempt_at')
    .eq('channel','email')
    .order('created_at',{ascending:false})
    .limit(80);
  if(error){ console.warn('No se pudo cargar cola de correos:', error); state.emailQueue=[]; return; }
  state.emailQueue = data ?? [];
}
async function loadKnowledge(){
  const { data, error } = await supabase.from('knowledge_articles').select('*').order('updated_at',{ascending:false}).limit(80);
  if(error) { state.articles=[]; return; }
  state.articles = data ?? [];
}
async function loadProfiles(){
  const [{ data: profiles }, { data: roles }, { data: teams }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('profile_roles').select('profile_id,role_code'),
    supabase.from('profile_teams').select('profile_id,team_code')
  ]);
  state.profiles = profiles ?? [];
  state.roleRows = roles ?? [];
  state.teamRows = teams ?? [];
}

function renderShell(){
  app.className = '';
  const navModules = orderedModules();
  app.innerHTML = h`
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="assets/logo-san-pedro-crop.png" alt="Alcaldía"><div><strong>Mesa de Ayuda TIC</strong><span>San Pedro, Valle</span></div></div>
        <div class="who-card"><strong>${safe(state.profile?.full_name || state.user.email)}</strong><span>${safe(state.user.email)}</span><span class="role-pill">${safe(roleText())}</span></div>
        <nav class="nav">${navModules.map(m=>navButton(m)).join('')}</nav>
        <div class="sidebar-footer"><button class="btn btn-secondary" id="refreshBtn">Actualizar</button><button class="btn btn-danger" id="logoutBtn">Salir</button></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <button class="btn btn-secondary btn-small mobile-toggle" id="menuBtn">☰</button>
          <div class="topbar-title"><h1>${safe(moduleLabels[state.currentView] || 'Mesa de Ayuda')}</h1><p>${safe(contextSubtitle())}</p></div>
          <form class="global-search" id="globalSearchForm"><span>${icon('search')}</span><input id="globalSearchInput" value="${safe(state.filter.globalQ)}" placeholder="Buscar solicitud, actividad, servicio…" autocomplete="off"><button type="submit">Buscar</button></form>
          <div class="top-actions">
            <button class="btn btn-soft btn-small" id="openGuideBtn"><span class="btn-mini-icon">${assetIcon('knowledge-book','Guía rápida','btn-mini-img')}</span>Guía</button>
            <button class="btn btn-soft btn-small notification-top-btn" data-jump="notifications"><span class="btn-mini-icon">${assetIcon('alerts-support','Notificaciones','btn-mini-img')}</span>Seguimiento${unreadNotifications()?`<b>${unreadNotifications()}</b>`:''}</button>
            <button class="btn btn-soft btn-small" data-jump="schedule"><span class="btn-mini-icon">${assetIcon('calendar-planner','Cronograma','btn-mini-img')}</span>Cronograma</button>
            ${isAdmin() ? `<button class="btn btn-soft btn-small drive-top-btn ${uploadEnabled()?'ok':'pending'}" data-jump="settings"><span class="btn-mini-icon">${assetIcon('workflow-settings','Drive','btn-mini-img')}</span>Drive ${uploadEnabled()?'OK':'Pendiente'}</button>` : ''}
            <button class="btn btn-soft btn-small report-issue-btn" id="reportIssueBtn"><span class="btn-mini-icon">${assetIcon('alerts-support','Error','btn-mini-img')}</span>Error</button>
            ${hasModule('new_request') ? `<button class="btn btn-primary btn-small" data-jump="new_request"><span class="btn-mini-icon">${assetIcon('ticket-service','Radicar','btn-mini-img')}</span>Radicar</button>` : ''}
          </div>
        </header>
        <section class="content">${renderView()}</section>
      </main>
    </div>${mobileTabbar()}<div class="toast-stack"></div>`;
  bindShell(); bindView();
  maybeShowOnboarding();
}
function orderedModules(){
  const base = state.modules.slice().sort((a,b)=>(a.nav_order||0)-(b.nav_order||0));
  if(isAdmin()){
    [
      { code:'reports', label:'Reportes', nav_order:86 },
      { code:'launch_check', label:'Checklist de lanzamiento', nav_order:94 },
      { code:'settings', label:'Configuración', nav_order:99 }
    ].forEach(extra=>{
      if(!base.some(m=>m.code===extra.code)) base.push(extra);
    });
  }
  return base.filter(m=>moduleLabels[m.code]).sort((a,b)=>(a.nav_order||0)-(b.nav_order||0));
}
function navButton(m){
  return `<button data-view="${safe(m.code)}" class="${state.currentView===m.code?'active':''}"><span class="nav-icon image-icon">${assetIcon(moduleAsset(m.code), moduleLabels[m.code] || m.label, 'nav-img')}</span><span>${safe(moduleLabels[m.code] || m.label)}</span>${m.code==='notifications' && unreadNotifications()?`<span class="nav-count">${unreadNotifications()}</span>`:''}</button>`;
}
function mobileTabbar(){
  const tabs = [
    ['home','Panel', 'home'],
    ['new_request','Radicar','ticket-service'],
    ['my_requests','Tickets','my_requests'],
    ['notifications','Seguimiento','alerts-support'],
    ['schedule','Agenda','calendar-planner']
  ].filter(([view])=>hasModule(view));
  return `<nav class="mobile-tabbar" aria-label="Navegación móvil">${tabs.map(([view,label,asset])=>`<button type="button" data-jump="${safe(view)}" class="${state.currentView===view?'active':''}"><span>${assetIcon(asset,label,'mobile-tab-img')}</span><strong>${safe(label)}</strong>${view==='notifications' && unreadNotifications()?`<b>${unreadNotifications()}</b>`:''}</button>`).join('')}</nav>`;
}
function openReportIssue(){
  const service = state.services.find(s=>s.code==='technical_support') || state.services.find(s=>s.team_code==='TIC') || state.services[0];
  if(!service){ toast('No hay servicios cargados para reportar el error.'); return; }
  openRequestModal(service.code);
  setTimeout(()=>toast('Describe el error de la Mesa y adjunta captura si aplica.'),120);
}
function contextSubtitle(){
  if(state.currentView === 'schedule') return `Agenda compartida · ${fmtDate(state.scheduleDate)}`;
  if(state.currentView === 'reports') return 'Indicadores visuales con datos reales de solicitudes y cronograma.';
  if(state.currentView === 'launch_check') return 'Validación visual, permisos, responsive y pruebas por rol antes de lanzamiento.';
  if(isComms()) return 'Workspace de Comunicaciones: publicaciones, cubrimientos y agenda.';
  if(hasRole('requester')) return 'Portal de funcionario solicitante.';
  if(hasRole('tic_admin') || hasRole('super_admin')) return 'Operación general, cronograma y control de solicitudes.';
  return 'Mesa institucional según permisos.';
}
function bindShell(){
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  document.querySelectorAll('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.jump)));
  document.getElementById('refreshBtn')?.addEventListener('click',guardedBoot);
  document.getElementById('logoutBtn')?.addEventListener('click',()=>supabase.auth.signOut());
  document.getElementById('menuBtn')?.addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('reportIssueBtn')?.addEventListener('click',openReportIssue);
  document.getElementById('reportIssueSettingsBtn')?.addEventListener('click',openReportIssue);
  document.getElementById('globalSearchForm')?.addEventListener('submit',async(e)=>{ e.preventDefault(); state.filter.globalQ = document.getElementById('globalSearchInput')?.value || ''; await openGlobalSearch(); });
  document.getElementById('globalSearchInput')?.addEventListener('input',e=>{ state.filter.globalQ=e.target.value; });
  document.getElementById('markNotificationsRead')?.addEventListener('click',markAllNotificationsRead);
  document.getElementById('refreshEmailQueue')?.addEventListener('click',async()=>{ await loadEmailQueue(); renderShell(); toast('Cola de correos actualizada.'); });
  document.getElementById('saveDriveUploadUrl')?.addEventListener('click',()=>{ const v = document.getElementById('driveUploadUrlInput')?.value || ''; saveDriveUploadWebAppUrl(v); toast('Conexión de Drive guardada en este navegador.'); renderShell(); });
  document.getElementById('changeMyPasswordBtn')?.addEventListener('click',changeMyPassword);
  document.querySelectorAll('[data-admin-reset-password]').forEach(btn=>btn.addEventListener('click',()=>openAdminResetPassword(btn.dataset.adminResetPassword, btn.dataset.email || '')));
}
async function setView(view){
  if(!hasModule(view)){ toast('Este módulo no está habilitado para tu usuario.'); return; }
  state.currentView = view;
  await loadViewData();
  renderShell();
}
function renderView(){
  switch(state.currentView){
    case 'home': return renderHome();
    case 'new_request': return renderNewRequest();
    case 'my_requests': return renderMyRequests();
    case 'requests': return renderRequests();
    case 'communications': return renderCommunications();
    case 'schedule': return renderSchedule();
    case 'knowledge': return renderKnowledge();
    case 'notifications': return renderNotifications();
    case 'users': return renderUsers();
    case 'imports': return renderImports();
    case 'reports': return renderReports();
    case 'launch_check': return renderLaunchChecklist();
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}

function visibleTickets(){ return state.tickets.slice(); }
function ownTickets(){ return state.tickets.filter(t=>t.requester_id === state.profile?.id); }
function openTickets(list=visibleTickets()){ return list.filter(t=>!['resolved','closed','cancelled'].includes(t.status)); }
function todayActivities(){ return state.activities.filter(a=>String(a.start_at||'').slice(0,10) === state.scheduleDate); }
function byTeam(team){ return state.tickets.filter(t=>t.assigned_team_code === team); }
function comTickets(){ return state.tickets.filter(t=>t.assigned_team_code === 'COM'); }
function ticTickets(){ return state.tickets.filter(t=>t.assigned_team_code === 'TIC'); }
function serviceName(code){ return state.services.find(s=>s.code===code)?.name || code || 'Servicio'; }
function resourceName(code){ return state.resources.find(r=>r.code===code)?.name || code || 'Sin responsable'; }
function unreadNotifications(){ return state.notifications.filter(n=>!n.read_at).length; }
function notificationSeverityClass(n){ return n.severity || (String(n.event_type||'').includes('closed') ? 'green' : String(n.event_type||'').includes('waiting') ? 'amber' : 'blue'); }
function notificationTitle(n){ return n.title || 'Notificación'; }
function notificationBody(n){ return n.body || 'Tienes una actualización de seguimiento.'; }

function ticketPayload(t){
  if(!t) return {};
  if(typeof t.payload === 'string'){
    try{ return JSON.parse(t.payload) || {}; }catch(_){ return {}; }
  }
  return t.payload || {};
}
function resourceByCode(code){ return state.resources.find(r=>r.code===code); }
function targetResourceNameFromTicket(t){
  const p = ticketPayload(t);
  const code = t.assigned_resource_code || p.target_resource_code || p.requested_resource_code || '';
  return resourceByCode(code)?.name || p.target_resource_name || 'Sin responsable definido';
}
function resourcesForService(service){
  const team = service?.team_code || 'TIC';
  const matching = state.resources.filter(r=>r.team_code===team);
  const rest = state.resources.filter(r=>r.team_code!==team);
  return [...matching, ...rest];
}
function serviceIsPresential(service){
  const hay = `${service?.code||''} ${service?.name||''} ${service?.description||''}`.toLowerCase();
  return /cubr|grab|video_recording|evento|field|soporte|equipo|internet|presencial|visita/.test(hay);
}
function estimatedMinutesFor(service, workMode='virtual', resourceCode=''){
  const hay = `${service?.code||''} ${service?.name||''}`.toLowerCase();
  let base = 90;
  if(/logo|identidad/.test(hay)) base = 420;
  else if(/campaign|campaña/.test(hay)) base = 360;
  else if(/advertising|publicidad|afiche|flyer|banner/.test(hay)) base = 180;
  else if(/basic_design|pieza rápida|básico/.test(hay)) base = 90;
  else if(/video|edición/.test(hay)) base = 300;
  else if(/grabación|recording|cubrimiento|coverage/.test(hay)) base = 180;
  else if(/publicación|redes|web|copy/.test(hay)) base = 60;
  else if(/equipment|internet|access|mail|correo|soporte/.test(hay)) base = 120;
  if(workMode === 'presencial') base += 45;
  if(workMode === 'mixto') base += 30;
  const load = workloadForResource(resourceCode).score;
  if(load >= 7) base = Math.round(base * 1.65);
  else if(load >= 4) base = Math.round(base * 1.3);
  return base;
}
function workloadForResource(resourceCode){
  if(!resourceCode) return { count:0, busyMinutes:0, score:0, label:'Sin responsable' };
  const start = new Date(`${startOfWeek(state.scheduleDate)}T00:00:00`);
  const end = new Date(`${addDays(startOfWeek(state.scheduleDate),7)}T23:59:59`);
  const acts = state.activities.filter(a=>a.resource_code===resourceCode && new Date(a.start_at)>=start && new Date(a.start_at)<=end);
  const busyMinutes = acts.reduce((sum,a)=>sum + Math.max(30, Math.round((new Date(a.end_at)-new Date(a.start_at))/60000)||60),0);
  const score = acts.length + Math.round(busyMinutes/240);
  let label = 'Disponible';
  if(score >= 7) label = 'Muy copado esta semana';
  else if(score >= 4) label = 'Carga media';
  return { count: acts.length, busyMinutes, score, label };
}
function formatDuration(minutes){
  const h = Math.floor(minutes/60), m = minutes%60;
  if(h && m) return `${h} h ${m} min`;
  if(h) return `${h} h`;
  return `${m} min`;
}
function requestAdvice(service, resourceCode, workMode){
  const load = workloadForResource(resourceCode);
  const estimated = estimatedMinutesFor(service, workMode, resourceCode);
  const needsCalendar = workMode === 'presencial' || serviceIsPresential(service);
  const warning = load.score >= 7 ? 'La persona seleccionada está muy copada esta semana. La solicitud queda radicada, pero el tiempo estimado se amplía automáticamente.' : load.score >= 4 ? 'La persona tiene carga media. Conviene revisar agenda antes de una actividad presencial.' : 'La carga luce manejable para esta semana.';
  return { load, estimated, needsCalendar, warning };
}
function renderRequestAdvisor(service, resourceCode, workMode){
  const r = resourceByCode(resourceCode);
  const advice = requestAdvice(service, resourceCode, workMode);
  return `<div class="smart-advisor ${advice.load.score>=7?'danger':advice.load.score>=4?'warning':'ok'}">
    <div class="smart-advisor-head"><span>${assetIcon('calendar-planner','Agenda','btn-mini-img')}</span><strong>${safe(r?.name || 'Responsable por definir')}</strong><em>${safe(advice.load.label)}</em></div>
    <div class="smart-advisor-grid">
      <div><small>Actividades semana</small><b>${advice.load.count}</b></div>
      <div><small>Tiempo ocupado</small><b>${formatDuration(advice.load.busyMinutes)}</b></div>
      <div><small>Estimado solicitud</small><b>${formatDuration(advice.estimated)}</b></div>
      <div><small>Tipo</small><b>${advice.needsCalendar?'requiere agenda':'virtual / estimación'}</b></div>
    </div>
    <p>${safe(advice.warning)}</p>
    ${advice.needsCalendar?'<p class="smart-note">Para uso presencial, revisa el cronograma y selecciona fecha/hora preferida. Si hay ocupación, el gestor podrá reprogramar.</p>':'<p class="smart-note">Para diseño o trabajo virtual, se registra tiempo estimado; si hay alta carga, el plazo se amplía sin bloquear la radicación.</p>'}
  </div>`;
}

function renderHome(){
  if(hasRole('requester') && !canManageRequests()) return renderRequesterHome();
  if(isComms()) return renderCommsHome();
  return renderAdminHome();
}
function renderRequesterHome(){
  const own = ownTickets();
  return h`
    <div class="hero"><h2>Hola, ${safe(firstName())}</h2><p>Desde aquí puedes radicar solicitudes, consultar tus casos y revisar el cronograma institucional de TIC y Comunicaciones.</p><div class="hero-actions"><button class="btn btn-secondary premium-btn" data-jump="new_request"><span class="btn-mini-icon">${assetIcon('ticket-service','Nueva solicitud','btn-mini-img')}</span>Nueva solicitud</button><button class="btn btn-secondary premium-btn" data-jump="my_requests"><span class="btn-mini-icon">${assetIcon('role-funcionario','Mis solicitudes','btn-mini-img')}</span>Ver mis solicitudes</button><button class="btn btn-secondary" data-jump="schedule"><span class="btn-mini-icon">${assetIcon('calendar-planner','Cronograma','btn-mini-img')}</span>Cronograma</button></div></div>
    <div class="grid grid-3">
      ${metric('Mis solicitudes abiertas', openTickets(own).length, 'Casos que aún están activos', 'blue', 'ticket-service')}
      ${metric('Resueltas', own.filter(t=>['resolved','closed'].includes(t.status)).length, 'Solicitudes solucionadas', 'green', 'workflow-settings')}
      ${metric('Actividades hoy', todayActivities().length, 'Agenda compartida', 'violet', 'calendar-planner')}
    </div>
    <div class="grid grid-main">
      <div class="card"><div class="section-title"><div><h2>Mis solicitudes recientes</h2><p>Solo aparecen los casos radicados por tu usuario.</p></div><button class="btn btn-soft btn-small" data-jump="my_requests">Abrir</button></div>${ticketCompactList(own.slice(0,6),'Aún no has radicado solicitudes.')}</div>
      <div class="card"><div class="section-title"><div><h2>Agenda de hoy</h2><p>Administrador TIC y Comunicadores.</p></div></div>${activityCompactList(todayActivities().slice(0,6))}</div>
    </div>`;
}
function renderCommsHome(){
  const list = comTickets();
  return h`
    <div class="hero"><span class="tag">Comunicaciones</span><h2>Publicaciones y cubrimientos</h2><p>Gestiona únicamente las solicitudes dirigidas a Comunicaciones y consulta la agenda compartida de los tres responsables.</p><div class="hero-actions"><button class="btn btn-secondary premium-btn" data-jump="communications"><span class="btn-mini-icon">${assetIcon('role-comunicaciones','Comunicaciones','btn-mini-img')}</span>Ir a Comunicaciones</button><button class="btn btn-secondary premium-btn" data-jump="schedule"><span class="btn-mini-icon">${assetIcon('calendar-planner','Cronograma','btn-mini-img')}</span>Cronograma</button></div></div>
    <div class="grid grid-4">
      ${metric('Solicitudes COM', list.length, 'Visibles por tu equipo', 'blue', 'conversation-support')}
      ${metric('Publicaciones', list.filter(t=>t.service_code==='publication_request').length, 'Solicitudes de publicación', 'red', 'dashboard-analytics')}
      ${metric('Cubrimientos', list.filter(t=>t.service_code==='coverage_request').length, 'Fotografía, video o campo', 'violet', 'conversation-support')}
      ${metric('Hoy en agenda', todayActivities().filter(a=>['publication','coverage','event'].includes(a.kind)).length, 'Actividades programadas', 'green', 'calendar-planner')}
    </div>
    <div class="grid grid-main"><div class="card">${renderQueuePreview(list,'Trabajo pendiente de Comunicaciones')}</div><div class="card"><div class="section-title"><div><h2>Agenda COM</h2><p>Publicaciones, cubrimientos y eventos.</p></div></div>${activityCompactList(todayActivities().filter(a=>['publication','coverage','event'].includes(a.kind)).slice(0,6))}</div></div>`;
}
function renderAdminHome(){
  const all = visibleTickets();
  const open = openTickets(all);
  const today = todayActivities();
  return h`
    <section class="dashboard-hero-pro">
      <div class="dashboard-copy">
        <span class="tag">Centro de mando visual</span>
        <h2>Operación institucional en una sola vista</h2>
        <p>Gestiona solicitudes, agenda, comunicaciones y usuarios con una experiencia más clara, colorida y cómoda para trabajar durante todo el día.</p>
        <div class="hero-actions">
          <button class="btn btn-primary premium-btn" data-jump="requests"><span class="btn-mini-icon">${assetIcon('workflow-settings','Bandeja','btn-mini-img')}</span>Abrir bandeja</button>
          <button class="btn btn-secondary premium-btn" data-jump="schedule"><span class="btn-mini-icon">${assetIcon('calendar-planner','Cronograma','btn-mini-img')}</span>Ir al cronograma</button>
          <button class="btn btn-secondary premium-btn" data-jump="reports"><span class="btn-mini-icon">${assetIcon('dashboard-analytics','Reportes','btn-mini-img')}</span>Reportes</button>
          <button class="btn btn-secondary premium-btn" data-jump="settings"><span class="btn-mini-icon">${assetIcon('workflow-settings','Drive','btn-mini-img')}</span>Conectar Drive</button>
          ${hasModule('users')?`<button class="btn btn-secondary premium-btn" data-jump="users"><span class="btn-mini-icon">${assetIcon('user-security','Usuarios','btn-mini-img')}</span>Usuarios</button>`:''}
        </div>
      </div>
      <div class="dashboard-visual-card">
        ${assetIcon(hasRole('super_admin')?'role-cio-tic':'dashboard-analytics','Panel de mando','dashboard-hero-img')}
        <div class="pulse-row"><span>Hoy</span><strong>${today.length}</strong><small>actividades</small></div>
        <div class="pulse-row"><span>Abiertas</span><strong>${open.length}</strong><small>solicitudes</small></div>
      </div>
    </section>
    <div class="grid grid-4 compact-metrics">
      ${metric('Solicitudes visibles', all.length, 'Según permisos y equipo', 'blue', 'dashboard-analytics')}
      ${metric('Abiertas', open.length, 'Pendientes de gestión', 'amber', 'alerts-support')}
      ${metric('TIC', byTeam('TIC').length, 'Soporte tecnológico', 'green', 'headset-support')}
      ${metric('Comunicaciones', byTeam('COM').length, 'Publicaciones y cubrimientos', 'red', 'conversation-support')}
    </div>
    <div class="grid grid-main dashboard-grid-pro">
      <div class="card command-card"><div class="section-title"><div><h2>Radar operativo</h2><p>Lectura rápida de estado, equipos y solicitudes.</p></div></div>${renderDashboardRadar(all)}</div>
      <div class="card today-card"><div class="section-title"><div><h2>Hoy en agenda</h2><p>Actividades reales del cronograma compartido.</p></div><button class="btn btn-soft btn-small" data-jump="schedule">Ver agenda</button></div>${activityCompactList(today.slice(0,8))}</div>
    </div>
    <div class="grid grid-main dashboard-grid-pro">
      <div class="card"><div class="section-title"><div><h2>Distribución de solicitudes</h2><p>Gráfica con datos reales cargados desde Supabase.</p></div><button class="btn btn-soft btn-small" data-jump="reports">Abrir reportes</button></div>${renderBarChart(ticketChartRows())}</div>
      <div class="card quick-launch-card"><div class="section-title"><div><h2>Acciones rápidas</h2><p>Accesos para operar sin perder contexto.</p></div></div>${renderQuickLaunch()}</div>
    </div>
    <div class="card ticket-premium-card">${renderQueuePreview(all,'Últimas solicitudes')}</div>`;
}
function renderDashboardRadar(list){
  const rows = [
    ['Nuevas', list.filter(t=>t.status==='new').length, 'ticket-service'],
    ['En gestión', list.filter(t=>t.status==='in_progress').length, 'workflow-settings'],
    ['Esperando', list.filter(t=>t.status==='waiting_user').length, 'alerts-support'],
    ['Programadas', list.filter(t=>t.status==='scheduled').length, 'calendar-planner']
  ];
  if(rows.every(r=>r[1]===0)) return emptyState('Sin movimiento todavía','Cuando entren solicitudes reales, este radar se actualizará automáticamente.');
  const max = Math.max(1,...rows.map(r=>r[1]));
  return `<div class="radar-list">${rows.map(([label,val,asset])=>`<div class="radar-item"><div class="radar-img">${assetIcon(asset,label,'radar-icon-img')}</div><div><strong>${safe(label)}</strong><span>${val} registros</span></div><div class="radar-track"><i style="width:${Math.max(8,Math.round(val/max*100))}%"></i></div></div>`).join('')}</div>`;
}
function renderQuickLaunch(){
  const actions = [
    ['Nueva solicitud','new_request','ticket-service'],
    ['Bandeja','requests','workflow-settings'],
    ['Cronograma','schedule','calendar-planner'],
    ['Reportes','reports','dashboard-analytics'],
    ['Conectar Drive','settings','workflow-settings']
  ].filter(a=>hasModule(a[1]));
  return `<div class="quick-launch-grid">${actions.map(([label,view,asset])=>`<button class="quick-launch" data-jump="${view}">${assetIcon(asset,label,'quick-launch-img')}<strong>${safe(label)}</strong><span>Abrir módulo</span></button>`).join('')}</div>`;
}
function firstName(){ return (state.profile?.full_name || state.user?.email || '').split(' ')[0] || 'Funcionario'; }
function metric(label,value,hint,variant='blue',asset='dashboard-analytics'){ return `<div class="card metric ${variant}"><div class="metric-asset">${assetIcon(asset, label, 'metric-img')}</div><div class="label">${safe(label)}</div><div class="value">${Number(value)||0}</div><div class="hint">${safe(hint)}</div></div>`; }
function ticketChartRows(){
  return [
    ['TIC', byTeam('TIC').length],
    ['Comunicaciones', byTeam('COM').length],
    ['Abiertas', openTickets().length],
    ['Resueltas', visibleTickets().filter(t=>['resolved','closed'].includes(t.status)).length],
    ['Críticas', visibleTickets().filter(t=>t.priority==='critical').length]
  ];
}
function renderBarChart(rows){
  const max = Math.max(...rows.map(r=>r[1]), 1);
  if(rows.every(r=>r[1]===0)) return emptyState('Sin datos para graficar','Cuando se radiquen solicitudes reales, la gráfica se actualizará automáticamente.');
  return `<div class="chart">${rows.map(([label,val])=>`<div class="bar-row"><div class="bar-label">${safe(label)}</div><div class="bar-track"><div class="bar-fill" style="--w:${Math.max(5,Math.round((val/max)*100))}%"></div></div><div class="bar-value">${val}</div></div>`).join('')}</div>`;
}
function ticketCompactList(list, emptyMessage='No hay solicitudes en esta vista.'){ if(!list.length) return emptyState('Sin solicitudes', emptyMessage); return `<div class="compact-list">${list.map(t=>`<div class="compact-item ticket-row" data-open-ticket="${t.id}"><div><strong>${safe(t.title)}</strong><div class="ticket-meta">${safe(t.ticket_number)} · ${safe(serviceName(t.service_code))}</div></div><span class="pill ${t.assigned_team_code==='COM'?'com':'tic'}">${safe(t.assigned_team_code)}</span></div>`).join('')}</div>`; }
function activityCompactList(list){ if(!list.length) return emptyState('Cronograma vacío','No hay actividades reales programadas para esta fecha.'); return `<div class="compact-list">${list.map(a=>`<button type="button" class="compact-item activity-clickable" data-activity-id="${safe(a.id)}"><span class="activity-row-icon ${safe(a.kind)}">${icon(a.kind)}</span><div><strong>${safe(a.title)}</strong><div class="ticket-meta">${fmtTime(a.start_at)}–${fmtTime(a.end_at)} · ${safe(resourceName(a.resource_code))}</div></div><span class="pill">${safe(kindLabels[a.kind]||a.kind)}</span></button>`).join('')}</div>`; }
function emptyState(title, text){
  return `<div class="empty enhanced-empty"><div class="empty-asset">${assetIcon('ticket-service',title,'empty-img')}</div><strong>${safe(title)}</strong><p>${safe(text)}</p><span class="empty-hint">La Mesa está lista para funcionar con datos reales.</span></div>`;
}


function renderNewRequest(){
  const grouped = groupServices();
  return h`
    <section class="request-hero-pro">
      <div><span class="tag">Radicación guiada</span><h2>¿Qué necesitas solicitar?</h2><p>Elige una tarjeta. La Mesa enviará automáticamente tu solicitud al equipo correspondiente sin mostrarte módulos que no necesitas.</p></div>
      <div class="request-hero-art">${assetIcon('ticket-service','Nueva solicitud','module-hero-img')}</div>
    </section>
    ${Object.entries(grouped).map(([team, categories])=>`
      <section class="card service-team-section ${team==='COM'?'com':'tic'}">
        <div class="section-title"><div><span class="tag">${safe(teamTitle(team))}</span><h2>${safe(teamTitle(team))}</h2><p>${safe(teamDescription(team))}</p></div></div>
        ${team==='COM' ? `<div class="category-suggestions">${recommendedCommunicationCategories().map(x=>`<span>${safe(x)}</span>`).join('')}</div>` : ''}
        ${Object.entries(categories).map(([category, services])=>`
          <div class="service-category-block"><div class="category-title"><strong>${safe(category)}</strong><span>${services.length} servicio${services.length===1?'':'s'}</span></div><div class="service-grid premium-services">${services.map(s=>serviceCard(s)).join('')}</div></div>
        `).join('')}
      </section>`).join('')}`;
}
function groupServices(){
  return state.services.reduce((acc,s)=>{
    const team = s.team_code || 'TIC';
    const category = serviceCategory(s);
    ((acc[team] ||= {})[category] ||= []).push(s);
    return acc;
  }, {});
}
function serviceCard(s){
  const cls = s.team_code === 'COM' ? 'com' : 'tic';
  const category = serviceCategory(s);
  return `<button class="service-card premium-service ${cls}" data-service="${safe(s.code)}"><div class="service-icon image-icon">${assetIcon(serviceAsset(s), s.name, 'service-img')}</div><div class="service-copy"><span class="service-category-chip">${safe(category)}</span><strong>${safe(s.name)}</strong><p>${safe(s.description || 'Servicio habilitado para solicitudes institucionales.')}</p></div><span class="pill ${cls}">${safe(s.team_code)}</span></button>`;
}

function renderMyRequests(){ return renderTicketListPage(ownTickets(), 'Mis solicitudes', 'Consulta el estado y las respuestas de lo que has radicado.', false); }
function renderRequests(){ return renderTicketListPage(filteredTickets(visibleTickets()), isComms()?'Solicitudes autorizadas':'Bandeja general', 'Filtra, revisa y gestiona solicitudes según el equipo autorizado.', true); }
function renderTicketListPage(list,title,subtitle,operational){
  const asset = operational ? 'workflow-settings' : 'ticket-service';
  return h`
    <section class="module-hero compact-hero">
      <div>
        <span class="tag">${operational?'Workbench':'Portal personal'}</span>
        <h2>${safe(title)}</h2>
        <p>${safe(subtitle)}</p>
      </div>
      <div class="module-hero-art">${assetIcon(asset,title,'module-hero-img')}</div>
    </section>
    <div class="grid grid-4 compact-metrics">
      ${metric('Total', list.length, 'Registros en esta vista', 'blue', 'ticket-service')}
      ${metric('Abiertas', openTickets(list).length, 'Pendientes de gestión', 'amber', 'alerts-support')}
      ${metric('Programadas', list.filter(t=>t.status==='scheduled').length, 'Con agenda asociada', 'violet', 'calendar-planner')}
      ${metric('Resueltas', list.filter(t=>['resolved','closed'].includes(t.status)).length, 'Finalizadas', 'green', 'workflow-settings')}
    </div>
    <div class="card workbench-card">
      <div class="section-title"><div><h2>${safe(title)}</h2><p>${safe(subtitle)}</p></div><div class="tabs"><button class="tab ${state.ticketView==='list'?'active':''}" data-ticket-view="list">Lista</button><button class="tab ${state.ticketView==='board'?'active':''}" data-ticket-view="board">Tablero</button></div></div>
      ${operational ? renderTicketFilters() : ''}
      ${state.ticketView==='board' ? renderTicketBoard(list) : renderTicketTable(list, operational)}
    </div>`;
}
function filteredTickets(base){
  return base.filter(t=>{
    const q = state.filter.q.trim().toLowerCase();
    return (state.filter.status==='all'||t.status===state.filter.status)
      && (state.filter.team==='all'||t.assigned_team_code===state.filter.team)
      && (state.filter.service==='all'||t.service_code===state.filter.service)
      && (!q || `${t.ticket_number} ${t.title} ${t.description} ${t.service_name}`.toLowerCase().includes(q));
  });
}
function renderTicketFilters(){
  const serviceOptions = [...new Set(state.tickets.map(t=>t.service_code).filter(Boolean))];
  return `<div class="filters" style="margin-bottom:16px">
    <select class="chip" id="filterStatus"><option value="all">Todos los estados</option>${statusFlow.map(s=>`<option value="${s}" ${state.filter.status===s?'selected':''}>${statusLabels[s]}</option>`).join('')}</select>
    <select class="chip" id="filterTeam"><option value="all">Todos los equipos</option><option value="TIC" ${state.filter.team==='TIC'?'selected':''}>TIC</option><option value="COM" ${state.filter.team==='COM'?'selected':''}>Comunicaciones</option></select>
    <select class="chip" id="filterService"><option value="all">Todos los servicios</option>${serviceOptions.map(s=>`<option value="${safe(s)}" ${state.filter.service===s?'selected':''}>${safe(serviceName(s))}</option>`).join('')}</select>
    <input class="chip" id="filterQ" placeholder="Buscar solicitud" value="${safe(state.filter.q)}">
  </div>`;
}
function renderTicketTable(list, operational){
  if(!list.length) return emptyState('No hay solicitudes','Cuando existan solicitudes reales, aparecerán en esta bandeja.');
  return `<div class="table-wrap"><table><thead><tr><th>Radicado</th><th>Solicitud</th><th>Servicio</th><th>Equipo</th><th>Estado</th><th>Prioridad</th><th>Fecha</th>${operational?'<th>Acción</th>':''}</tr></thead><tbody>${list.map(t=>`<tr class="ticket-row" data-open-ticket="${t.id}"><td><strong>${safe(t.ticket_number)}</strong></td><td><div class="ticket-title">${safe(t.title)}</div><div class="ticket-meta">${safe(t.description).slice(0,120)}</div></td><td>${safe(serviceName(t.service_code))}</td><td><span class="pill ${t.assigned_team_code==='COM'?'com':'tic'}">${safe(t.assigned_team_code)}</span></td><td><span class="pill ${statusPill(t.status)}"><span class="status-dot ${t.status}"></span>${safe(statusLabels[t.status]||t.status)}</span></td><td><span class="pill ${priorityPill(t.priority)}">${safe(priorityLabels[t.priority]||t.priority)}</span></td><td>${fmtDateTime(t.created_at)}</td>${operational?`<td><button class="btn btn-soft btn-small" data-open-ticket="${t.id}">Abrir</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function renderTicketBoard(list){
  const lanes = ['new','in_progress','waiting_user','scheduled','resolved'];
  if(!list.length) return emptyState('No hay solicitudes','Aún no hay solicitudes para mostrar en tablero.');
  return `<div class="kanban">${lanes.map(status=>`<div class="lane"><div class="lane-head"><span>${safe(statusLabels[status])}</span><span class="pill">${list.filter(t=>t.status===status).length}</span></div>${list.filter(t=>t.status===status).map(t=>`<div class="ticket-card" data-open-ticket="${t.id}"><strong>${safe(t.title)}</strong><p>${safe(t.ticket_number)} · ${safe(serviceName(t.service_code))}</p><div style="margin-top:10px"><span class="pill ${t.assigned_team_code==='COM'?'com':'tic'}">${safe(t.assigned_team_code)}</span></div></div>`).join('') || '<div class="empty"><strong>Sin casos</strong><p>No hay solicitudes en este estado.</p></div>'}</div>`).join('')}</div>`;
}
function statusPill(s){ return ['resolved','closed'].includes(s)?'green':s==='waiting_user'?'amber':s==='cancelled'?'red':'gray'; }
function priorityPill(p){ return p==='critical'?'red':p==='high'?'amber':p==='low'?'gray':'green'; }

function renderCommunications(){
  const pubs = comTickets().filter(t=>t.service_code==='publication_request');
  const covs = comTickets().filter(t=>t.service_code==='coverage_request');
  const agenda = todayActivities().filter(a=>['publication','coverage','event'].includes(a.kind));
  return h`
    <section class="module-hero communications-hero">
      <div><span class="tag">Workspace COM</span><h2>Comunicaciones</h2><p>Publicaciones, cubrimientos y agenda de campo en una experiencia visual y rápida.</p><div class="hero-actions"><button class="btn btn-primary premium-btn" data-new-activity="coverage"><span class="btn-mini-icon">${assetIcon('conversation-support','Actividad','btn-mini-img')}</span>Crear actividad</button><button class="btn btn-secondary premium-btn" data-jump="schedule"><span class="btn-mini-icon">${assetIcon('calendar-planner','Cronograma','btn-mini-img')}</span>Cronograma</button></div></div>
      <div class="module-hero-art">${assetIcon('role-comunicaciones','Comunicaciones','module-hero-img')}</div>
    </section>
    <div class="grid grid-4 compact-metrics">
      ${metric('Publicaciones', pubs.length, 'Solicitudes dirigidas a publicación', 'red', 'dashboard-analytics')}
      ${metric('Cubrimientos', covs.length, 'Agenda de campo y medios', 'violet', 'conversation-support')}
      ${metric('Pendientes COM', openTickets(comTickets()).length, 'Trabajo abierto', 'amber', 'alerts-support')}
      ${metric('Agenda COM hoy', agenda.length, 'Actividades programadas', 'green', 'calendar-planner')}
    </div>
    <div class="split-view communications-split">
      <div class="grid">
        <div class="card workbench-card"><div class="section-title"><div><h2>Publicaciones</h2><p>Solicitudes para redes, web y canales oficiales.</p></div></div>${renderTicketTable(pubs,true)}</div>
        <div class="card workbench-card"><div class="section-title"><div><h2>Cubrimientos</h2><p>Solicitudes de fotografía, video, eventos y campo.</p></div></div>${renderTicketTable(covs,true)}</div>
      </div>
      <div class="card today-card"><div class="section-title"><div><h2>Agenda de comunicaciones</h2><p>Eventos, publicaciones y cubrimientos.</p></div><button class="btn btn-primary btn-small" data-new-activity="coverage">Nueva actividad</button></div>${activityCompactList(state.activities.filter(a=>['publication','coverage','event'].includes(a.kind)).slice(0,10))}</div>
    </div>`;
}
function renderSchedule(){
  const visible = visibleActivities();
  const today = visible.filter(a=>String(a.start_at||'').slice(0,10) === state.scheduleDate);
  const next = [...visible].sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)).slice(0,6);
  const activeResources = resourcesForCalendar();
  return h`
    <div class="schedule-pro-hero">
      <div>
        <span class="tag">Agenda colaborativa</span>
        <h2>Cronograma institucional</h2>
        <p>Agenda compartida estilo Teams para Administrador TIC, Comunicador Social 1 y Comunicador Social 2. Todos los usuarios autenticados pueden registrar actividades reales.</p>
      </div>
      <div class="schedule-hero-actions">
        <button class="btn btn-secondary" data-new-activity="support">${icon('plus')} Crear actividad</button>
        <button class="btn btn-soft" data-today>Hoy</button>
      </div>
    </div>
    <div class="grid grid-4">
      ${metric('Actividades', visible.length, state.scheduleMode==='month'?'Este mes':state.scheduleMode==='week'?'Esta semana':'Este día', 'blue', 'calendar-planner')}
      ${metric('Eventos', visible.filter(a=>a.kind==='event').length, 'Agenda institucional', 'amber', 'calendar-planner')}
      ${metric('Cubrimientos', visible.filter(a=>a.kind==='coverage').length, 'Campo / registro', 'violet', 'conversation-support')}
      ${metric('Publicaciones', visible.filter(a=>a.kind==='publication').length, 'Redes / web', 'red', 'dashboard-analytics')}
    </div>
    <div class="schedule-workspace">
      <aside class="schedule-side card">
        <div class="calendar-mini-pro">
          <div class="month"><button class="btn btn-secondary btn-small" data-date-move="${state.scheduleMode==='month'?-30:-1}">‹</button><span>${state.scheduleMode==='month'?safe(monthName(state.scheduleDate)):safe(fmtDate(state.scheduleDate))}</span><button class="btn btn-secondary btn-small" data-date-move="${state.scheduleMode==='month'?30:1}">›</button></div>
          ${renderMiniMonth()}
        </div>
        <div class="filters vertical-filters">
          <button class="chip ${state.scheduleMode==='day'?'active':''}" data-schedule-mode="day">Día</button>
          <button class="chip ${state.scheduleMode==='week'?'active':''}" data-schedule-mode="week">Semana</button>
          <button class="chip ${state.scheduleMode==='month'?'active':''}" data-schedule-mode="month">Mes</button>
        </div>
        <div class="field"><label>Responsable</label><select id="resourceFilter"><option value="all">Todos</option>${state.resources.map(r=>`<option value="${safe(r.code)}" ${state.filter.resource===r.code?'selected':''}>${safe(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo de actividad</label><select id="kindFilter"><option value="all">Todas</option>${kindOptions.map(k=>`<option value="${k}" ${state.filter.kind===k?'selected':''}>${kindLabels[k]}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="activitySearch" placeholder="Buscar título, lugar o nota" value="${safe(state.filter.activityQ)}"></div>
        <div class="quick-template-grid">
          ${kindOptions.map(k=>`<button class="template-card ${k}" data-new-activity="${k}"><span>${icon(k)}</span><strong>${kindLabels[k]}</strong></button>`).join('')}
        </div>
      </aside>
      <section class="agenda-pro card flush">
        <div class="agenda-toolbar pro">
          <div><strong>${state.scheduleMode==='month'?safe(monthName(state.scheduleDate)):state.scheduleMode==='week'?`Semana de ${safe(fmtShortDate(startOfWeek(state.scheduleDate)))}`:safe(fmtDate(state.scheduleDate))}</strong><br><span class="muted">${activeResources.length} responsables visibles · ${visible.length} actividades reales</span></div>
          <div class="resource-strip">${state.resources.map(r=>`<button class="resource-chip ${state.filter.resource===r.code?'active':''}" data-resource-quick="${safe(r.code)}"><span>${safe(r.initials||r.name.slice(0,2))}</span><strong>${safe(r.name)}</strong></button>`).join('')}</div>
        </div>
        ${state.scheduleMode==='month' ? renderMonthSchedule(activeResources) : renderAgendaTimeline(activeResources)}
      </section>
    </div>
    <div class="grid grid-main">
      <div class="card"><div class="section-title"><div><h2>Próximas actividades</h2><p>Lista rápida para no perder contexto operativo.</p></div></div>${activityListRich(next)}</div>
      <div class="card"><div class="section-title"><div><h2>Resumen por responsable</h2><p>Carga del cronograma actual.</p></div></div>${resourceLoadSummary(visible)}</div>
    </div>`;
}
function resourcesForCalendar(){
  return state.filter.resource === 'all' ? state.resources : state.resources.filter(r=>r.code===state.filter.resource);
}
function visibleActivities(){
  const q = String(state.filter.activityQ||'').trim().toLowerCase();
  return state.activities.filter(a=>{
    if(state.filter.resource !== 'all' && a.resource_code !== state.filter.resource) return false;
    if(state.filter.kind !== 'all' && a.kind !== state.filter.kind) return false;
    if(!q) return true;
    return `${a.title||''} ${a.description||''} ${a.location||''} ${a.resource_name||''}`.toLowerCase().includes(q);
  });
}
function renderMiniMonth(){
  const start = startOfMonth(state.scheduleDate);
  const first = new Date(`${start}T12:00:00`);
  const offset = (first.getDay()+6)%7;
  const gridStart = addDays(start, -offset);
  const cells = Array.from({length:42},(_,i)=>addDays(gridStart,i));
  const currentMonth = start.slice(0,7);
  return `<div class="mini-grid pro"><span class="dow">L</span><span class="dow">M</span><span class="dow">M</span><span class="dow">J</span><span class="dow">V</span><span class="dow">S</span><span class="dow">D</span>${cells.map(d=>`<button class="${d===state.scheduleDate?'active':''} ${d.slice(0,7)!==currentMonth?'outside':''}" data-set-date="${d}">${Number(d.slice(8,10))}</button>`).join('')}</div>`;
}
function renderAgendaTimeline(resources){
  const dates = state.scheduleMode === 'week' ? Array.from({length:7},(_,i)=>addDays(startOfWeek(state.scheduleDate),i)) : [state.scheduleDate];
  const times = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
  if(!resources.length) return emptyState('Sin responsables visibles','Ajusta el filtro para ver el cronograma.');
  return `<div class="agenda-scroll"><div class="agenda-grid-pro" style="grid-template-columns:110px repeat(${resources.length}, minmax(280px,1fr));">
    <div class="agenda-head time-head">${state.scheduleMode==='week'?'Día / hora':'Hora'}</div>${resources.map(r=>`<div class="agenda-head resource-head"><span class="avatar">${safe(r.initials||r.name.slice(0,2))}</span><div><strong>${safe(r.name)}</strong><small>${safe(r.role_label)}</small></div></div>`).join('')}
    ${dates.map(date=>times.map(time=>`<div class="agenda-time-pro"><strong>${state.scheduleMode==='week'?fmtShortDate(date):time}</strong>${state.scheduleMode==='week'?`<small>${time}</small>`:''}</div>${resources.map(r=>`<div class="agenda-dropzone" data-new-activity="support" data-resource="${safe(r.code)}" data-date="${date}" data-time="${time}">${renderActivitiesForCellPro(r.code,date,time)}</div>`).join('')}`).join('')).join('')}
  </div></div>`;
}
function renderMonthSchedule(resources){
  const start = startOfMonth(state.scheduleDate);
  const end = endOfMonth(state.scheduleDate);
  const first = new Date(`${start}T12:00:00`);
  const offset = (first.getDay()+6)%7;
  const gridStart = addDays(start, -offset);
  const cells = Array.from({length:42},(_,i)=>addDays(gridStart,i));
  const currentMonth = start.slice(0,7);
  return `<div class="month-board"><div class="month-dow">Lunes</div><div class="month-dow">Martes</div><div class="month-dow">Miércoles</div><div class="month-dow">Jueves</div><div class="month-dow">Viernes</div><div class="month-dow">Sábado</div><div class="month-dow">Domingo</div>${cells.map(d=>`<div class="month-cell ${d.slice(0,7)!==currentMonth?'outside':''} ${d===state.scheduleDate?'today':''}" data-new-activity="support" data-date="${d}" data-time="08:00"><div class="month-number">${Number(d.slice(8,10))}</div>${monthActivities(d,resources).slice(0,4).map(activityCardMini).join('')}${monthActivities(d,resources).length>4?`<button class="more-day" data-set-date="${d}" data-schedule-mode="day">+${monthActivities(d,resources).length-4} más</button>`:''}</div>`).join('')}</div>`;
}
function monthActivities(date, resources){
  const resourceCodes = new Set(resources.map(r=>r.code));
  return visibleActivities().filter(a=>String(a.start_at||'').slice(0,10)===date && resourceCodes.has(a.resource_code)).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
}
function renderActivitiesForCellPro(resource,date,time){
  const list = visibleActivities().filter(a=>{
    if(a.resource_code !== resource) return false;
    if(String(a.start_at).slice(0,10) !== date) return false;
    const hour = Number(String(a.start_at).slice(11,13));
    const slotHour = Number(time.slice(0,2));
    return hour === slotHour;
  });
  if(!list.length) return '<span class="drop-hint">+ agregar</span>';
  return list.map(activityCard).join('');
}
function activityCard(a){
  return `<article class="activity-card ${safe(a.kind)}" data-activity-id="${safe(a.id)}"><div class="activity-icon">${icon(a.kind)}</div><div><strong>${safe(a.title)}</strong><span>${fmtTime(a.start_at)}–${fmtTime(a.end_at)} · ${safe(kindLabels[a.kind]||a.kind)}</span>${a.location?`<em>${safe(a.location)}</em>`:''}</div></article>`;
}
function activityCardMini(a){
  return `<button type="button" class="month-activity ${safe(a.kind)}" data-activity-id="${safe(a.id)}"><span>${fmtTime(a.start_at)}</span><strong>${safe(a.title)}</strong></button>`;
}
function activityListRich(list){
  if(!list.length) return emptyState('Sin actividades próximas','Crea actividades desde el cronograma; todos los usuarios autenticados pueden proponer y registrar actividades.');
  return `<div class="activity-list-rich">${list.map(a=>`<button type="button" class="activity-row-rich activity-clickable ${safe(a.kind)}" data-activity-id="${safe(a.id)}"><span class="activity-row-icon">${icon(a.kind)}</span><div><strong>${safe(a.title)}</strong><p>${safe(resourceName(a.resource_code))} · ${fmtDateTime(a.start_at)}${a.location?` · ${safe(a.location)}`:''}</p></div><span class="pill">${safe(kindLabels[a.kind]||a.kind)}</span></button>`).join('')}</div>`;
}
function resourceLoadSummary(list){
  if(!state.resources.length) return emptyState('Sin recursos','Todavía no hay responsables configurados.');
  const max = Math.max(1,...state.resources.map(r=>list.filter(a=>a.resource_code===r.code).length));
  return `<div class="resource-load">${state.resources.map(r=>{ const count=list.filter(a=>a.resource_code===r.code).length; return `<div class="load-row"><div><strong>${safe(r.name)}</strong><span>${count} actividades</span></div><div class="load-track"><i style="width:${Math.round(count/max*100)}%"></i></div></div>`; }).join('')}</div>`;
}
function renderKnowledge(){
  return h`<div class="card"><div class="section-title"><div><h2>Centro de ayuda</h2><p>Guías institucionales publicadas. Si está vacío, puedes iniciar cargando artículos desde Supabase.</p></div></div>${state.articles.length?`<div class="grid grid-3">${state.articles.map(a=>`<article class="card"><span class="pill">${safe(a.category||'General')}</span><h3>${safe(a.title)}</h3><p class="muted">${safe((a.body||'').slice(0,180))}</p></article>`).join('')}</div>`:emptyState('Centro de ayuda vacío','Todavía no hay artículos publicados.')}</div>`;
}
function renderNotifications(){
  const unread = unreadNotifications();
  return `<div class="tracking-page"><div class="card notification-center"><div class="section-title"><div><h2>Centro de seguimiento</h2><p>Notificaciones internas de radicación, avances, resolución y cierre de solicitudes.</p></div>${state.notifications.length?`<button class="btn btn-soft btn-small" id="markNotificationsRead">Marcar todo como leído</button>`:''}</div>${unread?`<div class="tracking-callout"><strong>${unread} seguimiento${unread===1?'':'s'} pendiente${unread===1?'':'s'}</strong><span>Revisa las solicitudes actualizadas para mantener trazabilidad.</span></div>`:''}${state.notifications.length?`<div class="notification-list">${state.notifications.map(n=>`<button type="button" class="notification-item ${n.read_at?'read':'unread'} ${safe(notificationSeverityClass(n))}" data-notification-id="${safe(n.id)}" ${n.ticket_id?`data-open-ticket="${safe(n.ticket_id)}"`:''}><span class="notification-dot"></span><div><strong>${safe(notificationTitle(n))}</strong><p>${safe(notificationBody(n))}</p><small>${fmtDateTime(n.created_at)}${n.channel?` · ${safe(n.channel)}`:''}</small></div><span class="pill ${n.read_at?'gray':'green'}">${n.read_at?'Leída':'Nueva'}</span></button>`).join('')}</div>`:emptyState('Sin notificaciones','Cuando una solicitud avance, sea resuelta o cerrada, aparecerá aquí el seguimiento interno.')}</div>${renderEmailQueuePanel()}</div>`;
}
function deliveryStatusLabel(status){
  return { pending:'Pendiente', sent:'Enviado', failed:'Fallido', cancelled:'Cancelado' }[status] || status || 'Sin estado';
}
function deliveryStatusClass(status){
  return { pending:'amber', sent:'green', failed:'red', cancelled:'gray' }[status] || 'gray';
}
function renderEmailQueuePanel(){
  if(!isAdmin()) return '';
  const rows = state.emailQueue || [];
  const count = (s)=>rows.filter(r=>r.status===s).length;
  return `<div class="card email-queue-panel"><div class="section-title"><div><h2>Correos institucionales</h2><p>Cola que procesa Google Apps Script desde la cuenta institucional. Aquí puedes verificar pendientes, enviados y fallidos.</p></div><button class="btn btn-soft btn-small" id="refreshEmailQueue">Actualizar cola</button></div><div class="delivery-kpis"><div><strong>${count('pending')}</strong><span>Pendientes</span></div><div><strong>${count('sent')}</strong><span>Enviados</span></div><div><strong>${count('failed')}</strong><span>Fallidos</span></div></div>${rows.length?`<div class="email-queue-list">${rows.map(r=>{ const payload=r.payload || {}; return `<article class="email-queue-item ${safe(r.status)}"><div><span class="pill ${deliveryStatusClass(r.status)}">${safe(deliveryStatusLabel(r.status))}</span><strong>${safe(payload.subject || 'Correo de seguimiento')}</strong><p>${safe(r.destination || 'Sin destinatario')}</p><small>${safe(payload.ticket_number || '')}${payload.service_name?` · ${safe(payload.service_name)}`:''} · Creado ${fmtDateTime(r.created_at)}${r.sent_at?` · Enviado ${fmtDateTime(r.sent_at)}`:''}</small>${r.last_error?`<em>${safe(r.last_error)}</em>`:''}</div></article>`; }).join('')}</div>`:emptyState('Sin correos en cola','Cuando una solicitud sea radicada o cerrada se agregará aquí el correo para envío externo.')}</div>`;
}


function renderReports(){
  const all = visibleTickets();
  const rowsStatus = statusFlow.map(s=>[statusLabels[s] || s, all.filter(t=>t.status===s).length]);
  const rowsTeam = [['TIC', byTeam('TIC').length], ['Comunicaciones', byTeam('COM').length]];
  const rowsKind = kindOptions.map(k=>[kindLabels[k], state.activities.filter(a=>a.kind===k).length]);
  const rowsService = state.services.map(s=>[s.name, all.filter(t=>t.service_code===s.code).length]).filter(r=>r[1]>0).slice(0,8);
  return h`
    <section class="module-hero reports-hero">
      <div><span class="tag">Reportes visuales</span><h2>Indicadores de Mesa</h2><p>Panel con datos reales: solicitudes, estados, equipos, servicios y actividades del cronograma.</p></div>
      <div class="module-hero-art">${assetIcon('dashboard-analytics','Reportes','module-hero-img')}</div>
    </section>
    <div class="grid grid-4 compact-metrics">
      ${metric('Total solicitudes', all.length, 'Registros visibles', 'blue', 'dashboard-analytics')}
      ${metric('Abiertas', openTickets(all).length, 'Pendientes', 'amber', 'alerts-support')}
      ${metric('Actividades', state.activities.length, 'Rango cargado', 'violet', 'calendar-planner')}
      ${metric('Servicios usados', new Set(all.map(t=>t.service_code)).size, 'Con solicitudes', 'green', 'workflow-settings')}
    </div>
    <div class="grid grid-2 reports-grid">
      <div class="card"><div class="section-title"><div><h2>Estados de solicitudes</h2><p>Distribución por estado.</p></div></div>${renderBarChart(rowsStatus)}</div>
      <div class="card"><div class="section-title"><div><h2>Equipos</h2><p>TIC frente a Comunicaciones.</p></div></div>${renderBarChart(rowsTeam)}</div>
      <div class="card"><div class="section-title"><div><h2>Servicios más usados</h2><p>Solo servicios con datos reales.</p></div></div>${rowsService.length?renderBarChart(rowsService):emptyState('Sin datos por servicio','Aún no hay solicitudes suficientes para comparar servicios.')}</div>
      <div class="card"><div class="section-title"><div><h2>Tipos de actividad</h2><p>Movimiento del cronograma.</p></div></div>${renderBarChart(rowsKind)}</div>
    </div>`;
}
function renderUsers(){
  return h`<div class="grid grid-main"><div class="card"><div class="section-title"><div><h2>Usuarios institucionales</h2><p>Personas activas en la Mesa. Los roles se aplican desde Supabase.</p></div><button class="btn btn-primary btn-small" id="openUserModal">Crear usuario</button></div>${renderUsersTable()}</div><div class="card"><div class="section-title"><div><h2>Mapa de permisos</h2><p>Distribución visual del ecosistema.</p></div></div>${renderRoleMap()}</div></div>`;
}
function renderUsersTable(){
  if(!state.profiles.length) return emptyState('Sin usuarios visibles','Cuando se creen usuarios, aparecerán aquí.');
  return `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Equipo</th><th>Estado</th><th>Clave</th></tr></thead><tbody>${state.profiles.map(p=>{ const role=state.roleRows.find(r=>r.profile_id===p.id)?.role_code || 'Sin rol'; const team=state.teamRows.find(t=>t.profile_id===p.id)?.team_code || ''; return `<tr><td><strong>${safe(p.full_name||'Sin nombre')}</strong></td><td>${safe(p.email)}</td><td>${safe(roleLabels[role]||role)}</td><td>${team?`<span class="pill ${team==='COM'?'com':'tic'}">${safe(team)}</span>`:'<span class="muted">Sin equipo</span>'}</td><td><span class="pill ${p.status==='active'?'green':'amber'}">${safe(p.status)}</span></td><td>${isAdmin()?`<button class="btn btn-soft btn-small" data-admin-reset-password="${safe(p.id)}" data-email="${safe(p.email)}">Cambiar</button>`:''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function renderRoleMap(){
  const rows = [
    {title:'Funcionario', desc:'Radicar y consultar propias', asset:'role-funcionario', accent:'funcionario'},
    {title:'Comunicaciones', desc:'Publicaciones, cubrimientos y agenda COM', asset:'role-comunicaciones', accent:'comunicaciones'},
    {title:'CIO TIC', desc:'Vista general y operación TIC/COM', asset:'role-cio-tic', accent:'cio'},
    {title:'Secretario General', desc:'Administración institucional', asset:'role-secretario-general', accent:'secretario'}
  ];
  return `<div class="role-map-grid">${rows.map(r=>`<div class="role-card ${safe(r.accent)}"><div class="role-card-media">${assetIcon(r.asset, r.title, 'role-card-img')}</div><div class="role-card-body"><span class="role-kicker">Mapa de permisos</span><strong>${safe(r.title)}</strong><p>${safe(r.desc)}</p></div></div>`).join('')}</div>`;
}
function renderImports(){
  return h`<div class="card"><div class="section-title"><div><h2>Importaciones</h2><p>Carga institucional por CSV. Esta sección usa la función <strong>bulk-import</strong>.</p></div></div><div class="grid grid-4">${['users','departments','assets','emails'].map(type=>`<div class="card"><span class="pill">CSV</span><h3>${labelImport(type)}</h3><p class="muted">Validar antes de importar.</p><div class="field"><label>Archivo CSV</label><input type="file" accept=".csv" data-import-file="${type}"></div><button class="btn btn-primary btn-block" data-import="${type}">Validar / Importar</button></div>`).join('')}</div><div id="importResult" style="margin-top:16px"></div></div>`;
}
function labelImport(type){ return {users:'Usuarios',departments:'Dependencias',assets:'Activos',emails:'Correos institucionales'}[type] || type; }
function renderSettings(){
  const uploadUrl = driveUploadWebAppUrl();
  return `<div class="settings-release-grid">
    <div class="card release-card">
      <div class="section-title"><div><span class="tag">Lanzamiento</span><h2>Mesa lista para uso institucional</h2><p>Experiencia estable para escritorio, iOS y Android.</p></div><span class="pill green">Lista</span></div>
      <div class="release-kpis"><div><strong>${state.services.length}</strong><span>Servicios</span></div><div><strong>${state.resources.length}</strong><span>Responsables</span></div><div><strong>${uploadEnabled()?'OK':'Pend.'}</strong><span>Drive</span></div><div><strong>${state.emailQueue.filter(x=>x.status==='failed').length}</strong><span>Correos fallidos</span></div></div>
      <div class="release-actions"><button class="btn btn-primary" data-jump="launch_check">Abrir checklist</button><button class="btn btn-soft" id="reportIssueSettingsBtn">Reportar error de la Mesa</button></div>
    </div>
    <div class="card ios-install-card">
      <div class="section-title"><div><h2>Uso en celular tipo app</h2><p>Para funcionarios, se recomienda abrir desde el acceso de pantalla de inicio.</p></div></div>
      <div class="ios-steps"><div><strong>iPhone</strong><p>Safari → Compartir → Agregar a pantalla de inicio → Abrir como “Mesa TIC”.</p></div><div><strong>Android</strong><p>Chrome → Menú ⋮ → Instalar app / Agregar a pantalla principal.</p></div></div>
    </div>
  </div>
  <div class="grid grid-2"><div class="card"><div class="section-title"><div><h2>Servicios activos</h2><p>Catálogo real cargado desde Supabase.</p></div></div>${state.services.length?`<div class="compact-list">${state.services.map(s=>`<div class="compact-item"><div><strong>${safe(s.name)}</strong><div class="ticket-meta">${safe(s.description||'')}</div></div><span class="pill ${s.team_code==='COM'?'com':'tic'}">${safe(s.team_code)}</span></div>`).join('')}</div>`:emptyState('Sin servicios','Ejecuta el SQL base y el patch v4.8.11 para cargar el catálogo mínimo.')}</div><div class="card"><div class="section-title"><div><h2>Recursos de cronograma</h2><p>Nombres reales de Administrador TIC y Comunicadores.</p></div><button class="btn btn-soft btn-small" data-jump="launch_check">Checklist</button></div>${state.resources.length?`<div class="compact-list">${state.resources.map(r=>`<div class="compact-item"><div><strong>${safe(r.name)}</strong><div class="ticket-meta">${safe(r.role_label)} · ${safe(r.code)}</div></div><span class="pill ${r.team_code==='COM'?'com':'tic'}">${safe(r.team_code)}</span></div>`).join('')}</div>`:emptyState('Sin recursos','No hay recursos configurados.')}</div></div><div class="grid grid-2"><div class="card upload-config-card"><div class="section-title"><div><h2>Archivos en Google Drive</h2><p>Conecta el Web App de Apps Script para que los adjuntos se guarden en Drive y Supabase solo conserve la ruta.</p></div><span class="pill ${uploadUrl?'green':'amber'}">${uploadUrl?'Activo':'Pendiente'}</span></div><div class="field"><label>URL del Web App de Google Apps Script</label><input id="driveUploadUrlInput" value="${safe(uploadUrl)}" placeholder="https://script.google.com/macros/s/.../exec"></div><button class="btn btn-primary" id="saveDriveUploadUrl">Guardar conexión Drive</button><p class="help-text">Esta URL no es una clave. La seguridad real se valida con la sesión Supabase del usuario y la service_role key guardada dentro de Apps Script.</p></div><div class="card password-card"><div class="section-title"><div><h2>Cambiar mi contraseña</h2><p>Actualiza la clave de la cuenta con la que iniciaste sesión.</p></div></div><div class="field"><label>Nueva contraseña</label><input id="myNewPassword" type="password" autocomplete="new-password" placeholder="Nueva contraseña"></div><div class="field"><label>Confirmar contraseña</label><input id="myNewPassword2" type="password" autocomplete="new-password" placeholder="Repite la contraseña"></div><div id="myPasswordMsg"></div><button class="btn btn-primary" id="changeMyPasswordBtn">Guardar nueva contraseña</button></div></div><div class="card launch-inline">${renderLaunchChecklistInner()}</div>`;
}


function renderLaunchChecklist(){
  return `<section class="module-hero reports-hero"><div><span class="tag">Lanzamiento</span><h2>Checklist de publicación</h2><p>Valida permisos, responsables reales, responsive y flujo de solicitud antes de abrirlo a toda la Alcaldía.</p></div><div class="module-hero-art">${assetIcon('workflow-settings','Checklist','module-hero-img')}</div></section><div class="grid grid-main"><div class="card">${renderLaunchChecklistInner()}</div><div class="card">${renderRoleTestScreen()}</div></div>`;
}
function launchCheckItems(){
  const genericNames = state.resources.filter(r=>/Comunicador Social|Administrador TIC/i.test(r.name||''));
  const roles = new Set(state.roleRows.map(r=>r.role_code));
  return [
    ['Login obligatorio', Boolean(state.user && state.profile), 'La app solo se desbloquea con sesión Supabase.'],
    ['Responsables con nombre real', state.resources.length>=3 && genericNames.length===0, genericNames.length?'Aún hay nombres genéricos en cronograma. Ejecuta patch v4.7 o revisa roles COM/TIC.':'Cronograma muestra nombres propios.'],
    ['Servicios de Comunicaciones', state.services.some(s=>s.code==='advertising_design') && state.services.some(s=>s.code==='video_recording') && state.services.some(s=>s.code==='web_publication'), 'Diseño, campañas, video y publicaciones disponibles.'],
    ['Desarrollo web', state.services.some(s=>s.code==='web_development_request'), 'Servicio de desarrollo web cargado en catálogo.'],
    ['Adjuntos Drive', uploadEnabled(), 'La URL del Web App de Apps Script para archivos está configurada en este navegador.'],
    ['Bandejas por rol', state.modules.length>0, 'La navegación se construye desde permisos.'],
    ['Usuarios principales', roles.has('super_admin') || roles.has('secretary_admin') || state.profiles.length>0, 'Usuarios y roles visibles para administración.'],
    ['Cronograma activo', state.resources.length>=3, 'Tres recursos principales disponibles.'],
    ['Solicitudes sin demo', true, 'El frontend no trae tickets simulados; usa datos reales.'],
    ['Modo celular tipo app', true, 'Barra inferior móvil, topbar de vidrio y PWA instalable como acceso en iOS/Android.'],
    ['Prueba responsive pendiente', true, 'Probar 1366px, 768px, iPhone SE/13/14 y Android antes de lanzamiento general.']
  ];
}
function renderLaunchChecklistInner(){
  const items = launchCheckItems();
  const ok = items.filter(i=>i[1]).length;
  return `<div class="section-title"><div><h2>Checklist de lanzamiento</h2><p>${ok}/${items.length} puntos listos o por validar.</p></div><span class="pill ${ok>=items.length-1?'green':'amber'}">${ok>=items.length-1?'Release listo':'Revisar'}</span></div><div class="launch-check-list">${items.map(([title,done,desc])=>`<div class="launch-check ${done?'ok':'pending'}"><span>${done?icon('check'):icon('alerts-support')}</span><div><strong>${safe(title)}</strong><p>${safe(desc)}</p></div></div>`).join('')}</div>`;
}
function renderRoleTestScreen(){
  const rows = [
    ['Funcionario solicitante','Inicio, Nueva solicitud, Mis solicitudes, Cronograma, Centro de ayuda, Notificaciones','No debe ver usuarios, configuración ni bandeja completa.'],
    ['Comunicaciones','Solicitudes COM, publicaciones, diseños, videos, cubrimientos y cronograma','No debe ver operación TIC ni usuarios.'],
    ['CIO TIC','Vista general TIC/COM, usuarios, configuración, reportes, cronograma','Debe ver todo el ecosistema operativo.'],
    ['Secretario General','Administración institucional, reportes, usuarios y seguimiento general','Debe administrar sin romper permisos operativos.']
  ];
  return `<div class="section-title"><div><h2>Prueba visual por rol</h2><p>Usa esta pantalla para validar navegación en una ventana incógnita con cada usuario.</p></div></div><div class="role-test-grid">${rows.map((r,i)=>`<div class="role-test"><div class="role-test-icon">${assetIcon(['role-funcionario','role-comunicaciones','role-cio-tic','role-secretario-general'][i],r[0],'role-test-img')}</div><div><strong>${safe(r[0])}</strong><p>${safe(r[1])}</p><em>${safe(r[2])}</em></div></div>`).join('')}</div>`;
}

function renderQueuePreview(list,title){
  return `<div class="section-title"><div><h2>${safe(title)}</h2><p>Últimos registros visibles por permiso.</p></div><button class="btn btn-soft btn-small" data-jump="requests">Abrir bandeja</button></div>${ticketCompactList(list.slice(0,8),'No hay solicitudes registradas todavía.')}`;
}

function bindView(){
  document.querySelectorAll('[data-service]').forEach(btn=>btn.addEventListener('click',()=>openRequestModal(btn.dataset.service)));
  document.querySelectorAll('[data-open-ticket]').forEach(el=>el.addEventListener('click',async(ev)=>{ ev.stopPropagation(); await markNotificationFromElement(el); openTicket(el.dataset.openTicket); }));
  document.querySelectorAll('[data-ticket-view]').forEach(btn=>btn.addEventListener('click',()=>{ state.ticketView=btn.dataset.ticketView; renderShell(); }));
  document.getElementById('filterStatus')?.addEventListener('change',e=>{ state.filter.status=e.target.value; renderShell(); });
  document.getElementById('filterTeam')?.addEventListener('change',e=>{ state.filter.team=e.target.value; renderShell(); });
  document.getElementById('filterService')?.addEventListener('change',e=>{ state.filter.service=e.target.value; renderShell(); });
  document.getElementById('filterQ')?.addEventListener('input',e=>{ state.filter.q=e.target.value; renderShell(); });
  document.querySelectorAll('[data-schedule-mode]').forEach(btn=>btn.addEventListener('click',async(e)=>{ e.stopPropagation(); state.scheduleMode=btn.dataset.scheduleMode; if(btn.dataset.setDate || btn.dataset.date) state.scheduleDate=btn.dataset.setDate || btn.dataset.date; await loadActivities(); renderShell(); }));
  document.querySelectorAll('[data-date-move]').forEach(btn=>btn.addEventListener('click',async()=>{ state.scheduleDate=addDays(state.scheduleDate, Number(btn.dataset.dateMove)); await loadActivities(); renderShell(); }));
  document.querySelectorAll('[data-set-date]').forEach(btn=>btn.addEventListener('click',async(e)=>{ e.stopPropagation(); state.scheduleDate=btn.dataset.setDate; await loadActivities(); renderShell(); }));
  document.querySelectorAll('[data-today]').forEach(btn=>btn.addEventListener('click',async()=>{ state.scheduleDate=isoDate(new Date()); await loadActivities(); renderShell(); }));
  document.querySelectorAll('[data-resource-quick]').forEach(btn=>btn.addEventListener('click',async()=>{ state.filter.resource = state.filter.resource===btn.dataset.resourceQuick ? 'all' : btn.dataset.resourceQuick; renderShell(); }));
  document.getElementById('kindFilter')?.addEventListener('change',e=>{ state.filter.kind=e.target.value; renderShell(); });
  document.getElementById('resourceFilter')?.addEventListener('change',e=>{ state.filter.resource=e.target.value; renderShell(); });
  document.getElementById('activitySearch')?.addEventListener('input',e=>{ state.filter.activityQ=e.target.value; renderShell(); });
  document.querySelectorAll('[data-activity-id]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); openActivityDetail(el.dataset.activityId); }));
  document.querySelectorAll('[data-new-activity]').forEach(btn=>btn.addEventListener('click',(e)=>{ e.stopPropagation(); openActivityModal(btn.dataset.newActivity, null, { resource: btn.dataset.resource, date: btn.dataset.date, time: btn.dataset.time }); }));
  document.getElementById('openUserModal')?.addEventListener('click',openUserModal);
  document.getElementById('refreshEmailQueue')?.addEventListener('click',async()=>{ await loadEmailQueue(); renderShell(); toast('Cola de correos actualizada.'); });
  document.getElementById('saveDriveUploadUrl')?.addEventListener('click',()=>{ const v = document.getElementById('driveUploadUrlInput')?.value || ''; saveDriveUploadWebAppUrl(v); toast('Conexión de Drive guardada en este navegador.'); renderShell(); });
  document.getElementById('changeMyPasswordBtn')?.addEventListener('click',changeMyPassword);
  document.querySelectorAll('[data-admin-reset-password]').forEach(btn=>btn.addEventListener('click',()=>openAdminResetPassword(btn.dataset.adminResetPassword, btn.dataset.email || '')));
  document.querySelectorAll('[data-import]').forEach(btn=>btn.addEventListener('click',()=>runImport(btn.dataset.import)));
}


async function openGlobalSearch(){
  const q = String(state.filter.globalQ||'').trim().toLowerCase();
  if(!q){ toast('Escribe algo para buscar.'); return; }
  await Promise.all([loadTickets().catch(()=>{}), loadActivities().catch(()=>{}), loadKnowledge().catch(()=>{})]);
  const tickets = state.tickets.filter(t=>`${t.ticket_number} ${t.title} ${t.description} ${t.service_name}`.toLowerCase().includes(q)).slice(0,8);
  const activities = state.activities.filter(a=>`${a.title} ${a.description||''} ${a.location||''} ${resourceName(a.resource_code)}`.toLowerCase().includes(q)).slice(0,8);
  const services = state.services.filter(s=>`${s.name} ${s.description||''} ${s.code}`.toLowerCase().includes(q)).slice(0,8);
  const articles = state.articles.filter(a=>`${a.title} ${a.body||''}`.toLowerCase().includes(q)).slice(0,8);
  modal(`<div class="modal-head"><div><span class="tag">Buscador global</span><h2>Resultados para “${safe(state.filter.globalQ)}”</h2><p class="muted">Busca en solicitudes, cronograma, servicios y conocimiento.</p></div><button class="close-btn" data-close>×</button></div><div class="global-results">${renderSearchGroup('Solicitudes',tickets,t=>`<button class="search-result" data-open-ticket="${t.id}"><strong>${safe(t.ticket_number)} · ${safe(t.title)}</strong><span>${safe(serviceName(t.service_code))} · ${safe(statusLabels[t.status]||t.status)}</span></button>`)}${renderSearchGroup('Cronograma',activities,a=>`<button class="search-result" data-set-date="${String(a.start_at).slice(0,10)}" data-jump="schedule"><strong>${safe(a.title)}</strong><span>${fmtDateTime(a.start_at)} · ${safe(resourceName(a.resource_code))}</span></button>`)}${renderSearchGroup('Servicios',services,s=>`<button class="search-result" data-service="${safe(s.code)}"><strong>${safe(s.name)}</strong><span>${safe(serviceCategory(s))}</span></button>`)}${renderSearchGroup('Centro de ayuda',articles,a=>`<div class="search-result"><strong>${safe(a.title)}</strong><span>${safe((a.body||'').slice(0,120))}</span></div>`)}</div>`);
  modalRoot.querySelectorAll('[data-open-ticket]').forEach(b=>b.addEventListener('click',()=>{ const id=b.dataset.openTicket; clearModal(); openTicket(id); }));
  modalRoot.querySelectorAll('[data-service]').forEach(b=>b.addEventListener('click',()=>{ const code=b.dataset.service; clearModal(); openRequestModal(code); }));
  modalRoot.querySelectorAll('[data-jump="schedule"]').forEach(b=>b.addEventListener('click',async()=>{ state.scheduleDate=b.dataset.setDate || state.scheduleDate; clearModal(); await setView('schedule'); }));
}
function renderSearchGroup(title, list, renderer){
  return `<section class="search-group"><h3>${safe(title)}</h3>${list.length?list.map(renderer).join(''):emptyState('Sin resultados',`No hay coincidencias en ${title.toLowerCase()}.`)}</section>`;
}

function openRequestModal(serviceCode){
  const service = state.services.find(x=>x.code===serviceCode); if(!service) return;
  const defaults = {
    target_resource_code: '',
    work_mode: '',
    preferred_date: '',
    priority: 'normal',
    title: '', description: '', preferred_time: '', place: '', channel: '', delivery_date: '', contact: '', attachments_note: '', has_files: ''
  };
  const draft = loadWizardDraft(serviceCode);
  const wizard = { step: Math.min(Math.max(Number(draft?.step || 1),1),5), service, data: { ...defaults, ...(draft?.data || {}) }, files: [] };
  renderRequestWizard(wizard);
  if(draft?.data) toast('Se restauró el borrador de esta solicitud.');
}
function requestWizardSteps(service){
  return [
    { n:1, title:'Necesidad', hint:'Primero cuéntanos qué necesitas.' },
    { n:2, title:'Responsable', hint:'Ahora elige a quién se dirige la solicitud.' },
    { n:3, title:'Modalidad', hint:'Define si será presencial, virtual o mixta.' },
    { n:4, title:'Datos de apoyo', hint:'Agrega fecha, canal, prioridad y contexto.' },
    { n:5, title:'Revisión', hint:'La Mesa calcula carga, tiempos y alertas.' }
  ];
}
function collectWizardData(wizard){
  const form = modalRoot.querySelector('#wizardForm');
  if(!form) return;
  const fd = new FormData(form);
  Object.assign(wizard.data, Object.fromEntries(fd.entries()));
  collectWizardFiles(wizard);
  saveWizardDraft(wizard);
}
function renderRequestWizard(wizard){
  const s = wizard.service;
  const steps = requestWizardSteps(s);
  const step = wizard.step;
  const resources = resourcesForService(s);
  const data = wizard.data;
  const advice = requestAdvice(s, data.target_resource_code, data.work_mode || 'virtual');
  modal(h`<div class="modal-head wizard-head"><div><span class="tag">Radicación guiada</span><h2>${safe(s.name)}</h2><p class="muted">Paso ${step} de ${steps.length} · ${safe(steps[step-1].hint)}</p></div><button class="close-btn" data-close>×</button></div>
    <form id="wizardForm" class="wizard-form clean-wizard">
      <div class="wizard-progress">${steps.map(x=>`<div class="wizard-dot ${x.n===step?'active':x.n<step?'done':''}"><span>${x.n<step?icon('check'):x.n}</span><strong>${safe(x.title)}</strong></div>`).join('')}</div>
      <div class="wizard-body">
        <section class="wizard-main">${renderWizardStep(wizard, resources, advice)}</section>
        <aside class="wizard-side">${renderWizardSide(wizard, resources, advice)}</aside>
      </div>
      <div id="requestMsg"></div>
      <div class="wizard-actions">
        ${step>1?'<button type="button" class="btn btn-soft" id="wizardBack">Atrás</button>':'<button type="button" class="btn btn-soft" data-close>Cancelar</button>'}
        ${step<steps.length?'<button type="button" class="btn btn-primary" id="wizardNext">Continuar</button>':'<button type="submit" class="btn btn-primary">Radicar solicitud</button>'}
      </div>
    </form>`);
  bindWizard(wizard);
}
function renderWizardSide(wizard, resources, advice){
  const s = wizard.service;
  const d = wizard.data;
  if(wizard.step === 1){
    return `<div class="wizard-service-card"><div class="wizard-service-img">${assetIcon(serviceAsset(s), s.name, 'wizard-img')}</div><span class="tag">${safe(serviceCategory(s))}</span><strong>${safe(s.name)}</strong><p>En este paso solo debes explicar la necesidad. Todavía no se asigna responsable ni modalidad.</p></div><div class="wizard-helper"><strong>Orden correcto</strong><p>Primero necesidad, luego responsable, después modalidad y finalmente agenda/datos.</p></div>`;
  }
  if(wizard.step === 2){
    return `<div class="wizard-helper"><strong>Responsables disponibles</strong><p>Escoge una sola persona. La solicitud quedará dirigida a ese responsable, pero los administradores podrán verla según permisos.</p></div><div class="side-resource-list">${resources.map(r=>`<div class="side-resource ${d.target_resource_code===r.code?'active':''}"><span>${safe(r.initials||r.name.slice(0,2))}</span><div><strong>${safe(r.name)}</strong><p>${safe(r.role_label)} · ${safe(r.team_code)}</p></div></div>`).join('') || '<div class="empty compact-empty"><strong>Sin responsables</strong><p>No hay recursos configurados para este servicio.</p></div>'}</div>`;
  }
  if(wizard.step === 3){
    return `<div class="wizard-helper"><strong>Modalidad</strong><p>La modalidad define qué pedirá la Mesa después.</p></div><div class="side-mode-list"><div><strong>Presencial</strong><p>Requiere revisar cronograma.</p></div><div><strong>Virtual</strong><p>Se gestiona por tiempo estimado.</p></div><div><strong>Mixta</strong><p>Combina estimación y agenda.</p></div></div>`;
  }
  if(wizard.step === 4){
    const r = resourceByCode(d.target_resource_code);
    return `<div class="wizard-service-card"><div class="wizard-service-img">${assetIcon(d.work_mode==='presencial'?'calendar-planner':serviceAsset(s), s.name, 'wizard-img')}</div><span class="tag">Datos de apoyo</span><strong>${safe(r?.name || 'Responsable seleccionado')}</strong><p>${d.work_mode==='presencial'||d.work_mode==='mixto'?'Como tiene componente presencial, la fecha sirve para revisar ocupación en cronograma.':'Como es virtual, la fecha sirve como referencia de entrega o inicio.'}</p></div>`;
  }
  return renderRequestAdvisor(s, d.target_resource_code, d.work_mode || 'virtual');
}
function renderWizardStep(wizard, resources, advice){
  const s = wizard.service;
  const d = wizard.data;
  const isCom = s.team_code === 'COM';
  if(wizard.step === 1){
    return h`<div class="wizard-step-card"><span class="step-kicker">Paso 1</span><h3>¿Qué necesitas?</h3><p>Describe la solicitud sin preocuparte aún por responsable, modalidad o fechas. Eso viene después.</p><div class="field"><label>Título de la solicitud</label><input name="title" required value="${safe(d.title)}" placeholder="Ej. Diseñar pieza para campaña de vacunación"></div><div class="field"><label>Descripción clara</label><textarea name="description" required placeholder="Explica el contexto, objetivo, público, enlaces, restricciones o información importante.">${safe(d.description)}</textarea></div></div>`;
  }
  if(wizard.step === 2){
    return h`<div class="wizard-step-card"><span class="step-kicker">Paso 2</span><h3>¿A quién quieres enviarla?</h3><p>Selecciona el responsable directo. Antes de este paso la Mesa no asigna a nadie.</p><div class="resource-choice-grid">${resources.map(r=>`<label class="resource-choice ${d.target_resource_code===r.code?'active':''}"><input type="radio" name="target_resource_code" value="${safe(r.code)}" ${d.target_resource_code===r.code?'checked':''} required><span>${safe(r.initials||r.name.slice(0,2))}</span><div><strong>${safe(r.name)}</strong><p>${safe(r.role_label)} · ${safe(r.team_code)}${r.team_code===s.team_code?' · recomendado':''}</p></div></label>`).join('')}</div>${!resources.length?emptyState('Sin responsables configurados','Debes configurar recursos del cronograma para poder dirigir solicitudes.'):''}</div>`;
  }
  if(wizard.step === 3){
    const recommended = serviceIsPresential(s) ? 'presencial' : 'virtual';
    return h`<div class="wizard-step-card"><span class="step-kicker">Paso 3</span><h3>¿Cómo se realizará?</h3><p>Escoge la modalidad. Esto determina si se revisa cronograma o solo tiempos estimados.</p><div class="choice-grid modality-grid"><label class="choice-card ${d.work_mode==='presencial'?'active':''}"><input type="radio" name="work_mode" value="presencial" ${d.work_mode==='presencial'?'checked':''} required><strong>Presencial</strong><span>Requiere revisar ocupación en cronograma.</span>${recommended==='presencial'?'<em>Recomendado para este servicio</em>':''}</label><label class="choice-card ${d.work_mode==='virtual'?'active':''}"><input type="radio" name="work_mode" value="virtual" ${d.work_mode==='virtual'?'checked':''} required><strong>Virtual</strong><span>Se atiende con tiempo estimado y carga semanal.</span>${recommended==='virtual'?'<em>Recomendado para este servicio</em>':''}</label><label class="choice-card ${d.work_mode==='mixto'?'active':''}"><input type="radio" name="work_mode" value="mixto" ${d.work_mode==='mixto'?'checked':''} required><strong>Mixta</strong><span>Puede necesitar reunión, insumos y trabajo virtual.</span></label></div></div>`;
  }
  if(wizard.step === 4){
    const needsCalendar = d.work_mode === 'presencial' || d.work_mode === 'mixto';
    return h`<div class="wizard-step-card"><span class="step-kicker">Paso 4</span><h3>${needsCalendar?'Fecha, lugar y datos para agenda':'Entrega, canal y datos de apoyo'}</h3><p>${needsCalendar?'Como hay componente presencial, agrega fecha/hora preferida para revisar ocupaciones.':'Como es virtual, agrega fecha ideal de entrega o inicio y el canal de trabajo.'}</p><div class="form-grid"><div class="field"><label>${needsCalendar?'Fecha preferida':'Fecha ideal de entrega/inicio'}</label><input name="preferred_date" type="date" value="${safe(d.preferred_date || state.scheduleDate)}"></div>${needsCalendar?`<div class="field"><label>Hora preferida</label><input name="preferred_time" type="time" value="${safe(d.preferred_time)}"></div>`:`<div class="field"><label>Fecha de publicación / entrega ideal</label><input name="delivery_date" type="date" value="${safe(d.delivery_date)}"></div>`}</div><div class="form-grid"><div class="field"><label>Prioridad sugerida</label><select name="priority"><option value="normal" ${d.priority==='normal'?'selected':''}>Normal</option><option value="high" ${d.priority==='high'?'selected':''}>Alta</option><option value="critical" ${d.priority==='critical'?'selected':''}>Crítica</option><option value="low" ${d.priority==='low'?'selected':''}>Baja</option></select></div><div class="field"><label>${needsCalendar?'Lugar o punto de atención':'Canal o formato'}</label><input name="place" value="${safe(d.place)}" placeholder="${needsCalendar?'Oficina, sede, barrio, evento o enlace':'Facebook, web, reel, afiche, correo, logo, pieza…'}"></div></div>${isCom ? `<div class="form-grid"><div class="field"><label>Canal de comunicación</label><input name="channel" value="${safe(d.channel)}" placeholder="Facebook, web, video, pauta, redes, campaña…"></div><div class="field"><label>Insumos o enlaces</label><input name="attachments_note" value="${safe(d.attachments_note)}" placeholder="Drive, fotos, textos, referencias o archivos"></div></div>` : `<div class="field"><label>Contacto de apoyo</label><input name="contact" value="${safe(d.contact)}" placeholder="Extensión, celular o correo de apoyo"></div>`}<div class="choice-grid file-choice"><label class="choice-card ${d.has_files==='yes'?'active':''}"><input type="radio" name="has_files" value="yes" ${d.has_files==='yes'?'checked':''}><strong>Sí envío archivo</strong><span>Decreto, PDF, foto, Word, Excel, pieza o soporte.</span></label><label class="choice-card ${d.has_files!=='yes'?'active':''}"><input type="radio" name="has_files" value="no" ${d.has_files!=='yes'?'checked':''}><strong>No envío archivo</strong><span>La solicitud se puede radicar solo con texto.</span></label></div>${d.has_files==='yes'?`<div class="field upload-field"><label>Archivos de soporte</label><input id="wizardSupportFiles" type="file" multiple ${uploadEnabled()?'':'disabled'}><small>${wizard.files?.length?`${wizard.files.length} archivo(s) seleccionado(s). `:''}${uploadEnabled()?'Se guardarán en Google Drive al radicar.':'Configura primero la URL del Web App de Apps Script en Configuración.'}</small></div>`:''}</div>`;
  }
  const responsible = resourceByCode(d.target_resource_code)?.name || 'Responsable por definir';
  return h`<div class="wizard-step-card review"><span class="step-kicker">Paso 5</span><h3>Confirma y radica</h3><p>Ahora sí se muestra responsable, modalidad, carga y tiempo estimado porque ya completaste la información necesaria.</p><div class="review-grid"><div><small>Servicio</small><strong>${safe(s.name)}</strong></div><div><small>Responsable</small><strong>${safe(responsible)}</strong></div><div><small>Modalidad</small><strong>${safe(d.work_mode)}</strong></div><div><small>Estimado</small><strong>${formatDuration(advice.estimated)}</strong></div><div><small>Carga semanal</small><strong>${safe(advice.load.label)}</strong></div><div><small>Prioridad</small><strong>${safe(priorityLabels[d.priority]||d.priority)}</strong></div></div><div class="review-description"><small>Resumen</small><strong>${safe(d.title || 'Sin título')}</strong><p>${safe(d.description || 'Sin descripción')}</p></div>${wizard.files?.length?`<div class="review-description"><small>Archivos</small><strong>${wizard.files.length} archivo(s) listo(s) para Drive</strong><p>${wizard.files.map(f=>safe(f.name)).join('<br>')}</p></div>`:''}<input type="hidden" name="title" value="${safe(d.title)}"><input type="hidden" name="description" value="${safe(d.description)}"><input type="hidden" name="target_resource_code" value="${safe(d.target_resource_code)}"><input type="hidden" name="work_mode" value="${safe(d.work_mode)}"><input type="hidden" name="preferred_date" value="${safe(d.preferred_date || '')}"><input type="hidden" name="preferred_time" value="${safe(d.preferred_time || '')}"><input type="hidden" name="priority" value="${safe(d.priority || 'normal')}"><input type="hidden" name="place" value="${safe(d.place || '')}"><input type="hidden" name="channel" value="${safe(d.channel || '')}"><input type="hidden" name="delivery_date" value="${safe(d.delivery_date || '')}"><input type="hidden" name="contact" value="${safe(d.contact || '')}"><input type="hidden" name="attachments_note" value="${safe(d.attachments_note || '')}"></div>`;
}
function bindWizard(wizard){
  const form = modalRoot.querySelector('#wizardForm');
  const refresh = ()=>{ collectWizardData(wizard); renderRequestWizard(wizard); };
  form?.querySelector('#wizardBack')?.addEventListener('click',()=>{ collectWizardData(wizard); wizard.step=Math.max(1,wizard.step-1); saveWizardDraft(wizard); renderRequestWizard(wizard); });
  form?.querySelector('#wizardNext')?.addEventListener('click',()=>{ collectWizardData(wizard); if(!validateWizardStep(wizard)) return; wizard.step=Math.min(5,wizard.step+1); saveWizardDraft(wizard); renderRequestWizard(wizard); });
  form?.querySelectorAll('input[name="target_resource_code"]').forEach(r=>r.addEventListener('change',refresh));
  form?.querySelectorAll('input[name="work_mode"]').forEach(r=>r.addEventListener('change',refresh));
  form?.querySelectorAll('input[name="has_files"]').forEach(r=>r.addEventListener('change',refresh));
  form?.querySelector('#wizardSupportFiles')?.addEventListener('change',()=>collectWizardFiles(wizard));
  form?.addEventListener('submit',async(e)=>{
    e.preventDefault(); collectWizardData(wizard);
    if(!validateWizardStep(wizard,true)) return;
    const s = wizard.service;
    const payload = {...wizard.data};
    const advice = requestAdvice(s, payload.target_resource_code, payload.work_mode);
    payload.target_resource_name = resourceByCode(payload.target_resource_code)?.name || '';
    payload.routing_team = s.team_code;
    payload.service_category = serviceCategory(s);
    payload.estimated_minutes = String(advice.estimated);
    payload.estimated_human = formatDuration(advice.estimated);
    payload.workload_score = String(advice.load.score);
    payload.workload_warning = advice.warning;
    payload.requires_schedule = advice.needsCalendar ? 'true' : 'false';
    payload.routing_note = advice.needsCalendar ? 'Solicitud con componente presencial: debe coordinarse contra cronograma.' : 'Solicitud virtual: se gestiona por tiempo estimado y carga semanal.';
    const msg = document.getElementById('requestMsg'); msg.innerHTML='<div class="warning">Radicando y calculando carga…</div>';
    const { data: createdTicket, error } = await supabase.rpc('create_ticket', { p_service_code: s.code, p_title: payload.title, p_description: payload.description, p_payload: payload, p_preferred_date: payload.preferred_date || null });
    if(error){ msg.innerHTML=`<div class="error">${safe(error.message)}</div>`; return; }
    const createdId = createdTicket?.id || createdTicket?.ticket?.id || null;
    if(wizard.files?.length){
      try{
        await uploadFilesToDrive(wizard.files, { ticket_id: createdId, source:'ticket_creation', service_code:s.code, ticket_number:createdTicket?.ticket_number || '', title:payload.title }, msg);
      }catch(uploadErr){
        msg.innerHTML = `<div class="warning">La solicitud fue radicada, pero los archivos no se pudieron subir: ${safe(uploadErr.message || uploadErr)}</div>`;
        return;
      }
    }
    msg.innerHTML='<div class="success">Solicitud radicada correctamente. Quedó dirigida al responsable seleccionado y los archivos quedaron en Drive si fueron enviados.</div>'; toast('Solicitud creada con guía paso a paso.');
    clearWizardDraft(s.code);
    setTimeout(async()=>{ clearModal(); await boot(); },900);
  });
}
function validateWizardStep(wizard, final=false){
  const d = wizard.data;
  if((wizard.step===1 || final) && (!d.title?.trim() || !d.description?.trim())){ toast('Primero completa título y descripción.'); return false; }
  if((wizard.step===2 || final) && !d.target_resource_code){ toast('Ahora selecciona a quién enviar la solicitud.'); return false; }
  if((wizard.step===3 || final) && !d.work_mode){ toast('Selecciona si la solicitud será presencial, virtual o mixta.'); return false; }
  if((wizard.step===4 || final) && (d.work_mode==='presencial' || d.work_mode==='mixto') && !d.preferred_date){ toast('Selecciona una fecha preferida para revisar cronograma.'); return false; }
  return true;
}


async function markNotificationFromElement(el){
  const id = el?.dataset?.notificationId;
  if(!id) return;
  try{ await supabase.from('notifications').update({ read_at:new Date().toISOString() }).eq('id', id).is('read_at', null); }catch(_err){}
}
async function markAllNotificationsRead(){
  const ids = state.notifications.filter(n=>!n.read_at).map(n=>n.id).filter(Boolean);
  if(!ids.length){ toast('No hay notificaciones pendientes.'); return; }
  const { error } = await supabase.from('notifications').update({ read_at:new Date().toISOString() }).in('id', ids);
  if(error){ toast(error.message || 'No fue posible marcar notificaciones.'); return; }
  toast('Notificaciones marcadas como leídas.');
  await loadNotifications();
  renderShell();
}

async function openTicket(id){
  const t = state.tickets.find(x=>x.id===id); if(!t) return;
  state.activeTicket = t;
  const { data } = await supabase.from('ticket_messages').select('*').eq('ticket_id', id).order('created_at');
  state.ticketMessages = data ?? [];
  const { data: attachmentRows } = await supabase.from('ticket_attachments').select('*').eq('ticket_id', id).order('created_at');
  state.ticketAttachments = attachmentRows ?? [];
  modalRoot.innerHTML = `<div class="drawer-backdrop" data-close-drawer><aside class="drawer">${renderTicketDrawer(t)}</aside></div>`;
  document.querySelector('[data-close-drawer]').addEventListener('click',e=>{ if(e.target.dataset.closeDrawer!==undefined) clearModal(); });
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',clearModal));
  document.getElementById('messageForm')?.addEventListener('submit',sendTicketMessage);
  document.getElementById('ticketStatus')?.addEventListener('change',updateTicketFromDrawer);
  document.getElementById('ticketPriority')?.addEventListener('change',updateTicketFromDrawer);
  document.getElementById('scheduleFromTicket')?.addEventListener('click',()=>openActivityModal(t.assigned_team_code==='COM'?'coverage':'support', t));
  document.getElementById('resolveTicketBtn')?.addEventListener('click',()=>closeTicketWithResolution('resolved'));
  document.getElementById('closeTicketBtn')?.addEventListener('click',()=>closeTicketWithResolution('closed'));
  document.getElementById('reopenTicketBtn')?.addEventListener('click',()=>reopenTicket());
  document.getElementById('copyTicketLinkBtn')?.addEventListener('click',async()=>{
    const link = ticketDirectLink(t.id);
    try{ await navigator.clipboard.writeText(link); toast('Enlace de solicitud copiado.'); }
    catch(_){ prompt('Copia este enlace de solicitud:', link); }
  });
  modalRoot.querySelectorAll('[data-activity-id]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); openActivityDetail(el.dataset.activityId); }));
}
function renderTicketDrawer(t){
  const operational = canManageRequests();
  const p = ticketPayload(t);
  const related = state.activities.filter(a=>a.ticket_id===t.id || (p.target_resource_code && a.resource_code===p.target_resource_code && String(a.start_at||'').slice(0,10)===String(t.preferred_date||'').slice(0,10)));
  const resourceName = targetResourceNameFromTicket(t);
  const estimate = p.estimated_human || (p.estimated_minutes ? formatDuration(Number(p.estimated_minutes)) : 'Sin estimación');
  const closed = ['closed','cancelled'].includes(t.status);
  const resolved = t.status === 'resolved';
  return h`<div class="drawer-head workspace-head"><div><span class="pill ${t.assigned_team_code==='COM'?'com':'tic'}">${safe(t.assigned_team_code)}</span><h2>${safe(t.title)}</h2><p class="muted">${safe(t.ticket_number)} · ${safe(serviceName(t.service_code))}</p></div><button class="close-btn" data-close>×</button></div>
    <div class="ticket-workspace-grid">
      <aside class="ticket-panel ticket-meta-panel">
        <div class="ticket-panel-card"><span class="panel-kicker">Responsable</span><strong>${safe(resourceName)}</strong><p>${safe(p.work_mode || 'Modalidad no indicada')} · ${safe(p.routing_note || 'Sin nota de ruteo')}</p></div>
        <div class="statline"><div class="statline-row"><span>Estado</span>${operational?`<select id="ticketStatus">${drawerStatusOptions(t.status).map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${statusLabels[s]}</option>`).join('')}</select>`:`<strong>${safe(statusLabels[t.status])}</strong>`}</div><div class="statline-row"><span>Prioridad</span>${operational?`<select id="ticketPriority">${Object.keys(priorityLabels).map(p=>`<option value="${p}" ${t.priority===p?'selected':''}>${priorityLabels[p]}</option>`).join('')}</select>`:`<strong>${safe(priorityLabels[t.priority])}</strong>`}</div><div class="statline-row"><span>Equipo</span><strong>${safe(t.assigned_team_code)}</strong></div><div class="statline-row"><span>Estimado</span><strong>${safe(estimate)}</strong></div><div class="statline-row"><span>Fecha preferida</span><strong>${safe(t.preferred_date || p.preferred_date || 'No indicada')}</strong></div><div class="statline-row"><span>Creada</span><strong>${fmtDateTime(t.created_at)}</strong></div></div>${operational && !closed?'<button class="btn btn-primary btn-block" id="scheduleFromTicket" style="margin-top:14px">Programar en cronograma</button>':''}${operational && closed?'<button class="btn btn-soft btn-block" id="reopenTicketBtn" style="margin-top:14px">Reabrir solicitud</button>':''}<button class="btn btn-soft btn-block" id="copyTicketLinkBtn" style="margin-top:10px">Copiar enlace de solicitud</button></aside>
      <section class="ticket-panel ticket-conversation-panel"><div class="section-title"><div><h2>Conversación</h2><p>Respuestas públicas y notas internas autorizadas.</p></div></div>${renderMessages()}${closed?renderClosedNotice(t):`<form id="messageForm" class="message-composer"><div class="field"><label>Mensaje</label><textarea name="body" required placeholder="Escribe una respuesta, avance o nota"></textarea></div>${operational?'<div class="field"><label>Visibilidad</label><select name="visibility"><option value="public">Respuesta pública</option><option value="internal">Nota interna</option></select></div>':'<input type="hidden" name="visibility" value="public">'}${renderUploadField('message_files','¿Enviar archivo con este mensaje?','El archivo quedará vinculado a esta solicitud y se guardará en Google Drive.')}<div id="messageUploadMsg"></div><button class="btn btn-primary" type="submit">Enviar mensaje</button></form>`}${renderClosureBox(t, operational, closed, resolved)}</section>
      <aside class="ticket-panel ticket-context-panel"><div class="ticket-panel-card"><span class="panel-kicker">Descripción</span><p>${safe(t.description)}</p></div><div class="ticket-panel-card ${Number(p.workload_score||0)>=7?'danger':''}"><span class="panel-kicker">Inteligencia de carga</span><strong>${safe(p.workload_warning || 'Sin advertencia de carga')}</strong><p>${safe(p.requires_schedule==='true'?'Requiere revisión de cronograma.':'Puede gestionarse por estimación virtual.')}</p></div><div class="ticket-panel-card"><span class="panel-kicker">Datos enviados</span>${renderPayloadList(p)}</div><div class="ticket-panel-card"><span class="panel-kicker">Archivos en Drive</span>${renderAttachmentList(state.ticketAttachments)}</div><div class="ticket-panel-card"><span class="panel-kicker">Cronograma relacionado</span>${related.length?activityCompactList(related.slice(0,4)):emptyState('Sin actividad asociada','Puedes programar esta solicitud en el cronograma.')}</div></aside>
    </div>`;
}

function renderClosedNotice(t){
  return `<div class="closure-card locked"><span class="panel-kicker">Solicitud finalizada</span><strong>${safe(statusLabels[t.status] || t.status)}</strong><p>Esta solicitud ya no está en gestión operativa. Si se requiere continuar, un administrador puede reabrirla.</p></div>`;
}
function renderClosureBox(t, operational, closed, resolved){
  if(!operational) return '';
  if(closed) return `<div class="closure-card closed"><span class="panel-kicker">Cierre definitivo</span><strong>Solicitud cerrada</strong><p>La atención quedó finalizada. Puedes reabrirla desde el panel lateral si se necesita hacer una corrección.</p></div>`;
  return `<div class="closure-card ${resolved?'resolved':''}"><span class="panel-kicker">Cierre de solicitud</span><strong>${resolved?'La solicitud está resuelta. Puedes cerrarla definitivamente.':'Finaliza correctamente la atención'}</strong><p>Escribe una nota clara de solución y luego marca la solicitud como resuelta o cerrada. Esto deja trazabilidad en la conversación.</p><div class="field"><label>Nota de cierre / solución</label><textarea id="resolutionNote" placeholder="Ej. Se atendió la solicitud, se validó con el usuario y queda finalizada."></textarea></div><div id="closureMsg"></div><div class="closure-actions"><button type="button" class="btn btn-soft" id="resolveTicketBtn">Marcar resuelta</button><button type="button" class="btn btn-primary" id="closeTicketBtn">Cerrar solicitud</button></div></div>`;
}
async function createInternalFollowupNotification(ticket, status, note){
  // Refuerzo frontend: si el trigger SQL v4.8.8 está instalado, él crea la notificación.
  // Si aún no está instalado, este intento no rompe el cierre; puede fallar por RLS y se ignora.
  try{
    if(!ticket?.requester_id) return;
    const label = statusLabels[status] || status;
    await supabase.from('notifications').insert({
      profile_id: ticket.requester_id,
      ticket_id: ticket.id,
      event_type: `ticket.${status}`,
      severity: status === 'closed' || status === 'resolved' ? 'success' : 'info',
      channel: 'internal',
      title: `${label} · ${ticket.ticket_number}`,
      body: note ? `Tu solicitud fue marcada como ${label}. Nota: ${note}` : `Tu solicitud fue marcada como ${label}.`
    });
  }catch(_err){}
}

async function closeTicketWithResolution(status){
  if(!state.activeTicket?.id) return;
  const ticketId = state.activeTicket.id;
  const note = String(document.getElementById('resolutionNote')?.value || '').trim();
  const label = statusLabels[status] || status;
  const msg = document.getElementById('closureMsg');
  const resolveBtn = document.getElementById('resolveTicketBtn');
  const closeBtn = document.getElementById('closeTicketBtn');
  if(status === 'closed' && !note){ toast('Escribe una nota de cierre antes de cerrar la solicitud.'); return; }
  [resolveBtn, closeBtn].forEach(btn=>{ if(btn){ btn.disabled = true; btn.dataset.originalText = btn.textContent; } });
  const activeBtn = status === 'closed' ? closeBtn : resolveBtn;
  if(activeBtn) activeBtn.textContent = status === 'closed' ? 'Cerrando…' : 'Marcando…';
  if(msg) msg.innerHTML = '<div class="warning">Actualizando cierre de solicitud…</div>';
  try{
    const previousTicket = state.activeTicket;
    const { error } = await supabase.from('tickets').update({ status }).eq('id', ticketId);
    if(error) throw error;
    // La notificación interna y el correo quedan a cargo del trigger SQL v4.8.10.
    const body = note || `Solicitud marcada como ${label}.`;
    const { error: messageError } = await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      author_id: state.profile.id,
      body: `Cierre de solicitud: ${body}`,
      visibility: 'public'
    });
    if(messageError){
      console.warn('No se pudo registrar mensaje de cierre:', messageError);
      if(msg) msg.innerHTML = '<div class="warning">La solicitud se actualizó, pero no se pudo guardar la nota de cierre en la conversación.</div>';
    }else if(msg){
      msg.innerHTML = '<div class="success">Cierre actualizado correctamente.</div>';
    }
    toast(status === 'closed' ? 'Solicitud cerrada correctamente. Se enviará correo institucional.' : 'Solicitud marcada como resuelta.');
    await loadTickets();
    await loadNotifications();
    await openTicket(ticketId);
  }catch(err){
    const message = err?.message || 'No fue posible cerrar la solicitud.';
    if(msg) msg.innerHTML = `<div class="error">${safe(message)}</div>`;
    toast(message);
  }finally{
    [resolveBtn, closeBtn].forEach(btn=>{ if(btn){ btn.disabled = false; btn.textContent = btn.dataset.originalText || btn.textContent; } });
  }
}
async function reopenTicket(){
  if(!state.activeTicket?.id) return;
  const ticketId = state.activeTicket.id;
  const btn = document.getElementById('reopenTicketBtn');
  if(btn){ btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = 'Reabriendo…'; }
  try{
    const { error } = await supabase.from('tickets').update({ status:'in_progress' }).eq('id', ticketId);
    if(error) throw error;
    const { error: messageError } = await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      author_id: state.profile.id,
      body:'Solicitud reabierta para continuar la gestión.',
      visibility:'internal'
    });
    if(messageError) console.warn('No se pudo registrar mensaje de reapertura:', messageError);
    toast('Solicitud reabierta.');
    await loadTickets();
    await openTicket(ticketId);
  }catch(err){
    toast(err?.message || 'No fue posible reabrir la solicitud.');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = btn.dataset.originalText || 'Reabrir solicitud'; }
  }
}
function openActivityDetail(id){
  const a = state.activities.find(x=>String(x.id)===String(id));
  if(!a){ toast('No se encontró la actividad en el cronograma cargado.'); return; }
  const ticket = a.ticket_id ? state.tickets.find(t=>String(t.id)===String(a.ticket_id)) : null;
  modal(`<div class="modal-head activity-detail-head"><div><span class="tag">Cronograma</span><h2>${safe(a.title)}</h2><p class="muted">${safe(kindLabels[a.kind]||a.kind)} · ${safe(resourceName(a.resource_code))}</p></div><button class="close-btn" data-close>×</button></div><div class="activity-detail"><div class="activity-detail-hero ${safe(a.kind)}"><div class="activity-detail-icon">${icon(a.kind)}</div><div><strong>${safe(a.title)}</strong><p>${fmtDateTime(a.start_at)} — ${fmtDateTime(a.end_at)}</p></div></div><div class="activity-detail-grid"><div><span>Responsable</span><strong>${safe(resourceName(a.resource_code))}</strong></div><div><span>Tipo</span><strong>${safe(kindLabels[a.kind]||a.kind)}</strong></div><div><span>Inicio</span><strong>${fmtDateTime(a.start_at)}</strong></div><div><span>Fin</span><strong>${fmtDateTime(a.end_at)}</strong></div><div><span>Lugar / canal</span><strong>${safe(a.location || 'No indicado')}</strong></div><div><span>Solicitud vinculada</span><strong>${ticket?safe(ticket.ticket_number):a.ticket_id?'Vinculada':'No vinculada'}</strong></div></div><div class="activity-detail-description"><span>Detalle</span><p>${safe(a.description || 'Sin descripción adicional.')}</p></div>${ticket?`<button class="btn btn-primary btn-block" id="openLinkedTicket">Abrir solicitud vinculada</button>`:''}</div>`);
  document.getElementById('openLinkedTicket')?.addEventListener('click',()=>{ const tid=ticket.id; clearModal(); openTicket(tid); });
}
function renderPayloadList(payload){
  const entries = Object.entries(payload || {}).filter(([k,v])=>v && !['description','title'].includes(k)).slice(0,12);
  if(!entries.length) return '<p class="muted">No hay campos adicionales.</p>';
  return `<div class="payload-list">${entries.map(([k,v])=>`<div><span>${safe(k.replaceAll('_',' '))}</span><strong>${safe(String(v))}</strong></div>`).join('')}</div>`;
}

function renderMessages(){
  if(!state.ticketMessages.length) return emptyState('Sin mensajes','Aún no hay conversación asociada a esta solicitud.');
  return state.ticketMessages.map(m=>`<div class="message ${m.visibility==='internal'?'internal':''}"><div class="message-meta"><span>${m.visibility==='internal'?'Nota interna':'Respuesta pública'}</span><span>${fmtDateTime(m.created_at)}</span></div><p>${safe(m.body)}</p></div>`).join('');
}
async function sendTicketMessage(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = String(fd.get('body')||'').trim();
  const visibility = String(fd.get('visibility')||'public');
  const files = Array.from(e.target.querySelector('input[name="message_files"]')?.files || []);
  const uploadMsg = document.getElementById('messageUploadMsg');
  if(!body && !files.length) return;
  const { data: inserted, error } = await supabase.from('ticket_messages').insert({ ticket_id: state.activeTicket.id, author_id: state.profile.id, body: body || 'Archivo adjunto enviado a la Mesa.', visibility }).select('id').single();
  if(error){ toast(error.message); return; }
  if(files.length){
    try{
      await uploadFilesToDrive(files, { ticket_id: state.activeTicket.id, message_id: inserted?.id || null, source:'ticket_message', ticket_number:state.activeTicket.ticket_number, title:state.activeTicket.title }, uploadMsg);
    }catch(err){
      if(uploadMsg) uploadMsg.innerHTML = `<div class="error">Mensaje guardado, pero no se pudieron subir los archivos: ${safe(err.message || err)}</div>`;
      return;
    }
  }
  await openTicket(state.activeTicket.id);
}
async function updateTicketFromDrawer(){
  const status = document.getElementById('ticketStatus')?.value;
  const priority = document.getElementById('ticketPriority')?.value;
  const { error } = await supabase.from('tickets').update({ status, priority }).eq('id', state.activeTicket.id);
  if(error){ toast(error.message); return; }
  toast('Solicitud actualizada.'); await loadTickets(); await openTicket(state.activeTicket.id);
}
function openActivityModal(kind='support', ticket=null, preset={}){
  if(!canManageSchedule()) return toast('Debes iniciar sesión para crear actividades.');
  const selectedResource = preset.resource || state.filter.resource !== 'all' && state.filter.resource || (ticket?.assigned_team_code ? state.resources.find(r=>r.team_code===ticket.assigned_team_code)?.code : '') || state.resources[0]?.code || '';
  const startValue = preset.date ? timeToLocalInput(preset.date, preset.time || '08:00') : timeToLocalInput(state.scheduleDate, '08:00');
  const endValue = plusMinutesLocal(startValue, kind==='meeting'?60:90);
  const resourceOptions = state.resources.map(r=>`<option value="${safe(r.code)}" ${selectedResource===r.code?'selected':''}>${safe(r.name)} · ${safe(r.role_label)}</option>`).join('');
  modal(h`<div class="modal-head"><div><span class="tag">Cronograma colaborativo</span><h2>Crear actividad</h2><p class="muted">Se guardará como actividad real en Supabase y será visible para todos los usuarios autenticados.</p></div><button class="close-btn" data-close>×</button></div>
    <form id="activityForm" class="activity-form-pro">
      <div class="field"><label>Título de la actividad</label><input name="title" required maxlength="140" value="${safe(ticket?.title||'')}" placeholder="Ej. Cubrimiento entrega de ayudas"></div>
      <div class="form-grid"><div class="field"><label>Responsable</label><select name="resource_code" required>${resourceOptions}</select></div><div class="field"><label>Tipo</label><select name="kind">${kindOptions.map(k=>`<option value="${k}" ${kind===k?'selected':''}>${kindLabels[k]}</option>`).join('')}</select></div></div>
      <div class="form-grid"><div class="field"><label>Inicio</label><input name="start_at" type="datetime-local" required value="${startValue}"></div><div class="field"><label>Fin</label><input name="end_at" type="datetime-local" required value="${endValue}"></div></div>
      <div class="field"><label>Lugar / canal</label><input name="location" placeholder="Alcaldía, barrio, enlace, oficina o canal"></div>
      <div class="field"><label>Detalle</label><textarea name="description" placeholder="Notas, requerimientos, piezas, equipos, responsable de apoyo o contexto"></textarea></div>
      ${renderUploadField('activity_files','¿Enviar archivo para esta actividad?','Soportes, listados, decretos, piezas o insumos para la actividad.')}
      <div id="activityMsg"></div><button class="btn btn-primary btn-block" type="submit">Guardar actividad</button>
    </form>`);
  document.getElementById('activityForm').addEventListener('submit',async(e)=>{
    e.preventDefault(); const fd=new FormData(e.target); const msg=document.getElementById('activityMsg'); msg.innerHTML='<div class="warning">Guardando actividad…</div>';
    const argsV2 = { p_resource_code: fd.get('resource_code'), p_title: fd.get('title'), p_start_at: new Date(fd.get('start_at')).toISOString(), p_end_at: new Date(fd.get('end_at')).toISOString(), p_kind: fd.get('kind'), p_description: fd.get('description') || null, p_location: fd.get('location') || null };
    let result = ticket?.id
      ? await supabase.rpc('create_activity_for_ticket_v2', { ...argsV2, p_ticket_id: ticket.id })
      : await supabase.rpc('create_activity_v2', argsV2);
    let error = result.error;
    if(error && /function.*does not exist|schema cache|not found/i.test(error.message||'')){
      result = await supabase.rpc('create_activity_v2', argsV2);
      error = result.error;
    }
    if(error && /function.*does not exist|schema cache|not found/i.test(error.message||'')){
      result = await supabase.rpc('create_activity', { p_resource_code: argsV2.p_resource_code, p_title: argsV2.p_title, p_start_at: argsV2.p_start_at, p_end_at: argsV2.p_end_at, p_kind: argsV2.p_kind });
      error = result.error;
    }
    if(error){ msg.innerHTML=`<div class="error">${safe(error.message)}</div>`; return; }
    const createdActivity = result.data || {};
    const files = Array.from(e.target.querySelector('input[name="activity_files"]')?.files || []);
    if(files.length){
      try{
        await uploadFilesToDrive(files, { ticket_id: ticket?.id || null, activity_id: createdActivity?.id || null, source:'activity', title:argsV2.p_title }, msg);
      }catch(uploadErr){
        msg.innerHTML=`<div class="warning">La actividad fue creada, pero los archivos no se pudieron subir: ${safe(uploadErr.message || uploadErr)}</div>`;
        return;
      }
    }
    msg.innerHTML='<div class="success">Actividad creada.</div>'; toast('Actividad creada en el cronograma.'); setTimeout(async()=>{ clearModal(); await loadActivities(); renderShell(); },650);
  });
}
function openAdminResetPassword(profileId, email){
  if(!isAdmin()){ toast('Solo administradores pueden cambiar claves de otros usuarios.'); return; }
  modal(h`<div class="modal-head"><div><span class="tag">Seguridad</span><h2>Cambiar contraseña</h2><p class="muted">Usuario: <strong>${safe(email)}</strong></p></div><button class="close-btn" data-close>×</button></div><form id="adminResetPasswordForm"><input type="hidden" name="profile_id" value="${safe(profileId)}"><input type="hidden" name="email" value="${safe(email)}"><div class="field"><label>Nueva contraseña</label><input name="password" type="text" required value="1234567"></div><div id="adminResetMsg"></div><button class="btn btn-primary btn-block" type="submit">Cambiar contraseña</button><p class="help-text">Requiere tener desplegada la Edge Function <strong>admin-users</strong> con la variable <strong>SUPABASE_SERVICE_ROLE_KEY</strong>.</p></form>`);
  document.getElementById('adminResetPasswordForm')?.addEventListener('submit',adminResetPassword);
}
async function adminResetPassword(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const msg = document.getElementById('adminResetMsg');
  if((body.password||'').length < 7){ msg.innerHTML = '<div class="warning">La contraseña debe tener al menos 7 caracteres.</div>'; return; }
  msg.innerHTML = '<div class="warning">Actualizando contraseña…</div>';
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.session?.access_token||''}` }, body: JSON.stringify({ action:'reset_password', ...body }) }).catch(err=>({ ok:false, json:async()=>({ error:err.message }) }));
  const payload = await res.json().catch(()=>({ error:'Respuesta no válida' }));
  if(!res.ok || payload.error){ msg.innerHTML=`<div class="error">${safe(payload.error || 'No fue posible cambiar la contraseña.')}</div>`; return; }
  msg.innerHTML='<div class="success">Contraseña actualizada.</div>';
  toast('Contraseña actualizada.');
}
function openUserModal(){
  modal(h`<div class="modal-head"><div><span class="tag">Usuarios</span><h2>Crear usuario</h2><p class="muted">Usa correo institucional. El rol determina módulos y permisos.</p></div><button class="close-btn" data-close>×</button></div><form id="userForm"><div class="field"><label>Correo</label><input name="email" type="email" required placeholder="usuario@sanpedro-valle.gov.co"></div><div class="field"><label>Nombre completo</label><input name="full_name" required></div><div class="form-grid"><div class="field"><label>Rol</label><select name="role_code"><option value="requester">Funcionario solicitante</option><option value="communication_agent">Comunicaciones</option><option value="tic_admin">Administrador TIC</option><option value="secretary_admin">Secretario General</option><option value="super_admin">Super Admin</option></select></div><div class="field"><label>Equipo</label><select name="team_code"><option value="">Sin equipo</option><option value="TIC">TIC</option><option value="COM">Comunicaciones</option></select></div></div><div class="field"><label>Contraseña temporal</label><input name="password" type="text" placeholder="Opcional"></div><div id="userMsg"></div><button class="btn btn-primary btn-block" type="submit">Crear / actualizar usuario</button></form>`);
  document.getElementById('userForm').addEventListener('submit',saveUser);
}
async function saveUser(e){
  e.preventDefault(); const fd=new FormData(e.target); const body=Object.fromEntries(fd.entries()); const msg=document.getElementById('userMsg'); msg.innerHTML='<div class="warning">Procesando usuario…</div>';
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.session?.access_token||''}` }, body: JSON.stringify({ action:'upsert_user', ...body }) }).catch(err=>({ ok:false, json:async()=>({ error:err.message }) }));
  const payload = await res.json().catch(()=>({ error:'Respuesta no válida' }));
  if(!res.ok || payload.error){ msg.innerHTML=`<div class="error">${safe(payload.error || 'No fue posible crear usuario.')}</div>`; return; }
  msg.innerHTML='<div class="success">Usuario creado o actualizado.</div>'; toast('Usuario listo.'); await loadProfiles(); setTimeout(()=>{ clearModal(); renderShell(); },900);
}
async function runImport(type){
  const input = document.querySelector(`[data-import-file="${type}"]`); const result=document.getElementById('importResult');
  if(!input?.files?.length){ result.innerHTML='<div class="warning">Selecciona primero un CSV.</div>'; return; }
  const text = await input.files[0].text(); result.innerHTML='<div class="warning">Validando CSV…</div>';
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-import`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session.session?.access_token||''}` }, body: JSON.stringify({ type, csv:text, dry_run:false }) }).catch(err=>({ ok:false, json:async()=>({ error:err.message }) }));
  const payload = await res.json().catch(()=>({ error:'Respuesta no válida' }));
  result.innerHTML = (!res.ok || payload.error) ? `<div class="error">${safe(payload.error || 'No fue posible importar. Revisa la función bulk-import.')}</div>` : `<div class="success">Importación procesada. Registros: ${safe(payload.processed ?? payload.count ?? '')}</div>`;
}
async function maybeShowOnboarding(){
  if(state.onboardingChecked || !state.user || !state.profile || state.pendingTicketId || urlTicketId()) return;
  state.onboardingChecked = true;
  try{
    const { data, error } = await supabase.rpc('get_my_tutorial_status', { p_tutorial_code:'mesa_tic_v48' });
    if(!error && data?.seen){ state.tutorialSeen = true; return; }
  }catch(_){ /* si el patch no está aplicado, se muestra la guía una vez por sesión */ }
  setTimeout(()=>{ if(!activeModal()) openTutorialModal(true); }, 420);
}
function tutorialSteps(){
  const requester = hasRole('requester') && !canManageRequests();
  const comms = isComms();
  const admin = isAdmin();
  const base = [
    {title:'Bienvenido a la Mesa', asset:'dashboard-analytics', text:'Aquí puedes radicar solicitudes, hacer seguimiento y consultar el cronograma institucional según tu rol.'},
    {title:'Radica paso a paso', asset:'ticket-service', text:'La Mesa te guiará con ventanas ordenadas: necesidad, responsable, modalidad, fecha y revisión inteligente.'},
    {title:'Cronograma compartido', asset:'calendar-planner', text:'Todos pueden ver la agenda del Administrador TIC y los dos comunicadores. Las actividades presenciales se coordinan contra disponibilidad.'},
    {title:'Seguimiento claro', asset:'workflow-settings', text:'Cada solicitud conserva estado, mensajes, responsable, tiempos estimados y datos enviados.'}
  ];
  if(comms) base.push({title:'Workspace de Comunicaciones', asset:'role-comunicaciones', text:'Solo verás solicitudes de publicaciones, cubrimientos, diseño, video y campañas dirigidas a Comunicaciones.'});
  if(admin) base.push({title:'Panel administrativo', asset:'user-security', text:'Tendrás usuarios, checklist de lanzamiento, reportes, bandejas y control operativo según permisos.'});
  if(requester) base.push({title:'Portal de funcionario', asset:'role-funcionario', text:'Solo verás tus solicitudes, nueva radicación, centro de ayuda, notificaciones y cronograma.'});
  return base;
}
function openTutorialModal(auto=false){
  if(auto && activeWizard()) return;
  const steps = tutorialSteps();
  state.tutorialStep = Math.min(state.tutorialStep || 0, steps.length-1);
  const s = steps[state.tutorialStep];
  modal(h`<div class="modal-head guide-head"><div><span class="tag">Guía rápida</span><h2>${safe(s.title)}</h2><p class="muted">Tutorial de uso · Paso ${state.tutorialStep+1} de ${steps.length}</p></div><button class="close-btn" data-close>×</button></div>
    <section class="guide-layout">
      <div class="guide-visual">${assetIcon(s.asset, s.title, 'guide-img')}</div>
      <div class="guide-copy"><div class="guide-progress">${steps.map((_,i)=>`<span class="${i===state.tutorialStep?'active':''}"></span>`).join('')}</div><h3>${safe(s.title)}</h3><p>${safe(s.text)}</p><div class="guide-tips">${guideTipsForStep(state.tutorialStep).map(t=>`<div>${icon('check')}<span>${safe(t)}</span></div>`).join('')}</div></div>
    </section>
    <div class="wizard-actions guide-actions">
      ${state.tutorialStep>0?'<button class="btn btn-soft" id="guideBack">Atrás</button>':'<button class="btn btn-soft" id="guideSkip">Omitir por ahora</button>'}
      ${state.tutorialStep<steps.length-1?'<button class="btn btn-primary" id="guideNext">Continuar</button>':'<button class="btn btn-primary" id="guideFinish">Finalizar guía</button>'}
    </div>`);
  document.getElementById('guideBack')?.addEventListener('click',()=>{ state.tutorialStep--; openTutorialModal(auto); });
  document.getElementById('guideNext')?.addEventListener('click',()=>{ state.tutorialStep++; openTutorialModal(auto); });
  document.getElementById('guideSkip')?.addEventListener('click',()=>{ state.tutorialSeen = true; clearModal(); });
  document.getElementById('guideFinish')?.addEventListener('click',async()=>{ await markTutorialSeen(); clearModal(); toast('Guía completada.'); });
}
function guideTipsForStep(step){
  const tips = [
    ['La Mesa no muestra módulos sin permiso.', 'Todo inicia desde tu usuario institucional.', 'Usa el botón Guía cuando necesites repasar.'],
    ['Primero eliges el servicio.', 'Luego defines responsable y modalidad.', 'Antes de radicar se muestra carga y estimado.'],
    ['Presencial revisa agenda.', 'Virtual usa estimación de tiempo.', 'Si hay sobrecarga, la Mesa avisa sin bloquear.'],
    ['Abre la solicitud para ver el workspace.', 'Responde desde mensajes.', 'El historial conserva el contexto.'],
    ['Filtra comunicaciones por publicaciones, video, diseño o cubrimientos.', 'Crea actividades COM desde cronograma.', 'Coordina entregas y eventos.'],
    ['Revisa checklist antes de publicar.', 'Valida roles con pantalla de prueba.', 'Usa reportes para seguimiento.'],
    ['Radica y consulta solo lo tuyo.', 'Revisa cronograma común.', 'Recibe respuestas dentro de la Mesa.']
  ];
  return tips[step] || tips[0];
}
async function markTutorialSeen(){
  state.tutorialSeen = true;
  try{ await supabase.rpc('mark_tutorial_seen', { p_tutorial_code:'mesa_tic_v48' }); }catch(_){ /* fallback silencioso */ }
}
function modal(content){
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${content}</div></div>`;
  const modalEl = modalRoot.querySelector('.modal');
  if(modalEl?.querySelector('#wizardForm')) modalEl.classList.add('wizard-modal');
  if(modalEl?.querySelector('.guide-layout')) modalEl.classList.add('guide-modal');
  modalRoot.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{
    if(activeWizard() && !confirm('¿Cerrar la solicitud? El borrador se conservará durante esta sesión.')) return;
    clearModal();
  }));
  modalRoot.querySelector('.modal-backdrop')?.addEventListener('click',e=>{
    if(!e.target.classList.contains('modal-backdrop')) return;
    if(modalEl?.classList.contains('wizard-modal')) { toast('La solicitud está protegida. Usa Cancelar o la X si realmente quieres cerrarla.'); return; }
    clearModal();
  });
}
function clearModal(){ modalRoot.innerHTML=''; }

init();


})();
