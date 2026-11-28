/* Offline shell for the trip app: the page and its icons are cached so the app still opens with no signal.
   Pages are network-first (always fresh when online); Firebase keeps its own offline copy of the trip data. */
const CACHE = 'italy-trip-v3';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com/.test(url.href);
  if (!sameOrigin && !cdn) return; /* Firestore, weather and rates go straight to the network */
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
});

/* Hype notifications sent by notify/send.mjs (Firebase Cloud Messaging, data-only).
   Every push must show a notification, or iPhones stop delivering them. */
self.addEventListener('push', e => {
  let j = {}; try { j = e.data ? e.data.json() : {}; } catch (_) { j = {body: e.data ? e.data.text() : ''}; }
  const d = j.data || j.notification || j;
  e.waitUntil(self.registration.showNotification(d.title || 'إيطاليا ✈️', {
    body: d.body || 'عندنا شي حماسي لك 🇮🇹', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    lang: 'ar', dir: 'rtl', tag: d.tag || 'hype', data: {url: d.url || './'}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
