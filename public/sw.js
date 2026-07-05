const CACHE = 'poker-club-v3.6';
const STATIC = [
  '/',
  '/style.css',
  '/handEval.js',
  '/img/card-dog.jpg',
  '/img/card-roatan.jpg',
  '/img/icon-192.png',
  '/img/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Remove old caches
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never intercept Socket.IO or dynamic requests
  if (url.includes('socket.io') || e.request.method !== 'GET') return;
  // Network-first for HTML (always get latest app)
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Cache-first for static assets
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
