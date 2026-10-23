/* Service worker — Kiểm kê kho · MedDental: chạy offline sau lần mở đầu tiên có mạng */
var V='kk-v2311';
var CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
var CDN=['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js','https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(V).then(function(c){
    return Promise.all(CORE.map(function(u){return c.add(u).catch(function(){});}).concat(CDN.map(function(u){return c.add(new Request(u,{mode:'no-cors'})).catch(function(){});})));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('kk-')===0&&k!==V;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;if(r.method!=='GET')return;
  var u=new URL(r.url),same=u.origin===self.location.origin;
  var cdn=/(^|\.)(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(u.hostname);
  if(!same&&!cdn)return;
  if(r.mode==='navigate'||(same&&/(index\.html|\/)$/.test(u.pathname))){
    /* Trang chính: ưu tiên bản mới từ mạng, mất mạng thì dùng bản đã lưu */
    e.respondWith(fetch(r).then(function(res){var cp=res.clone();caches.open(V).then(function(c){c.put('index.html',cp);});return res;}).catch(function(){return caches.match('index.html').then(function(m){return m||caches.match('./');});}));
    return;
  }
  /* Thư viện, font, ảnh biểu tượng: dùng bản đã lưu, đồng thời cập nhật ngầm */
  e.respondWith(caches.match(r).then(function(m){
    var net=fetch(r).then(function(res){if(res&&(res.ok||res.type==='opaque')){var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp);});}return res;}).catch(function(){return m;});
    return m||net;
  }));
});
