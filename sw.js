/* Service worker — Kiểm kê kho. Đổi CACHE khi muốn ép máy tải lại toàn bộ. */
var CACHE="kk-v2026110401";
var CORE=["./","index.html","manifest.webmanifest","icon-192.png",
  "lib/xlsx.full.min.js","lib/exceljs.min.js","lib/zxing.min.js"];
var CDN=/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install",function(e){
  /* thiếu file nào cũng không làm hỏng cả lần cài */
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(CORE.map(function(u){return c.add(u).catch(function(){});}));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener("activate",function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
function put(req,res){
  if(res&&(res.ok||res.type==="opaque")){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(req,cp);});}
  return res;
}
self.addEventListener("fetch",function(e){
  var r=e.request,u=new URL(r.url);
  if(r.method!=="GET")return;
  /* kiểm tra bản mới (?_=...) phải luôn lấy từ mạng */
  if(u.origin===location.origin&&u.searchParams.has("_"))return;
  /* trang chính: mạng trước, mất mạng thì dùng bản đã lưu */
  if(r.mode==="navigate"||(u.origin===location.origin&&/(\/|index\.html)$/.test(u.pathname))){
    e.respondWith(fetch(r).then(function(res){return put(r,res);}).catch(function(){
      return caches.match(r,{ignoreSearch:true}).then(function(m){return m||caches.match("index.html");});
    }));
    return;
  }
  /* thư viện, icon, CDN: ưu tiên bản đã lưu, thiếu thì tải rồi lưu */
  if(u.origin===location.origin||CDN.test(r.url)){
    e.respondWith(caches.match(r).then(function(m){
      return m||fetch(r).then(function(res){return put(r,res);});
    }));
  }
});
