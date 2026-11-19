/* Service worker — fonctionnement hors ligne de la PWA.
   VERSION et FICHIERS sont remplis par scripts/build.mjs à chaque build. */
const VERSION = '__VERSION__';
const FICHIERS = __FICHIERS__;
const CACHE = 'pmcms-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k.startsWith('pmcms-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// L'application demande l'activation après accord de l'utilisateur (« Mettre à jour »)
self.addEventListener('message', e => { if (e.data && e.data.type === 'ACTIVER') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Supabase et autres : réseau direct
  if (req.mode === 'navigate') {
    // Pages : réseau d'abord (version à jour), cache si hors ligne
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copie)); }
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // Ressources : cache d'abord, puis réseau (et mise en cache)
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(enCache => enCache || fetch(req).then(r => {
    if (r.ok && r.type === 'basic') { const copie = r.clone(); caches.open(CACHE).then(c => c.put(req, copie)); }
    return r;
  })));
});
