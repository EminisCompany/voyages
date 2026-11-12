// Offline support: app shell is cached; API GETs are network-first with a cached fallback.
const SHELL = 'shell-v1', DATA = 'data-v1';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'api.js', 'manifest.webmanifest', 'icons/icon.svg', 'data/patch-index.json'];
const API_HOSTS = ['v2.xivapi.com', 'universalis.app'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (API_HOSTS.includes(u.hostname)) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(DATA).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
  } else if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(hit => { const net = fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then(x => x.put(e.request, c)); } return r; }); return hit || net; }));
  }
});
