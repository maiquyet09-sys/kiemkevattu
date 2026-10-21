/* Lưu đệm thư viện CDN (bộ đọc số, bộ đọc mã vạch, dữ liệu ngôn ngữ) để dùng lại khi mạng yếu/mất mạng.
   Không đụng tới index.html nên không ảnh hưởng việc cập nhật app. */
var CACHE='ocr-cdn-v1';
self.addEventListener('install',function(e){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(e){
  var u;try{u=new URL(e.request.url);}catch(x){return;}
  if(e.request.method!=='GET')return;
  if(u.hostname!=='cdn.jsdelivr.net'&&u.hostname!=='cdnjs.cloudflare.com')return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(e.request).then(function(hit){
      if(hit)return hit;
      return fetch(e.request).then(function(res){
        if(res&&(res.ok||res.type==='opaque'))c.put(e.request,res.clone());
        return res;
      });
    });
  }));
});
