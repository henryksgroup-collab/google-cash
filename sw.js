/* Google Cash — Service Worker v1 */
const CACHE = 'gc-cache-v1';
const STATIC = ['/admin.html', '/checkout.html', '/manifest.json', '/assets/icon.svg'];

/* ── Install: cache static assets ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for static, network-first for API ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // never cache API
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }))
  );
});

/* ── Push: show notification + notify open tabs ── */
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: '🤑 Nova Venda!', body: e.data.text() }; }

  const opts = {
    body: data.body || 'Google Cash',
    icon: '/assets/icon.svg',
    badge: '/assets/icon.svg',
    vibrate: [200, 100, 400, 100, 200, 100, 400],
    tag: 'gc-sale',
    requireInteraction: false,
    data: { url: '/admin.html', payload: data }
  };

  e.waitUntil(Promise.all([
    self.registration.showNotification(data.title || '🤑 Nova Venda — Google Cash!', opts),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
      list.forEach(c => c.postMessage({ type: 'NEW_SALE', payload: data }))
    )
  ]));
});

/* ── Notification click: focus or open admin ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('/admin') && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/admin.html');
    })
  );
});
