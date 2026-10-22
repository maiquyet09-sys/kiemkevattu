/* Lưu đệm thư viện CDN (bộ đọc số, bộ đọc mã vạch, dữ liệu ngôn ngữ) để dùng lại khi mạng yếu/mất mạng.
   Không đụng tới index.html và bỏ qua các yêu cầu no-cors nên không gây lỗi cho bộ đọc số. */
var CACHE='ocr-cdn-v2';
self.addEventListener('install',function(e){self.skipWaiting();});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var u;try{u=new URL(e.request.url);}catch(x){return;}
  if(e.request.method!=='GET'||e.request.mode==='no-cors')return;
  if(u.hostname!=='cdn.jsdelivr.net'&&u.hostname!=='cdnjs.cloudflare.com')return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(e.request).then(function(hit){
      if(hit)return hit;
      return fetch(e.request).then(function(res){
        if(res&&res.ok&&res.type!=='opaque')c.put(e.request,res.clone());
        return res;
      });
    });
  }));
});
