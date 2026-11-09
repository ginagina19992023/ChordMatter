const V = 'hexian-v94';
const FILES = ['./', 'index.html', 'style.css', 'theory.js', 'data.js', 'harmony.js', 'symbols.js', 'inversions.js', 'logic.js', 'cards.js', 'combos.js', 'terms.js', 'app.js', 'staff.js', 'listen.js', 'score.js', 'fullscore.js', 'roll.js', 'ocr.js', 'sight.js', 'vendor/vexflow.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
// 网络优先，离线时用缓存：更新会自动生效
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // GitHub 同步等外部请求不缓存
  // 网络优先；服务器出错（如 GitHub 部署中的 503）或离线时，用手机上缓存的版本
  e.respondWith(fetch(e.request).then(r => {
    if (!r.ok && r.status !== 0) return caches.match(e.request).then(c => c || r);
    const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
