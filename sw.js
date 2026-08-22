const CACHE_NAME = 'mesa-tic-v4-9-1-shell';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.css?v=4.9.1',
  './config.js?v=4.9.0',
  './app.js?v=4.9.0',
  './site.webmanifest',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon.ico',
  './assets/loader-hourglass.gif',
  './assets/notification-soft.mp3'
  ,'./assets/ui-icons/role-funcionario.png'
  ,'./assets/ui-icons/role-comunicaciones.png'
  ,'./assets/ui-icons/role-cio-tic.png'
  ,'./assets/ui-icons/role-secretario-general.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS).catch(() => null)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase.co') || url.hostname.includes('google.com') || url.hostname.includes('gstatic.com')) return;
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => null);
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
