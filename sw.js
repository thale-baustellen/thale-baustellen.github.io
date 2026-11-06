/* Baustellen-App · Service Worker – hält die App offline verfügbar */
const VERSION = 'bs-v1.1';
const DATEIEN = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSION).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Backend-Aufrufe nie zwischenspeichern
  const istSeite = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (istSeite) {
    // Seite: erst Netz (für Updates), sonst Zwischenspeicher
    e.respondWith(fetch(e.request).then(r => {
      const kopie = r.clone();
      caches.open(VERSION).then(c => c.put('index.html', kopie));
      return r;
    }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(t => t || fetch(e.request)));
});
