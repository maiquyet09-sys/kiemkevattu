/* Chạy:  node tests/run-tests.js [đường-dẫn/index.html]
   Không cần cài gì thêm (Node 18+). Trích hàm thật từ index.html rồi kiểm tra — không sao chép logic. */
const fs=require("fs"),vm=require("vm"),path=require("path");
const file=process.argv[2]||path.join(__dirname,"..","index.html");
const html=fs.readFileSync(file,"utf8");
const src=html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
let pass=0,fail=0;
function t(name,fn){return Promise.resolve().then(fn).then(()=>{pass++;},e=>{fail++;console.log("✗ "+name+"\n    "+(e&&e.message||e));});}
function eq(a,b,m){const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m||"")+" mong đợi "+y+" nhưng được "+x);}
function near(a,b,m){if(Math.abs(a-b)>1e-9)throw new Error((m||"")+" mong đợi "+b+" nhưng được "+a);}

/* ---------- 1. Trích hàm/biến cấp cao nhất (không chạy khởi động, không cần DOM) ---------- */
const L=src.split("\n"),out=[];
for(let i=0;i<L.length;i++){
  const l=L[i];
  if(/^function [A-Za-z0-9_$]+\(/.test(l)){
    let j=i;
    if(/\{\s*$/.test(l)){while(j<L.length&&L[j]!=="}")j++;}
    const chunk=L.slice(i,j+1).join("\n");
    try{new vm.Script(chunk);out.push(chunk);i=j;}catch(e){/* hàm không trích riêng được (không cần cho test) → bỏ qua */}
  }else if(/^var (PAY|PAY_CSL0|PAY_CFG0|PAY_LOI|PAY_LOI_KW|BK_SCHEMA)\b/.test(l))out.push(l);
}
const ctx=vm.createContext({console,Math,Date,JSON,Object,Array,String,Number,isNaN,parseFloat,parseInt,
  XLSX:{SSF:{parse_date_code:()=>null}},document:{},window:{},localStorage:{}});
vm.runInContext('var db={periods:[],profile:{ten:"T"}};\n'+out.join("\n"),ctx);
const G=n=>vm.runInContext(n,ctx);

(async()=>{
/* ---------- 2. Đọc số tiền ---------- */
await t("parseNum: định dạng VN/US",()=>{
  const f=G("parseNum");
  eq(f("1.234.567"),1234567);eq(f("1,234,567"),1234567);eq(f("1.234,56"),1234.56);
  eq(f("1,234.56"),1234.56);eq(f("-2.500.000"),-2500000);eq(f(""),0);eq(f(null),0);eq(f(5000000),5000000);
});
await t("rcNum: tiền hoá đơn",()=>{
  const f=G("rcNum");
  eq(f("1.234.567,5"),1234567.5);eq(f("1,234,567"),1234567);eq(f("12.5"),12.5);
  eq(f("-1.500.000"),-1500000);eq(f(""),0);eq(f(3200),3200);eq(f("1.234"),1234);
});
await t("rcDate / payD / payDs",()=>{
  const d=G("rcDate");
  eq(d("05/11/2026"),{d:5,m:11,y:2026});eq(d("2026-11-05"),{d:5,m:11,y:2026});eq(d("5-1-2026"),{d:5,m:1,y:2026});
  eq(d(""),null);eq(d("abc"),null);
  eq(G("payD")("05/11/2026"),20261105);eq(G("payD")(""),0);eq(G("payDs")(20261105),"05/11/2026");
});
await t("payHn, payK, payF, payPri",()=>{
  eq(G("payHn")("HD 000123"),"123");eq(G("payHn")(""),"");
  eq(G("payK")("Công ty TNHH Đại-Việt"),"cong ty tnhh dai viet");
  eq(G("payF")(1234567),"1.234.567");
  const p=G("payPri");eq(p(9999999),"③ Thấp");eq(p(10000000),"② T.Bình");eq(p(49999999),"② T.Bình");eq(p(50000000),"① CAO");
});

/* ---------- 3. Đề nghị thanh toán: đối chiếu phiếu mua ↔ hoá đơn ---------- */
function setup(mua,hd,m){
  vm.runInContext("db.pay=null;PAY.m="+JSON.stringify(m||"all"),ctx);
  const P=G("payDb")();P.ncc=[["ABC","Công ty ABC","123456","VCB","HN"]];P.mua=mua;P.hd=hd;
  return G("payCompute")()[0];
}
/* phiếu mua: [ngày, số phiếu, ?, ?, tổng, trước VAT, số HĐ, cơ sở, NCC]; HĐ: [ngày,?,?,?,trước VAT,VAT,tổng,số HĐ,NCC] */
const M=(so,tong,hdn)=>[20261105,"NK-BTX-"+so,so,0,tong,tong/1.1,hdn,"",  "Công ty ABC"];
const H=(n,tong,d)=>[d||20261105,"","","",tong/1.1,tong-tong/1.1,tong,n,"Công ty ABC"];
await t("pay: khớp hoàn toàn → khop, chốt = tổng",()=>{
  const g=setup([M("1",1000000,"10"),M("2",2000000,"11")],[H("10",1000000),H("11",2000000)]);
  eq(g.khop,true);eq(g.chot,3000000);eq(g.bad,0);eq(g.nOk,2);
});
await t("pay: lệch tiền > 0,5đ thì KHÔNG chốt; đúng 0,5đ thì vẫn khớp",()=>{
  let g=setup([M("1",1000000,"10"),M("2",2000000,"11")],[H("10",1000000),H("11",2000400)]);
  eq(g.rows.map(r=>r.st),["ok","diff"]);eq(g.chot,1000000);eq(g.tong,3000000);eq(g.khop,false);
  g=setup([M("1",1000000,"10")],[H("10",1000000.5)]);eq(g.rows[0].st,"ok");
});
await t("pay: thiếu HĐ / chưa có số HĐ / trùng số HĐ đều bị loại khỏi chốt",()=>{
  const g=setup([M("1",100,"10"),M("2",200,""),M("3",300,"12"),M("4",400,"12")],[H("10",100),H("12",300)]);
  eq(g.rows.map(r=>r.st),["ok","noHd","dup","dup"]);eq(g.chot,100);eq(g.bad,3);
  const g2=setup([M("1",100,"77")],[]);eq(g2.rows[0].st,"missing");eq(g2.chot,0);
});
await t("pay: HĐ thừa (không có phiếu mua) được tính riêng, không vào chốt",()=>{
  const g=setup([M("1",100,"10")],[H("10",100),H("99",555)]);
  eq(g.extra.length,1);eq(g.extraSum,555);eq(g.chot,100);eq(g.khop,false);
});
await t("pay: lọc theo tháng chỉ tính đúng tháng",()=>{
  const g=setup([M("1",100,"10"),[20261001,"NK-BTX-2",2,0,900,900,"11","","Công ty ABC"]],[H("10",100),H("11",900,20261001)],"202611");
  eq(g.rows.length,1);eq(g.chot,100);
});
await t("pay: nhận diện cơ sở từ số phiếu & mức ưu tiên",()=>{
  const g=setup([M("1",60000000,"10")],[H("10",60000000)]);
  eq(g.rows[0].r[7],"BTX");eq(g.pri,"① CAO");
});

/* ---------- 4. Sao lưu: phát hiện file hỏng ---------- */
await t("bkIntegrity: phát hiện sửa/cắt file",()=>{
  const sum=G("bkSum"),core=G("bkCore"),chk=G("bkIntegrity");
  const mk=()=>{const d={periods:[{id:"a",items:[]}],x:1};d.__sync={schema:2,ky:1,sum:sum(core(d))};return d;};
  eq(chk(mk()),{});
  let d=mk();d.x=2;if(!chk(d).bad)throw new Error("không phát hiện bị sửa");
  d=mk();d.periods.push({id:"b",items:[]});if(!chk(d).bad)throw new Error("không phát hiện thiếu/thừa kỳ");
  d=mk();d.__sync.schema=99;if(!chk(d).bad)throw new Error("không chặn file từ bản app mới hơn");
  d=mk();delete d.__sync;if(!chk(d).warn)throw new Error("file cũ phải có cảnh báo");
});

/* ---------- 5. Lưu trữ IndexedDB (giả lập trình duyệt) ---------- */
const sa=src.indexOf("var LS_MAX="),sb=src.indexOf('window.addEventListener("pagehide"');
const storeSrc=src.slice(sa,sb);
function fakeIDB(init,failWrites){
  const data=new Map(init||[]);
  const st={get(k){const q={};setTimeout(()=>{q.result=data.get(k);q.onsuccess&&q.onsuccess();},0);return q;},
            put(v,k){setTimeout(()=>{if(failWrites){tx.onerror&&tx.onerror();}else{data.set(k,v);tx.oncomplete&&tx.oncomplete();}},0);}};
  const tx={objectStore:()=>st};
  return {data,open(){const r={};setTimeout(()=>{r.result={createObjectStore(){},transaction:()=>tx};r.onupgradeneeded&&r.onupgradeneeded();r.onsuccess&&r.onsuccess();},0);return r;}};
}
function fakeLS(init,quota){
  const m=new Map(Object.entries(init||{}));
  return {m,getItem:k=>m.has(k)?m.get(k):null,removeItem:k=>m.delete(k),
    setItem(k,v){if(quota!==undefined&&String(v).length>quota)throw new Error("QuotaExceeded");m.set(k,String(v));}};
}
async function mkStore(o){
  const c=vm.createContext({console:{error(){},log(){}},Date,JSON,Number,String,Error,Math,setTimeout,clearTimeout,
    localStorage:o.ls,indexedDB:o.idb,navigator:{},document:{body:null,getElementById:()=>null},toast(){},
    db:{periods:[],folders:[],profile:{ten:"T"},mark:o.mark||0}});
  vm.runInContext(storeSrc,c);
  await new Promise(r=>vm.runInContext("store.boot",c)(r));
  return {c,run:s=>vm.runInContext(s,c)};
}
const wait=()=>new Promise(r=>setTimeout(r,30));
const rec=(mark,at)=>({s:JSON.stringify({periods:[],mark}),at});

await t("store: máy mới → lưu vào cả IndexedDB lẫn localStorage",async()=>{
  const ls=fakeLS(),idb=fakeIDB();const S=await mkStore({ls,idb});
  eq(S.run("store.load()"),null);S.run("db.mark=7");eq(S.run("store.save()"),true);await wait();
  eq(JSON.parse(idb.data.get("db").s).mark,7);eq(JSON.parse(ls.getItem("kk_db_v1")).mark,7);
});
await t("store: dữ liệu cũ chỉ có ở localStorage → được đọc và chuyển sang IndexedDB",async()=>{
  const ls=fakeLS({kk_db_v1:JSON.stringify({periods:[],mark:5})}),idb=fakeIDB();const S=await mkStore({ls,idb});
  eq(S.run("(db=store.load()).mark"),5);S.run("store.save()");await wait();eq(JSON.parse(idb.data.get("db").s).mark,5);
});
await t("store: chọn bản MỚI hơn giữa IndexedDB và localStorage",async()=>{
  let ls=fakeLS({kk_db_v1:JSON.stringify({periods:[],mark:1}),kk_db_at:"100"}),idb=fakeIDB([["db",rec(2,200)]]);
  eq((await mkStore({ls,idb})).run("store.load().mark"),2);
  ls=fakeLS({kk_db_v1:JSON.stringify({periods:[],mark:1}),kk_db_at:"300"});idb=fakeIDB([["db",rec(2,200)]]);
  eq((await mkStore({ls,idb})).run("store.load().mark"),1);
});
await t("store: dữ liệu lớn (> 3,5 MB) chỉ nằm ở IndexedDB, không báo lỗi đầy bộ nhớ",async()=>{
  const ls=fakeLS({kk_db_v1:"{}",kk_db_at:"1"},5000000),idb=fakeIDB();const S=await mkStore({ls,idb});
  S.run('db.big="'+"x".repeat(4000000)+'"');eq(S.run("store.save()"),true);await wait();
  eq(JSON.parse(idb.data.get("db").s).big.length,4000000);eq(ls.getItem("kk_db_v1"),null,"bản localStorage cũ phải được dọn");
});
await t("store: localStorage đầy nhưng IndexedDB còn → vẫn lưu được",async()=>{
  const ls=fakeLS({},10),idb=fakeIDB();const S=await mkStore({ls,idb});
  eq(S.run("store.save()"),true);await wait();eq(JSON.parse(idb.data.get("db").s).mark,0);
});
await t("store: không có IndexedDB → dùng localStorage như cũ",async()=>{
  const ls=fakeLS();const S=await mkStore({ls,idb:undefined});
  S.run("db.mark=9");eq(S.run("store.save()"),true);eq(JSON.parse(ls.getItem("kk_db_v1")).mark,9);
});
await t("store: dữ liệu hỏng KHÔNG bị ghi đè",async()=>{
  const ls=fakeLS(),idb=fakeIDB([["db",{s:"{hong",at:5}]]);const S=await mkStore({ls,idb});
  eq(S.run("store.load()"),null);eq(S.run("store.blocked"),true);eq(S.run("store.save()"),false);
  eq(idb.data.get("db").s,"{hong");
});
await t("store: ghi IndexedDB thất bại + localStorage không đủ chỗ → báo không lưu được",async()=>{
  const ls=fakeLS({},10),idb=fakeIDB([],true);const S=await mkStore({ls,idb});
  S.run("store.save()");await wait();eq(S.run("IDBM.fail"),true);
});

console.log("\n"+(fail?"✗ ":"✓ ")+pass+" đạt, "+fail+" lỗi");
process.exit(fail?1:0);
})();
