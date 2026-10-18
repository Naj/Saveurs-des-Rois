/* Saveurs des Rois — service worker de l'administration (application installable « SDR Gestion »)
   Rien n'est mis en cache : l'administration est toujours la version en ligne, à jour.
   Sans connexion, une page explique qu'il faut du réseau. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const HORS_LIGNE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pas de connexion — SDR Gestion</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fbf8f1;font:18px/1.5 Georgia,serif;text-align:center;padding:1.5rem">
<div><p style="font-size:2.4rem;margin:0">📡</p><h1 style="color:#d6b55d;font-weight:600">Pas de connexion</h1>
<p>L’administration a besoin d’Internet pour afficher vos demandes et vos fiches.</p>
<button onclick="location.reload()" style="margin-top:1rem;background:#d6b55d;border:0;border-radius:999px;padding:.7rem 1.4rem;font:inherit;cursor:pointer">Réessayer</button></div></body></html>`;

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(HORS_LIGNE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
