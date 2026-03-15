// Knight Traders Service Worker - PWA Support
const CACHE = 'kt-v1';
const STATIC = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/style.css',
  '/css/dashboard.css',
  '/css/admin.css',
  '/js/app.js',
  '/js/dashboard.js',
  '/images/kt-logo.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API calls - always network first
  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({success:false,message:'Offline'}),
          {headers:{'Content-Type':'application/json'}})
      )
    );
    return;
  }
  // Static assets - cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
