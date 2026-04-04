/* Google Cash — Service Worker v2 */
const CACHE = 'gc-cache-v2';
const STATIC = ['/admin.html', '/checkout.html', '/manifest.json'];

/* ── Install ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC).catch(() => {}))
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

/* ── Fetch: network-first for API, cache-first for assets ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached))
  );
});

/* ── Push: mostra notificacao nativa + avisa abas abertas ── */
self.addEventListener('push', e => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'Google Cash', body: e.data.text() }; }

  const amount = data.amount
    ? 'R$ ' + Number(data.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : null;

  const title = data.title || 'Google Cash — Venda Realizada!';
  const body  = amount
    ? (data.buyer ? data.buyer + ' — ' + amount : amount)
    : (data.body || 'Nova venda confirmada!');

  const opts = {
    body,
    icon: '/assets/icon.svg',
    badge: '/assets/icon.svg',
    image: '/assets/icon.svg',
    vibrate: [300, 100, 300, 100, 600],
    sound: 'default',
    tag: 'gc-sale-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: { url: '/admin.html', payload: data }
  };

  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
      list.forEach(c => c.postMessage({ type: 'NEW_SALE', payload: data }))
    )
  ]));
});

/* ── Clique na notificacao: abre o admin ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/admin') && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/admin.html');
    })
  );
});
