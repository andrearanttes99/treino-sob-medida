const CACHE='treino-v15';
const ASSETS=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const save=r=>{if(r&&(r.ok||r.type==='opaque')){const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c))}return r};
  // Página: busca a versão nova primeiro e só usa o cache sem internet
  if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).then(save).catch(()=>caches.match(e.request).then(h=>h||caches.match('index.html'))));return}
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(save).catch(()=>hit);
    return hit||net;
  }));
});
