/* Saveurs des Rois — service worker (application installable)
   - L'administration et l'API admin ne passent jamais par le cache.
   - Pages et catalogue : réseau d'abord, copie locale si hors connexion.
   - Images et fichiers du site : servis depuis le cache, mis à jour en arrière-plan. */

const VERSION = '3.1';
const CACHE = `sdr-${VERSION}`;
const PRECACHE = [
  '/', '/index.html', '/404.html',
  `/css/site.css?v=${VERSION}`, `/js/app.js?v=${VERSION}`, `/js/catalogue-data.js?v=${VERSION}`,
  '/manifest.webmanifest',
  '/assets/img/logo-transparent.webp', '/assets/img/logo-mark.webp', '/assets/img/favicon.png',
  '/assets/img/icon-192.png', '/assets/img/icon-512.png',
  '/assets/img/sable-royal.webp', '/assets/img/cornes-de-gazelle.webp', '/assets/img/cornes-de-gazelle-coffrets.webp',
  '/assets/img/chbakia.webp', '/assets/img/haloua-sesame.webp', '/assets/img/makrout.webp',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sdr-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function reseauDabord(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl || request, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackUrl || request)) || (await cache.match('/')) || Response.error();
  }
}

async function cacheDabord(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const reseau = fetch(request).then(res => {
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || reseau;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // lecture audio (requêtes partielles) : directement au réseau
  const url = new URL(req.url);

  // Polices Google : en cache pour l'affichage hors connexion
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheDabord(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Jamais de cache pour l'administration, les devis et le suivi d'audience
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin') || url.pathname === '/api/track') return;
  if (url.pathname.startsWith('/media/fichier/') || url.pathname === '/carte.pdf') return; // musique et carte : toujours la dernière version

  if (req.mode === 'navigate') { event.respondWith(reseauDabord(req)); return; } // chaque page sous sa propre adresse, accueil en secours
  if (url.pathname === '/api/catalogue') { event.respondWith(reseauDabord(req)); return; }
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(cacheDabord(req));
});
