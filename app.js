if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
const KEY="tavars-v1";
const THEME_KEY="tavars-theme-v1";
const defaultState={cash:0,openingCash:0,cashAdjustments:[],products:[],sales:[],expenses:[],incomes:[],purchases:[],stockPurchases:[],settings:{shopName:"TAVAR'S",currency:"UZS",user:"None"}};
let state=load();
let route="dashboard";
let searchTerm="";
function localDateString(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`}
function localMonthString(d=new Date()){return localDateString(d).slice(0,7)}
let archiveMonth=localMonthString();
let archiveMode="month";
let archiveWeek=today();

function parseMoney(v){
  const raw=String(v??"").replace(/[^0-9-]/g,"");
  if(raw==="" || raw==="-") return 0;
  const n=Number(raw);
  return Number.isFinite(n)?n:0;
}
function formatMoneyInput(v){
  const raw=String(v??"").replace(/[^0-9]/g,"");
  return raw ? raw.replace(/\B(?=(\d{3})+(?!\d))/g,".") : "";
}
function moneyField(label,name,value="",extra=""){
  const formatted=value===""||value===null||value===undefined?"":formatMoneyInput(value);
  return `<div class="field"><label>${label}</label><input name="${name}" type="text" inputmode="numeric" autocomplete="off" value="${esc(formatted)}" data-money-input="1" ${extra}></div>`;
}
function weekRange(anchorDate){
  const start=weekStart(anchorDate||today());
  const d=dayDate(start+"T00:00:00");
  d.setDate(d.getDate()+6);
  return {start,end:localDateString(d)};
}
function formatDateUz(dateStr){
  const parts=String(dateStr||"").split("-");
  return parts.length===3?`${parts[2]}.${parts[1]}.${parts[0]}`:String(dateStr||"");
}
function shiftWeek(dateStr,amount){
  const d=dayDate(dateStr+"T00:00:00");
  d.setDate(d.getDate()+Number(amount||0)*7);
  return localDateString(d);
}


function normalizeState(raw){
  const source=raw&&typeof raw==="object"?raw:{};
  const products=(Array.isArray(source.products)?source.products:[])
    .filter(p=>p&&typeof p==="object")
    .map(p=>({...p,id:p.id||uid(),name:String(p.name||"?"),qty:Math.max(0,Number(p.qty)||0),buy:Math.max(0,Number(p.buy)||0),sell:Math.max(0,Number(p.sell)||0),addedAt:p.addedAt||nowISO()}));
  const sales=(Array.isArray(source.sales)?source.sales:[]).filter(s=>s&&typeof s==="object").map(s=>({...s,id:s.id||uid(),revenue:Math.max(0,Number(s.revenue)||0),paid:Number.isFinite(Number(s.paid))?Math.max(0,Number(s.paid)):undefined}));
  const expenses=(Array.isArray(source.expenses)?source.expenses:[]).filter(e=>e&&typeof e==="object");
  const incomes=(Array.isArray(source.incomes)?source.incomes:[]).filter(i=>i&&typeof i==="object");
  const stockPurchases=(Array.isArray(source.stockPurchases)?source.stockPurchases:[]).filter(b=>b&&typeof b==="object");
  const cashAdjustments=(Array.isArray(source.cashAdjustments)?source.cashAdjustments:[]).filter(x=>x&&typeof x==="object");

  // Legacy backups sometimes have `paid` repeated on every line of a multi-item sale.
  // Always calculate received cash by transaction, never by individual sale line.
  const salesCash=cashReceivedForSales(sales).cash;
  const incomeCash=incomes.reduce((a,i)=>a+Number(i.amount||0),0);
  const expenseCash=expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const purchaseCash=stockPurchases.reduce((a,b)=>a+Number(b.total||0),0);
  const adjustmentCash=cashAdjustments.reduce((a,x)=>a+Number(x.amount||0),0);
  const hasOpening=Number.isFinite(Number(source.openingCash));
  const hasCash=Number.isFinite(Number(source.cash));
  // If an old backup has no openingCash, reconstruct it from its saved current cash.
  // If it has neither value, use 0 instead of inventing a negative opening balance.
  const openingCash=hasOpening
    ? Number(source.openingCash)
    : hasCash
      ? Number(source.cash)-salesCash-incomeCash+expenseCash+purchaseCash-adjustmentCash
      : 0;

  return {
    ...defaultState,...source,
    products,sales,expenses,incomes,
    purchases:Array.isArray(source.purchases)?source.purchases:[],
    stockPurchases,cashAdjustments,
    openingCash:Number.isFinite(openingCash)?openingCash:0,
    cash:0,
    settings:{...defaultState.settings,...(source.settings||{}),user:String((source.settings&&source.settings.user)??"None")||"None"}
  };
}
function load(){
  try{return normalizeState(JSON.parse(localStorage.getItem(KEY)||"{}"));}
  catch{return JSON.parse(JSON.stringify(defaultState));}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch(err){toast("Saqlab bo'lmadi! Brauzer xotirasi to'lgan yoki bloklangan. Darhol JSON eksport qiling.","error");return false}}
function cashReceivedForSales(sales){
  const groups=new Map();
  for(const s of sales){
    const key=s.transactionId||s.id;
    if(!groups.has(key))groups.set(key,{total:0,paid:null});
    const g=groups.get(key);
    g.total+=Math.max(0,Number(s.revenue||0));
    if(g.paid===null && Number.isFinite(Number(s.paid)))g.paid=Number(s.paid);
  }
  let cash=0,debt=0;
  for(const g of groups.values()){
    const paid=g.paid===null?g.total:g.paid;
    cash+=Math.min(Math.max(paid,0),g.total);
    debt+=Math.max(g.total-paid,0);
  }
  return {cash,debt};
}
function calcCash(){
  const sales=cashReceivedForSales(state.sales).cash;
  const income=state.incomes.reduce((a,i)=>a+Number(i.amount||0),0);
  const expense=state.expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const buys=state.stockPurchases.reduce((a,b)=>a+Number(b.total||0),0);
  const adjustments=state.cashAdjustments.reduce((a,x)=>a+Number(x.amount||0),0);
  return Number(state.openingCash||0)+sales+income-expense-buys+adjustments;
}
function syncCash(){state.cash=calcCash();return state.cash}
function addCashAdjustment(amount,note=""){
  state.cashAdjustments.push({id:uid(),date:today(),amount:Number(amount),note:String(note||"")});
  syncCash();
}
function normalizeProductName(name){return String(name||"").trim().toLowerCase().replace(/\s+/g," ")}
function findProduct(name,buy){
  const key=normalizeProductName(name), cost=Number(buy);
  return state.products.find(p=>normalizeProductName(p.name)===key && Number(p.buy)===cost);
}
function removeEmptyProduct(p){
  // 0 dona bo'lgan mahsulot ham omborda saqlanadi.
  // U sotuv ro'yxatida ko'rinmaydi, lekin keyin yana zaxira qo'shish mumkin.
  return false;
}
function dayDate(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function weekStart(dateStr){
  const d=dayDate(dateStr+"T00:00:00"), day=d.getDay();
  const diff=day===0?-6:1-day;
  d.setDate(d.getDate()+diff);
  return localDateString(d);
}
function inDateRange(date,start,end){return String(date||"")>=start&&String(date||"")<=end}
function money(n){const v=Math.round(Number(n)||0);return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,".")+" "+state.settings.currency}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function today(){return localDateString()}
function nowISO(){return new Date().toISOString()}
function monthName(m){return new Intl.DateTimeFormat("uz-UZ",{month:"long",year:"numeric"}).format(new Date(m+"-01T12:00:00"))}
function toast(msg,type="success"){const d=document.createElement("div");d.className="toast "+type;d.textContent=msg;document.getElementById("toastRoot").appendChild(d);setTimeout(()=>d.remove(),2800)}
function weekReport(){
  const {start,end}=weekRange(today());
  const ss=state.sales.filter(x=>inDateRange(x.date,start,end));
  const ii=state.incomes.filter(x=>inDateRange(x.date,start,end));
  const ee=state.expenses.filter(x=>inDateRange(x.date,start,end));
  const bb=state.stockPurchases.filter(x=>inDateRange(x.date,start,end));
  const aa=state.cashAdjustments.filter(x=>inDateRange(x.date,start,end));
  const collected=cashReceivedForSales(ss).cash;
  const revenue=ss.reduce((a,x)=>a+Number(x.revenue||0),0);
  const income=ii.reduce((a,x)=>a+Number(x.amount||0),0);
  const expense=ee.reduce((a,x)=>a+Number(x.amount||0),0);
  const buy=bb.reduce((a,x)=>a+Number(x.total||0),0);
  const adjust=aa.reduce((a,x)=>a+Number(x.amount||0),0);
  return {start,end,revenue,collected,income,expense,buy,adjust,net:collected+income+adjust-expense-buy};
}
function calcToday(){const t=today();const sales=state.sales.filter(s=>s.date===t),incomes=state.incomes.filter(i=>i.date===t),expenses=state.expenses.filter(e=>e.date===t);const collected=cashReceivedForSales(sales);return {revenue:sales.reduce((a,s)=>a+Number(s.revenue||0),0),collected:collected.cash,debt:collected.debt,profit:sales.reduce((a,s)=>a+Number(s.profit||0),0),units:sales.reduce((a,s)=>a+Number(s.qty||0),0),income:incomes.reduce((a,i)=>a+Number(i.amount||0),0),expense:expenses.reduce((a,e)=>a+Number(e.amount||0),0),buy:state.stockPurchases.filter(b=>b.date===t).reduce((a,b)=>a+Number(b.total||0),0)}}
function uid(){return (globalThis.crypto&&globalThis.crypto.randomUUID)?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function logBuy(name,qty,unit,date,productId){
  state.stockPurchases.push({id:uid(),date:date||today(),name,productId:productId||null,qty:Number(qty),unitCost:Number(unit),total:Number(unit)*Number(qty)});
  syncCash();
}
function applyTheme(){
  const light=localStorage.getItem(THEME_KEY)!=="dark";
  document.documentElement.classList.toggle("light-mode",light);
  const b=document.getElementById("themeToggle");if(b)b.textContent=light?"🌙":"☀️";
}
function toggleTheme(){const light=document.documentElement.classList.contains("light-mode");localStorage.setItem(THEME_KEY,light?"dark":"light");applyTheme();}
function render(top){document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.route===route));const app=document.getElementById("app");app.innerHTML=pages[route]();bind();updateBell();if(top)window.scrollTo({top:0,behavior:"smooth"})}
function bindMoneyIn(root){root.querySelectorAll("[data-money-input]").forEach(i=>{i.value=formatMoneyInput(i.value);i.addEventListener("input",()=>{const old=i.value,caret=i.selectionStart??old.length,before=(old.slice(0,caret).match(/\d/g)||[]).length,raw=old.replace(/\D/g,"");i.value=formatMoneyInput(raw);if(raw&&document.activeElement===i){let pos=0,seen=0;while(pos<i.value.length&&seen<before){if(/\d/.test(i.value[pos]))seen++;pos++}try{i.setSelectionRange(pos,pos)}catch{}}});i.addEventListener("blur",()=>{i.value=formatMoneyInput(i.value)})})}
function debtInfo(){const g=new Map();for(const s of state.sales){const k=s.transactionId||s.id;if(!g.has(k))g.set(k,{t:0,p:null});const x=g.get(k);x.t+=Number(s.revenue||0);if(x.p===null&&Number.isFinite(Number(s.paid)))x.p=Number(s.paid)}let sum=0,count=0;for(const x of g.values()){const d=Math.max(x.t-(x.p===null?x.t:x.p),0);if(d>0){sum+=d;count++}}return {sum,count}}
function updateBell(){const b=document.querySelector(".notification-btn");if(!b)return;const n=state.products.filter(p=>p.qty<=3).length,d=b.querySelector("i");if(d)d.hidden=!n;b.onclick=()=>toast(n?n+" ta mahsulot tugagan yoki kam qolgan.":"Yangi bildirishnoma yo'q.")}
function openModal(title,body,onSubmit,okText="Saqlash"){const root=document.getElementById("modalRoot");root.innerHTML=`<div class="modal-backdrop"><div class="modal"><h2>${title}</h2><form id="modalForm">${body}<div class="modal-actions"><button type="button" class="btn" id="cancelModal">Bekor qilish</button><button class="btn primary">${okText}</button></div></form></div></div>`;root.querySelector(".modal-backdrop").onclick=e=>{if(e.target===e.currentTarget)root.innerHTML=""};root.querySelector("#cancelModal").onclick=()=>root.innerHTML="";root.querySelector("form").onsubmit=e=>{e.preventDefault();onSubmit(new FormData(e.target))};bindMoneyIn(root)}
function confirmAction(text,yes){openModal("Tasdiqlash",`<p class="muted">${esc(text)}</p>`,()=>{yes();document.getElementById("modalRoot").innerHTML=""},"Ha, davom etish")}
function field(label,name,type="text",value="",extra=""){return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function productForm(p={}){return `<div class="form-grid">${field("Tovar nomi","name","text",p.name||"","required")}${field("Miqdor","qty","number",p.qty??0,'min="0" step="1" required')}${moneyField("Olish narxi (UZS)","buy",p.buy??0,'data-required-money="1"')}${moneyField("Sotish narxi (UZS)","sell",p.sell??0,'data-required-money="1"')}<div class="field" style="grid-column:1/-1"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="free" style="width:auto"> Boshlang'ich zaxira: kassadan pul ayirmaslik</label></div></div>`}
const pages = {
dashboard:()=>{
  const t=calcToday(), w=weekReport(), dbt=debtInfo();
  const low=state.products.filter(p=>p.qty>0&&p.qty<=3), upcoming=state.purchases;
  const totalUnits=state.products.reduce((a,p)=>a+Number(p.qty||0),0);
  const stockValue=state.products.reduce((a,p)=>a+Number(p.qty||0)*Number(p.buy||0),0);
  const topMap=new Map();
  state.sales.forEach(s=>{const k=s.productId||s.product;const v=topMap.get(k)||{name:s.product,qty:0,revenue:0,profit:0};v.qty+=Number(s.qty||0);v.revenue+=Number(s.revenue||0);v.profit+=Number(s.profit||0);topMap.set(k,v)});
  const topParts=[...topMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,5);
  const activity=[
    ...state.sales.slice(-8).map(s=>({kind:'sale',time:s.time||'',title:'Sotuv yakunlandi',name:s.product,amount:s.revenue,date:s.date})),
    ...state.stockPurchases.slice(-6).map(x=>({kind:'stock',time:'',title:'Omborga tovar qo\'shildi',name:x.name,amount:x.total,date:x.date})),
    ...state.expenses.slice(-6).map(x=>({kind:'expense',time:'',title:'Xarajat qayd etildi',name:x.name,amount:x.amount,date:x.date}))
  ].sort((a,b)=>String(b.date+' '+b.time).localeCompare(String(a.date+' '+a.time))).slice(0,6);
  const maxBar=Math.max(1,...Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const ds=localDateString(d);return state.sales.filter(s=>s.date===ds).reduce((a,s)=>a+Number(s.revenue||0),0)}));
  const bars=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const ds=localDateString(d);const value=state.sales.filter(s=>s.date===ds).reduce((a,s)=>a+Number(s.revenue||0),0);return {label:formatDateUz(ds).slice(0,5),value,percent:value?Math.max(7,Math.round(value/maxBar*100)):0};});
  return `<section class="dashboard-page">
    <div class="dashboard-hero">
      <div><div class="eyebrow">XUSH KELIBSIZ,</div><h1>Biznesingiz<br><span>bir qarashda.</span></h1><p>Ombor, sotuv, kassa va foydani bitta zamonaviy paneldan boshqaring.</p><div class="hero-meta"><span>◷ ${formatDateUz(today())}</span><i></i><span class="status-dot">Hammasi joyida</span></div></div>
      <div class="hero-art"><div class="hero-ring"></div><div class="hero-bike">🔥</div><div class="hero-copy">TAVARLARINGIZNI<br><b>SOTISHDA<br>DAVOM ETING</b></div></div>
    </div>
    <div class="grid metrics dashboard-metrics">
      <div class="card metric accent"><div class="metric-icon">💳</div><div class="label">Joriy kassa</div><div class="value">${money(state.cash)}</div><div class="metric-foot ${w.net>=0?'positive':'negative'}">${w.net>=0?'↑':'↓'} ${money(Math.abs(w.net))} <span>shu hafta</span></div></div>
      <div class="card metric"><div class="metric-icon blue">🛒</div><div class="label">Bugungi sotuv</div><div class="value">${money(t.revenue)}</div><div class="metric-foot positive">↑ ${t.units} dona <span>bugun</span></div></div>
      <div class="card metric"><div class="metric-icon green">📈</div><div class="label">Bugungi foyda</div><div class="value">${money(t.profit)}</div><div class="metric-foot positive">↑ foyda <span>bugun</span></div></div>
      <div class="card metric"><div class="metric-icon red">📉</div><div class="label">Bugungi xarajat</div><div class="value">${money(t.expense)}</div><div class="metric-foot negative">↓ xarajat <span>bugun</span></div></div>
      <div class="card metric"><div class="metric-icon purple">👤</div><div class="label">Mijoz qarzi</div><div class="value">${money(dbt.sum)}</div><div class="metric-foot"><span>${dbt.count} ta sotuv</span></div></div>
      <div class="card metric"><div class="metric-icon dark">🏷️</div><div class="label">Ombor qiymati</div><div class="value">${money(stockValue)}</div><div class="metric-foot"><span>${totalUnits} dona mahsulot</span></div></div>
    </div>

    <div class="dashboard-grid-main">
      <div class="card chart-card"><div class="section-head"><div><h2>📊 Sotuv va foyda</h2><span class="muted tiny">So'nggi 7 kun</span></div><button class="btn small" data-route-go="archive">Arxiv →</button></div><div class="chart-area"><div class="chart-y"><span>MAX</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div class="chart-bars">${bars.map(b=>`<div class="chart-col" title="${b.label}: ${money(b.value)}"><div class="bar-wrap"><div class="bar-value" style="bottom:calc(${b.percent}% + 4px)">${b.value?Math.round(b.value/1000)+'k':''}</div><div class="bar" style="height:${b.percent}%"></div></div><span>${b.label}</span></div>`).join('')}</div></div></div>
      <div class="card activity-card"><div class="section-head"><h2>◷ So'nggi faoliyat</h2><span class="muted tiny">${activity.length} ta</span></div>${activity.length?`<div class="activity-list">${activity.map(a=>`<div class="activity-item"><div class="activity-icon ${a.kind}">${a.kind==='sale'?'🛒':a.kind==='expense'?'−':'□'}</div><div class="activity-copy"><b>${a.title}</b><span>${esc(a.name)}</span>${a.kind==='sale'?`<strong>${money(a.amount)}</strong>`:a.kind==='expense'?`<strong class="negative">− ${money(a.amount)}</strong>`:`<strong>+ ${money(a.amount)}</strong>`}</div><time>${esc(a.time||'')}</time></div>`).join('')}</div>`:`<div class="empty">Hali faoliyat yo'q.</div>`}</div>
    </div>

    <div class="dashboard-grid-bottom">
      <div class="card"><div class="section-head"><h2>🏆 Eng ko'p sotilganlar</h2><button class="btn small" data-route-go="archive">Ko'rish →</button></div>${topParts.length?`<div class="top-table"><div class="top-row top-head"><span>#</span><span>Tovar</span><span>Sotildi</span><span>Tushum</span><span>Foyda</span></div>${topParts.map((v,i)=>`<div class="top-row"><span class="rank">${i+1}</span><span class="part-name"><i>${i===0?'◉':i===1?'◌':i===2?'●':'◍'}</i>${esc(v.name)}</span><span>${v.qty}</span><span>${money(v.revenue)}</span><b>${money(v.profit)}</b></div>`).join('')}</div>`:`<div class="empty">Sotuvlar bo'lsa, top mahsulotlar shu yerda ko'rinadi.</div>`}</div>
      <div class="card"><div class="section-head"><h2>📦 Ombor holati</h2><button class="btn small" data-route-go="inventory">Ko'rish →</button></div><div class="stock-status"><div><span class="legend-dot in"></span> Omborda</div><b>${state.products.filter(p=>p.qty>0).length}</b><div class="progress"><i style="width:${state.products.length?Math.round(state.products.filter(p=>p.qty>0).length/state.products.length*100):0}%"></i></div><div><span class="legend-dot low"></span> Kam zaxira</div><b>${low.length}</b><div class="progress warning"><i style="width:${state.products.length?Math.round(low.length/state.products.length*100):0}%"></i></div><div><span class="legend-dot out"></span> Tugagan</div><b>${state.products.filter(p=>p.qty===0).length}</b><div class="progress danger"><i style="width:${state.products.length?Math.round(state.products.filter(p=>p.qty===0).length/state.products.length*100):0}%"></i></div></div>${low.length?`<div class="stock-alert">⚠️ <span><b>${low.length}</b> ta mahsulot kam qoldi<br><small>Qayta zaxiralashni ko'rib chiqing.</small></span><button class="btn small" data-route-go="inventory">Ko'rish</button></div>`:`<div class="stock-alert ok">✅ <span>Kam qolgan mahsulot yo'q</span></div>`}</div>
    </div>

    <div class="quick-actions card"><div><h2>⚡ Tezkor amallar</h2><span class="muted tiny">Ko'p ishlatiladigan funksiyalar</span></div><div class="quick-grid"><button class="quick-btn primary" data-route-go="sales">🛒 <span>Yangi sotuv</span> <b>›</b></button><button class="quick-btn" data-action="add-product">🏷️<span>Omborga tovar qo'shish</span> <b>›</b></button><button class="quick-btn" data-action="add-expense">💸<span>Xarajat yozish</span> <b>›</b></button><button class="quick-btn" data-route-go="purchases">📑<span>Xaridlar ro'yxati</span> <b>›</b></button></div></div>
  </section>`
},
inventory:()=>`<section><div class="section-head"><div><h1 class="page-title">Ombor</h1><p class="page-sub">Joriy mahsulotlar va zaxira.</p></div><button class="btn primary" data-action="add-product">+ Tovar qo'shish</button></div><div class="card"><input id="searchInventory" class="search" placeholder="Tovar qidirish..." value="${esc(searchTerm)}"><div class="list" style="margin-top:14px">${filteredProducts().map(p=>`<div class="row"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-meta">Olish ${money(p.buy)} · Sotish ${money(p.sell)} · Foyda/dona ${money(p.sell-p.buy)}</div><div class="row-meta">Qo'shilgan: ${p.addedAt.slice(0,10)}</div></div><div class="row-right"><div class="${p.qty===0?'stock-zero':p.qty<=3?'stock-low':''} price">${p.qty} dona</div><div class="actions" style="margin-top:7px"><button class="btn small" data-action="edit-product" data-id="${p.id}">Tahrir</button><button class="btn small" data-action="add-stock" data-id="${p.id}">+ Zaxira</button><button class="btn small danger" data-action="delete-product" data-id="${p.id}">O'chirish</button></div></div></div>`).join("")||`<div class="empty"><strong>📦 Omborda hali tovar yo'q</strong>Yangi mahsulot qo'shing.</div>`}</div></div></section>`,
sales:()=>{const ps=state.products.filter(p=>p.qty>0&&p.name.toLowerCase().includes(searchTerm.toLowerCase()));return `<section><h1 class="page-title">Sotuv</h1><p class="page-sub">Faqat mavjud mahsulotlar ko'rsatiladi.</p><div class="card"><input id="searchSales" class="search" placeholder="Sotiladigan tovarni qidiring..." value="${esc(searchTerm)}"><div class="list" style="margin-top:14px">${ps.map(p=>`<div class="row"><div><div class="row-title">${esc(p.name)}</div><div class="row-meta">Mavjud: <b>${p.qty}</b> dona · ${money(p.sell)}</div></div><div class="actions"><input class="search sale-qty" data-id="${p.id}" type="number" min="1" max="${p.qty}" step="1" placeholder="Miqdor" value="${esc(cart[p.id]||"")}" style="width:105px;padding:10px"></div></div>`).join("")||`<div class="empty"><strong>🛒 Sotish uchun tovar yo'q</strong>Omborga zaxira qo'shing.</div>`}</div></div>${saleBar()}</section>`},
archive:()=>{
  let start,end,title;
  if(archiveMode==="week"){
    const range=weekRange(archiveWeek);
    start=range.start; end=range.end;
    title=`Hafta: ${formatDateUz(start)} — ${formatDateUz(end)}`;
  }
  else {start=archiveMonth+"-01";const d=new Date(archiveMonth+"-01T12:00:00");d.setMonth(d.getMonth()+1);d.setDate(0);end=localDateString(d);title=monthName(archiveMonth);}
  const ss=state.sales.filter(x=>inDateRange(x.date,start,end));
  const ee=state.expenses.filter(x=>inDateRange(x.date,start,end));
  const ii=state.incomes.filter(x=>inDateRange(x.date,start,end));
  const bb=state.stockPurchases.filter(x=>inDateRange(x.date,start,end));
  const aa=state.cashAdjustments.filter(x=>inDateRange(x.date,start,end));
  const rev=ss.reduce((a,x)=>a+Number(x.revenue||0),0),prof=ss.reduce((a,x)=>a+Number(x.profit||0),0);const collectedSales=cashReceivedForSales(ss);const collected=collectedSales.cash,debt=collectedSales.debt;
  const exp=ee.reduce((a,x)=>a+Number(x.amount||0),0),inc=ii.reduce((a,x)=>a+Number(x.amount||0),0);
  const buy=bb.reduce((a,x)=>a+Number(x.total||0),0),adjust=aa.reduce((a,x)=>a+Number(x.amount||0),0);
  const net=collected+inc+adjust-exp-buy;
  const map=new Map();
  ss.forEach(x=>{const key=x.productId||("name:"+normalizeProductName(x.product));if(!map.has(key))map.set(key,{name:x.product,qty:0,revenue:0,profit:0});const v=map.get(key);v.qty+=Number(x.qty||0);v.revenue+=Number(x.revenue||0);v.profit+=Number(x.profit||0)});
  const rows=[...map.values()];
  const history=[...ss].sort((a,b)=>String(b.date+" "+b.time).localeCompare(String(a.date+" "+a.time)));
  const incomes=[...ii].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const expenses=[...ee].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const purchases=[...bb].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const adjustments=[...aa].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return `<section>
  <div class="section-head"><div><h1 class="page-title">Arxiv</h1><p class="page-sub">Sotuv, xarid, daromad va xarajatlar bir joyda.</p></div>
  <div class="actions"><button class="btn ${archiveMode==="month"?"primary":""}" data-action="archive-month">Oy</button><button class="btn ${archiveMode==="week"?"primary":""}" data-action="archive-week">Hafta</button></div></div>
  <div class="card" style="margin-bottom:14px"><div class="section-head archive-head"><h2>${title}${archiveMode==="week"?` <span class="muted tiny">(Dushanba–Yakshanba)</span>`:""}</h2>${archiveMode==="month"?`<input id="archiveMonth" class="search archive-date-input" type="month" value="${archiveMonth}" aria-label="Oy tanlash">`:`<div class="actions archive-controls"><button class="btn small" data-action="archive-prev-week" title="Oldingi hafta">← Oldingi hafta</button><input id="archiveWeek" class="search archive-date-input" type="date" value="${archiveWeek}" aria-label="Haftadagi sana"><button class="btn small" data-action="archive-current-week">Joriy hafta</button><button class="btn small" data-action="archive-next-week" title="Keyingi hafta">Keyingi hafta →</button></div>`}</div>
  <div class="grid metrics">
    <div class="metric"><div class="label">Sotuv summasi</div><div class="value">${money(rev)}</div></div>
    <div class="metric"><div class="label">Qo'shimcha daromad</div><div class="value">${money(inc)}</div></div>
    <div class="metric"><div class="label">Xarajatlar</div><div class="value">− ${money(exp)}</div></div>
    <div class="metric"><div class="label">Tovar uchun to'lov</div><div class="value">− ${money(buy)}</div></div>
  </div></div>
  <div class="card"><div class="section-head"><h2>${title} bo'yicha pul hisoboti</h2></div>
    <div class="kpi-line"><span>Jami sotuv</span><b>${money(rev)}</b></div><div class="kpi-line"><span>Kassaga tushgan pul</span><b>+ ${money(collected)}</b></div><div class="kpi-line"><span>Mijozlardan olinadigan qarz</span><b>${money(debt)}</b></div>
    <div class="kpi-line"><span>Qo'shimcha daromad</span><b>+ ${money(inc)}</b></div>
    <div class="kpi-line"><span>Kassaga qo'shilgan pul</span><b>+ ${money(adjust)}</b></div>
    <div class="kpi-line"><span>Xarajatlar</span><b>− ${money(exp)}</b></div>
    <div class="kpi-line"><span>Tovar xaridi</span><b>− ${money(buy)}</b></div>
    <div class="kpi-line"><span>Shu davrning sof pul o'zgarishi</span><b>${money(net)}</b></div>
    <div class="kpi-line"><span>Sotilgan mahsulot</span><b>${ss.reduce((a,x)=>a+Number(x.qty||0),0)} dona</b></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="section-head"><h2>Mahsulotlar bo'yicha sotuv</h2></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Tovar</th><th>Sotildi</th><th>Tushum</th><th>Foyda</th></tr></thead><tbody>${rows.map(v=>`<tr><td><b>${esc(v.name)}</b></td><td>${v.qty} dona</td><td>${money(v.revenue)}</td><td>${money(v.profit)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Bu davrda sotuv bo'lmagan.</div>`}</div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><div class="section-head"><h2>Qo'shimcha daromadlar</h2><span class="muted tiny">${incomes.length} ta</span></div>${incomes.length?`<div class="list">${incomes.map(x=>`<div class="row"><div><div class="row-title">${esc(x.name)}</div><div class="row-meta">${formatDateUz(x.date)}${x.note?` · ${esc(x.note)}`:""}</div></div><b>+ ${money(x.amount)}</b></div>`).join("")}</div>`:`<div class="empty">Qo'shimcha daromad yo'q.</div>`}</div>
    <div class="card"><div class="section-head"><h2>Xarajatlar</h2><span class="muted tiny">${expenses.length} ta</span></div>${expenses.length?`<div class="list">${expenses.map(x=>`<div class="row"><div><div class="row-title">${esc(x.name)}</div><div class="row-meta">${formatDateUz(x.date)}${x.note?` · ${esc(x.note)}`:""}</div></div><b>− ${money(x.amount)}</b></div>`).join("")}</div>`:`<div class="empty">Xarajat yo'q.</div>`}</div>
  </div>
  <div class="card" style="margin-top:14px"><div class="section-head"><h2>Tovar xaridlari</h2><span class="muted tiny">${purchases.length} ta</span></div>${purchases.length?`<div class="list">${purchases.map(x=>`<div class="row"><div><div class="row-title">${esc(x.name)}</div><div class="row-meta">${formatDateUz(x.date)} · ${x.qty} dona · olish ${money(x.unitCost)}</div></div><b>− ${money(x.total)}</b></div>`).join("")}</div>`:`<div class="empty">Bu davrda tovar xaridi yo'q.</div>`}</div>
  <div class="card" style="margin-top:14px"><div class="section-head"><h2>Sotuvlar</h2><span class="muted tiny">${history.length} ta</span></div>${history.length?`<div class="list">${history.map(x=>`<div class="row"><div><div class="row-title">${esc(x.product)} — ${x.qty} dona</div><div class="row-meta">${formatDateUz(x.date)} · ${esc(x.time||"")} · olish ${money(x.purchasePrice)} · sotish ${money(x.sellingPrice)} · mijoz berdi ${money(Number.isFinite(Number(x.paid))?x.paid:x.revenue)}${x.debt?` · qarz ${money(x.debt)}`:x.change?` · qaytim ${money(x.change)}`:""}</div></div><div class="row-right"><b>${money(x.revenue)}</b><div class="row-meta">Foyda ${money(x.profit)}</div></div></div>`).join("")}</div>`:`<div class="empty">Sotuv yozuvi yo'q.</div>`}</div>
  </section>`
},
purchases:()=>`<section><div class="section-head"><div><h1 class="page-title">Xaridlar</h1><p class="page-sub">Kelajakdagi xaridlar ro'yxati.</p></div><button class="btn primary" data-action="add-purchase">+ Ro'yxatga qo'shish</button></div><div class="card"><input id="searchPurchases" class="search" placeholder="Ro'yxatdan qidirish..." value="${esc(searchTerm)}"><div class="list" style="margin-top:14px">${state.purchases.filter(p=>p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p=>`<div class="row"><div><div class="row-title">${esc(p.name)}</div><div class="row-meta">${p.qty} dona · kutilgan narx ${money(p.expected)}${p.note?` · ${esc(p.note)}`:""}</div></div><div class="actions"><button class="btn small primary" data-action="purchase-to-stock" data-id="${p.id}">Omborga olish</button><button class="btn small danger" data-action="delete-purchase" data-id="${p.id}">O'chirish</button></div></div>`).join("")||`<div class="empty"><strong>🛒 Xaridlar ro'yxati bo'sh</strong></div>`}</div></div></section>`,
settings:()=>`<section><h1 class="page-title">Sozlamalar</h1><p class="page-sub">Daromadlar, xarajatlar va mahalliy ma'lumotlarni boshqarish.</p><div class="grid two"><div class="card"><h2>➕ Qo'shimcha daromad</h2><p class="muted">Mahsulot sotuviga kirmaydigan boshqa tushumlar.</p><button class="btn primary" data-action="add-income">+ Daromad qo'shish</button><div class="list" style="margin-top:14px">${[...state.incomes].reverse().map(i=>`<div class="row"><div><div class="row-title">${esc(i.name)}</div><div class="row-meta">${esc(i.date)}${i.note?` · ${esc(i.note)}`:""}</div></div><b>${money(i.amount)}</b></div>`).join("")||`<div class="empty">Hali qo'shimcha daromad yo'q.</div>`}</div></div><div class="card"><h2>💸 Xarajatlar</h2><p class="muted">Do'kon xarajatlari naqd puldan avtomatik ayriladi.</p><button class="btn primary" data-action="add-expense">+ Xarajat qo'shish</button><div class="list" style="margin-top:14px">${[...state.expenses].reverse().map(e=>`<div class="row"><div><div class="row-title">${esc(e.name)}</div><div class="row-meta">${esc(e.date)}${e.note?` · ${esc(e.note)}`:""}</div></div><b>− ${money(e.amount)}</b></div>`).join("")||`<div class="empty">Hali xarajat yo'q.</div>`}</div></div></div><div class="card" style="margin-top:14px"><h2>⚙ Ma'lumotlar</h2><div class="grid two"><div><div class="kpi-line"><span>Mahsulotlar</span><b>${state.products.length}</b></div><div class="kpi-line"><span>Sotuv yozuvlari</span><b>${state.sales.length}</b></div><div class="kpi-line"><span>Qo'shimcha daromadlar</span><b>${state.incomes.length}</b></div></div><div><div class="kpi-line"><span>Xarajatlar</span><b>${state.expenses.length}</b></div><div class="kpi-line"><span>Xarid rejalari</span><b>${state.purchases.length}</b></div><div class="kpi-line"><span>Joriy kassa</span><b>${money(state.cash)}</b></div></div></div><div class="actions" style="margin-top:16px"><button class="btn primary" data-action="add-cash">+ Kassaga pul qo'shish</button><button class="btn" data-action="export">JSON eksport</button><<button class="btn" data-action="import">JSON import</button><button class="btn danger" data-action="reset">Barcha ma'lumotni tozalash</button>${pinButtons()}</div></div></section>`
}
let cart={};
function cartInfo(){let n=0,total=0;for(const [id,v] of Object.entries(cart)){const p=state.products.find(x=>x.id===id),q=Number(v);if(p&&Number.isInteger(q)&&q>0){n++;total+=p.sell*q}}return {n,total}}
function saleBar(){const c=cartInfo();return `<div class="sale-bar"><div><div class="row-meta">Tanlangan: <b id="cartCount">${c.n}</b> xil tovar</div><div class="price" id="cartTotal">Jami: ${money(c.total)}</div><div class="row-meta">Mijoz bergan pul keyingi oynada so'raladi.</div></div><button class="btn primary" data-action="sell-all">SOTUVNI YAKUNLASH</button></div>`}
function filteredProducts(){return state.products.filter(p=>p.name.toLowerCase().includes(searchTerm.toLowerCase()))}
function bind(){
const theme=document.getElementById("themeToggle");if(theme)theme.onclick=toggleTheme;
const userSelect=document.getElementById("userSelect");if(userSelect){userSelect.value=state.settings.user||"None";userSelect.onchange=()=>{state.settings.user=userSelect.value||"None";save();}}
document.querySelectorAll("[data-route]").forEach(b=>b.onclick=()=>{route=b.dataset.route;searchTerm="";const g0=document.getElementById("globalSearch");if(g0)g0.value="";render(true)});
document.querySelectorAll("[data-route-go]").forEach(b=>b.onclick=()=>{route=b.dataset.routeGo;render(true)});
const si=document.getElementById("searchInventory"),ss=document.getElementById("searchSales"),sp=document.getElementById("searchPurchases");[si,ss,sp].forEach(el=>el&&el.addEventListener("input",e=>{searchTerm=e.target.value;const keep={};document.querySelectorAll(".sale-qty").forEach(i=>keep[i.dataset.id]=i.value);render();document.querySelectorAll(".sale-qty").forEach(i=>{if(keep[i.dataset.id])i.value=keep[i.dataset.id]});const target=document.getElementById(e.target.id);if(target){target.focus();target.selectionStart=target.value.length}}));
document.querySelectorAll(".sale-qty").forEach(i=>i.oninput=()=>{cart[i.dataset.id]=i.value;const c=cartInfo(),n=document.getElementById("cartCount"),t=document.getElementById("cartTotal");if(n)n.textContent=c.n;if(t)t.textContent=money(c.total)});
const am=document.getElementById("archiveMonth");if(am)am.onchange=e=>{if(e.target.value)archiveMonth=e.target.value;render()};
const aw=document.getElementById("archiveWeek");if(aw)aw.onchange=e=>{if(e.target.value)archiveWeek=e.target.value;render()};
document.querySelectorAll("[data-money-input]").forEach(i=>{
  i.value=formatMoneyInput(i.value);
  i.addEventListener("input",()=>{
    const old=i.value, caret=i.selectionStart??old.length, digitsBefore=(old.slice(0,caret).match(/\d/g)||[]).length, raw=old.replace(/\D/g,"");
    i.value=raw?raw.replace(/\B(?=(\d{3})+(?!\d))/g,"."):"";
    if(raw && document.activeElement===i){
      let pos=0, seen=0;
      while(pos<i.value.length && seen<digitsBefore){if(/\d/.test(i.value[pos]))seen++;pos++;}
      try{i.setSelectionRange(pos,pos)}catch{}
    }
  });
  i.addEventListener("blur",()=>{i.value=formatMoneyInput(i.value);});
});
document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>actions[b.dataset.action]?.(b.dataset.id));
}
const actions={
"archive-month":()=>{archiveMode="month";render()},
"archive-week":()=>{archiveMode="week";render()},
"archive-current-week":()=>{archiveMode="week";archiveWeek=today();render()},
"archive-prev-week":()=>{archiveMode="week";archiveWeek=shiftWeek(archiveWeek||today(),-1);render()},
"archive-next-week":()=>{archiveMode="week";archiveWeek=shiftWeek(archiveWeek||today(),1);render()},
"add-product":()=>openModal("Tovar qo'shish",productForm(),f=>{
  const name=f.get("name").trim(),qty=Number(f.get("qty")),buy=parseMoney(f.get("buy")),sell=parseMoney(f.get("sell")),free=f.get("free")==="on";
  if(!name||[qty,buy,sell].some(x=>!Number.isFinite(x)||x<0)||!Number.isInteger(qty))return toast("Ma'lumotlarni to'g'ri kiriting.","error");
  const old=findProduct(name,buy);
  if(old){
    old.qty+=qty; old.sell=sell;
    if(qty>0&&!free){state.stockPurchases.push({id:uid(),date:today(),name:old.name,productId:old.id,qty,unitCost:buy,total:buy*qty});}
    toast("Bir xil olish narxidagi tovar zaxirasi qo'shildi.");
  }else{
    const p={id:uid(),name,qty,buy,sell,addedAt:nowISO()};
    state.products.push(p);
    if(qty>0&&!free){state.stockPurchases.push({id:uid(),date:today(),name,productId:p.id,qty,unitCost:buy,total:buy*qty});}
    toast("Yangi tovar qo'shildi.");
  }
  syncCash();save();document.getElementById("modalRoot").innerHTML="";render()
}),
"edit-product":id=>{const p=state.products.find(x=>x.id===id);openModal("Tovarni tahrirlash",`${field("Tovar nomi","name","text",p.name||"","required")}${moneyField("Olish narxi (UZS)","buy",p.buy??0)}${moneyField("Sotish narxi (UZS)","sell",p.sell??0)}<p class="muted tiny">Joriy zaxira: <b>${p.qty}</b> dona. Zaxirani o'zgartirish uchun “+ Zaxira”dan foydalaning.</p>`,f=>{const name=f.get("name").trim(),buy=parseMoney(f.get("buy")),sell=parseMoney(f.get("sell"));if(!name||!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0)return toast("Ma'lumotlarni to'g'ri kiriting.","error");const duplicate=state.products.find(x=>x.id!==p.id&&normalizeProductName(x.name)===normalizeProductName(name)&&Number(x.buy)===buy);if(duplicate)return toast("Bu nomli tovar allaqachon bor.","error");p.name=name;p.buy=buy;p.sell=sell;syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Tovar saqlandi.");render()})},
"add-stock":id=>{const p=state.products.find(x=>x.id===id);if(!p)return;openModal("Zaxira qo'shish",`${field("Qo'shiladigan miqdor","qty","number",1,'min="1" step="1" required')}${moneyField("Olish narxi (UZS)","buy",p.buy)}<p class="muted tiny">Boshqa narx bo'lsa, shu tovarning alohida dublikati yaratiladi.</p>`,f=>{
  const q=Number(f.get("qty")),buy=parseMoney(f.get("buy"));
  if(!Number.isInteger(q)||q<=0||!Number.isFinite(buy)||buy<0)return toast("Miqdor va narxni to'g'ri kiriting.","error");
  const target=findProduct(p.name,buy);
  if(target){target.qty+=q;state.stockPurchases.push({id:uid(),date:today(),name:target.name,productId:target.id,qty:q,unitCost:buy,total:buy*q});}
  else{const np={id:uid(),name:p.name,qty:q,buy,sell:p.sell,addedAt:nowISO()};state.products.push(np);state.stockPurchases.push({id:uid(),date:today(),name:np.name,productId:np.id,qty:q,unitCost:buy,total:buy*q});}
  syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Zaxira qo'shildi.");render()
});},
"delete-product":id=>confirmAction("Bu mahsulotni o'chirishni xohlaysizmi?",()=>{state.products=state.products.filter(p=>p.id!==id);save();toast("Mahsulot o'chirildi.");render()}),
"sell":id=>{toast("Sotuvni yakunlash tugmasidan foydalaning.","error")},
"sell-all":()=>{
  const items=[];for(const [id,v] of Object.entries(cart)){
    const p=state.products.find(x=>x.id===id); if(!p||v===""||v==null||Number(v)===0)continue;
    const q=Number(v); if(!Number.isInteger(q)||q<=0)return toast((p?.name||"Tovar")+": miqdor 0 dan katta butun son bo'lsin.","error");
    if(q>p.qty)return toast(p.name+": omborda faqat "+p.qty+" dona bor.","error");
    items.push([p,q]);
  }
  if(!items.length)return toast("Kamida bitta tovar miqdorini kiriting.","error");
  const total=items.reduce((a,[p,q])=>a+p.sell*q,0);
  openModal("Sotuvni yakunlash",`${items.map(([p,q])=>`<div class="kpi-line"><span>${esc(p.name)} · ${q} dona</span><b>${money(p.sell*q)}</b></div>`).join("")}<div class="kpi-line"><span><b>Jami summa</b></span><b>${money(total)}</b></div>${moneyField("Mijoz bergan pul (UZS)","paid",total,'required')}<div class="field"><label>Qaytim / Qarz</label><div id="paymentPreview" class="price">${money(0)}</div></div>`,f=>{
    const paid=parseMoney(f.get("paid"));
    if(!Number.isInteger(paid)||paid<0)return toast("Mijoz bergan pul 0 yoki undan katta butun summa bo'lsin.","error");
    const change=Math.max(0,paid-total),debt=Math.max(0,total-paid),tid=uid(),time=new Date().toLocaleTimeString("uz-UZ",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    items.forEach(([p,q])=>{const revenue=p.sell*q,profit=(p.sell-p.buy)*q;p.qty-=q;state.sales.push({id:uid(),transactionId:tid,product:p.name,productId:p.id,qty:q,sellingPrice:p.sell,purchasePrice:p.buy,revenue,profit,paid,change,debt,date:today(),time});removeEmptyProduct(p);});
    syncCash();cart={};save();document.getElementById("modalRoot").innerHTML="";toast(debt>0?"Sotuv saqlandi. Qarz: "+money(debt):change>0?"Sotuv saqlandi. Qaytim: "+money(change):"Sotuv saqlandi.");render()
  });
  setTimeout(()=>{const inp=document.querySelector('#modalForm input[name="paid"]'),out=document.getElementById("paymentPreview");if(inp&&out)inp.oninput=()=>{const paid=parseMoney(inp.value||0),diff=paid-total;out.textContent=diff>=0?"Qaytim: "+money(diff):"Qarz: "+money(-diff)};},0)
},
"add-cash":()=>openModal("Kassaga pul qo'shish",`${moneyField("Summa (UZS)","amount","",'required')}<div class="field"><label>Izoh (ixtiyoriy)</label><textarea name="note" placeholder="Masalan: boshlang'ich pul"></textarea></div>`,f=>{const amount=parseMoney(f.get("amount"));if(!Number.isInteger(amount)||amount<=0)return toast("Summa 0 dan katta butun son bo'lsin.","error");addCashAdjustment(amount,f.get("note"));save();document.getElementById("modalRoot").innerHTML="";toast("Kassaga pul qo'shildi.");render()}),
"add-income":()=>openModal("Qo'shimcha daromad qo'shish",`${field("Daromad nomi","name","text","","required")}${moneyField("Summa (UZS)","amount","",'required')}${field("Sana","date","date",today(),"required")}<div class="field"><label>Izoh (ixtiyoriy)</label><textarea name="note" placeholder="Masalan: yetkazib berish xizmati"></textarea></div>`,f=>{const name=f.get("name").trim(),amount=parseMoney(f.get("amount")),date=f.get("date");if(!name||!Number.isInteger(amount)||amount<=0||!date)return toast("Daromad ma'lumotlari noto'g'ri.","error");state.incomes.push({id:uid(),name,amount,date,note:f.get("note")});syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Qo'shimcha daromad saqlandi.");render()}),
"add-expense":()=>openModal("Xarajat qo'shish",`${field("Xarajat nomi","name","text","","required")}${moneyField("Summa (UZS)","amount","",'required')}${field("Sana","date","date",today(),"required")}<div class="field"><label>Izoh (ixtiyoriy)</label><textarea name="note"></textarea></div>`,f=>{const name=f.get("name").trim(),amount=parseMoney(f.get("amount")),date=f.get("date");if(!name||!Number.isInteger(amount)||amount<=0)return toast("Xarajat ma'lumotlari noto'g'ri.","error");state.expenses.push({id:uid(),name,amount,date,note:f.get("note")});syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Xarajat saqlandi.");render()}),
"add-purchase":()=>openModal("Xaridlar ro'yxatiga qo'shish",`${field("Tovar nomi","name","text","","required")}${field("Miqdor","qty","number",1,'min="1" step="1" required')}${moneyField("Kutilgan narx (UZS)","expected",0,'required')}<div class="field"><label>Izoh</label><textarea name="note"></textarea></div>`,f=>{const name=f.get("name").trim(),qty=Number(f.get("qty")),expected=parseMoney(f.get("expected"));if(!name||!Number.isInteger(qty)||qty<=0||expected<0)return toast("Ma'lumotlar noto'g'ri.","error");state.purchases.push({id:uid(),name,qty,expected,note:f.get("note")});save();document.getElementById("modalRoot").innerHTML="";toast("Ro'yxatga qo'shildi.");render()}),
"delete-purchase":id=>confirmAction("Bu xarid rejasini o'chirishni xohlaysizmi?",()=>{state.purchases=state.purchases.filter(p=>p.id!==id);save();toast("O'chirildi.");render()}),
"purchase-to-stock":id=>{const p=state.purchases.find(x=>x.id===id);if(!p)return;const existing=findProduct(p.name,p.expected);openModal("Xaridni omborga olish",`${moneyField("Haqiqiy olish narxi (UZS)","buy",p.expected,'required')}${existing?"":moneyField("Sotish narxi (UZS)","sell",0,'required')}<p class="muted tiny">${p.qty} dona · Agar olish narxi boshqa bo'lsa, yangi dublikat yaratiladi.</p>`,f=>{
  const buy=parseMoney(f.get("buy")),sell=existing?existing.sell:parseMoney(f.get("sell"));
  if(!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0)return toast("Narx noto'g'ri.","error");
  const target=findProduct(p.name,buy);
  if(target)target.qty+=p.qty;
  else {const np={id:uid(),name:p.name,qty:p.qty,buy,sell,addedAt:nowISO()};state.products.push(np);}
  const prod=target||state.products[state.products.length-1];
  state.stockPurchases.push({id:uid(),date:today(),name:p.name,productId:prod.id,qty:p.qty,unitCost:buy,total:buy*p.qty});
  state.purchases=state.purchases.filter(x=>x.id!==id);syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Xarid omborga olindi.");render()
  })},
"export":()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`tavars-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup tayyor.")},
"import":()=>{const inp=document.createElement("input");inp.type="file";inp.accept="application/json,.json";inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d||typeof d!=="object"||!Array.isArray(d.products))throw new Error("bad");const restored=normalizeState(d);restored.cash=0;confirmAction("Joriy ma'lumotlar backup fayli bilan almashtiriladi. Davom etasizmi?",()=>{state=restored;syncCash();if(!save())return;toast("Backup tiklandi. Kassa hisob-kitobi ham tekshirilib tiklandi.");render()})}catch(e){toast("Backup fayli noto'g'ri.","error")}};r.readAsText(f)};inp.click()},
reset:()=>confirmAction("Barcha mahalliy ma'lumotlar butunlay o'chiriladi. Davom etasizmi?",()=>{localStorage.removeItem(KEY);state=load();toast("Ma'lumotlar tozalandi.");render()})
};
const gs=document.getElementById("globalSearch");if(gs)gs.addEventListener("input",e=>{searchTerm=e.target.value;if(!["inventory","sales","purchases"].includes(route))route="inventory";render()});
// ===== PIN qulf =====
const PIN_KEY="tavars-pin-v1";
async function hashPin(pin){const data=new TextEncoder().encode("tavars:"+pin);if(window.crypto&&crypto.subtle){const buf=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}let h=5381;for(const c of data)h=((h<<5)+h+c)>>>0;return "f"+h}
const pinField=(label,name)=>`<div class="field"><label>${label}</label><input name="${name}" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required></div>`;
function pinButtons(){return localStorage.getItem(PIN_KEY)?`<button class="btn" data-action="set-pin">🔒 PINni o'zgartirish</button><button class="btn danger" data-action="remove-pin">PINni o'chirish</button>`:`<button class="btn" data-action="set-pin">🔒 PIN yaratish</button>`}
async function checkPin(pin){return (await hashPin(pin))===localStorage.getItem(PIN_KEY)}
actions["set-pin"]=()=>{const has=!!localStorage.getItem(PIN_KEY);openModal(has?"PINni o'zgartirish":"PIN yaratish",(has?pinField("Hozirgi PIN","old"):"")+pinField("Yangi PIN (4–6 raqam)","pin")+pinField("PINni takrorlang","pin2"),async f=>{const pin=String(f.get("pin")||""),pin2=String(f.get("pin2")||"");if(has&&!(await checkPin(String(f.get("old")||""))))return toast("Hozirgi PIN noto'g'ri.","error");if(!/^\d{4,6}$/.test(pin))return toast("PIN 4 dan 6 gacha raqamdan iborat bo'lsin.","error");if(pin!==pin2)return toast("PIN kodlar bir xil emas.","error");localStorage.setItem(PIN_KEY,await hashPin(pin));document.getElementById("modalRoot").innerHTML="";toast("PIN saqlandi.");render()})};
actions["remove-pin"]=()=>openModal("PINni o'chirish",pinField("Hozirgi PIN","old"),async f=>{if(!(await checkPin(String(f.get("old")||""))))return toast("PIN noto'g'ri.","error");localStorage.removeItem(PIN_KEY);document.getElementById("modalRoot").innerHTML="";toast("PIN o'chirildi.");render()},"O'chirish");
function showLock(){if(!localStorage.getItem(PIN_KEY))return;const d=document.createElement("div");d.id="pinLock";d.innerHTML=`<form class="pin-box"><h2>🔒 TAVAR'S</h2><p>PIN kodni kiriting</p><input id="pinInput" type="password" inputmode="numeric" maxlength="6" autocomplete="off"><div class="pin-err" id="pinErr"></div><button class="btn primary">Kirish</button></form>`;document.body.appendChild(d);const input=d.querySelector("#pinInput"),err=d.querySelector("#pinErr");d.querySelector("form").onsubmit=async e=>{e.preventDefault();if(await checkPin(input.value))d.remove();else{err.textContent="PIN noto'g'ri";input.value="";input.focus()}};setTimeout(()=>input.focus(),50)}
showLock();
syncCash();
applyTheme();
render();
setTimeout(()=>document.getElementById("appLoader")?.classList.add("is-hidden"),1100);
let refreshDay=today();
setInterval(()=>{const d=today();if(d!==refreshDay){refreshDay=d;render();}},60000);
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.getElementById("modalRoot").innerHTML=""});
