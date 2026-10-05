if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
const KEY="tavars-v1";
const THEME_KEY="tavars-theme-v1";
const defaultState={cash:0,openingCash:0,cashAdjustments:[],products:[],sales:[],expenses:[],incomes:[],purchases:[],stockPurchases:[],settings:{shopName:"TAVAR'S",currency:"UZS",user:"None"}};
let state=load();
let route="dashboard";
let searchTerm="";

function hideLoader(){
  const loader=document.getElementById("appLoader");
  if(!loader) return;
  loader.classList.add("is-hidden");
  setTimeout(()=>loader.remove(), 350);
}

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
  const sales=(Array.isArray(source.sales)?source.sales:[]).filter(s=>s&&typeof s==="object").map(s=>({...s,id:s.id||uid(),revenue:Math.max(0,Number(s.revenue)||0),paid:Number.isFinite(Number(s.paid))?Number(s.paid):0}));
  const expenses=(Array.isArray(source.expenses)?source.expenses:[]).filter(e=>e&&typeof e==="object");
  const incomes=(Array.isArray(source.incomes)?source.incomes:[]).filter(i=>i&&typeof i==="object");
  const stockPurchases=(Array.isArray(source.stockPurchases)?source.stockPurchases:[]).filter(b=>b&&typeof b==="object");
  const cashAdjustments=(Array.isArray(source.cashAdjustments)?source.cashAdjustments:[]).filter(x=>x&&typeof x==="object");

  const salesCash=cashReceivedForSales(sales).cash;
  const incomeCash=incomes.reduce((a,i)=>a+Number(i.amount||0),0);
  const expenseCash=expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const purchaseCash=stockPurchases.reduce((a,b)=>a+Number(b.total||0),0);
  const adjustmentCash=cashAdjustments.reduce((a,x)=>a+Number(x.amount||0),0);
  const hasOpening=Number.isFinite(Number(source.openingCash));
  const hasCash=Number.isFinite(Number(source.cash));
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
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch(err){toast("Saqlab bo'lmadi! Brauzer xotirasi to'lgan yoki bloklangan. Darhol JSON eksport qiling.","error");return false;}}
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
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
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
function calcToday(){const t=today();const sales=state.sales.filter(s=>s.date===t),incomes=state.incomes.filter(i=>i.date===t),expenses=state.expenses.filter(e=>e.date===t);const collected=cashReceivedForSales(sales).cash;const revenue=sales.reduce((a,s)=>a+Number(s.revenue||0),0);const expense=expenses.reduce((a,e)=>a+Number(e.amount||0),0);const income=incomes.reduce((a,i)=>a+Number(i.amount||0),0);const profit=sales.reduce((a,s)=>a+Number(s.profit||0),0);const units=sales.reduce((a,s)=>a+Number(s.qty||0),0);return {revenue,collected,expense,income,profit,units};}
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
function render(top){document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.route===route));const app=document.getElementById("app");app.innerHTML=pages[route]();bind(app);hideLoader();}
function bindMoneyIn(root){root.querySelectorAll("[data-money-input]").forEach(i=>{i.value=formatMoneyInput(i.value);i.addEventListener("input",()=>{const old=i.value,caret=i.selectionStart??old.length,digitsBefore=(old.slice(0,caret).match(/\d/g)||[]).length,raw=old.replace(/\D/g,"");i.value=raw?raw.replace(/\B(?=(\d{3})+(?!\d))/g,"."):"";if(raw && document.activeElement===i){let pos=0,seen=0;while(pos<i.value.length && seen<digitsBefore){if(/\d/.test(i.value[pos]))seen++;pos++;}try{i.setSelectionRange(pos,pos)}catch{}}});i.addEventListener("blur",()=>{i.value=formatMoneyInput(i.value);});});}
function debtInfo(){const g=new Map();for(const s of state.sales){const k=s.transactionId||s.id;if(!g.has(k))g.set(k,{t:0,p:null});const x=g.get(k);x.t+=Number(s.revenue||0);if(x.p===null&&Number.isFinite(Number(s.paid)))x.p=Number(s.paid);}let sum=0,count=0;for(const x of g.values()){sum+=Math.max(0,x.t-(x.p??x.t));if(Math.max(0,x.t-(x.p??x.t))>0)count++;}return {sum,count};}
function updateBell(){const b=document.querySelector(".notification-btn");if(!b)return;const n=state.products.filter(p=>p.qty<=3).length,d=b.querySelector("i");if(d)d.hidden=!n;b.onclick=()=>toast(n?n+" ta mahsulot zaxirasida kam qolgan.":"Hech narsa yo'q.");}
function openModal(title,body,onSubmit,okText="Saqlash"){const root=document.getElementById("modalRoot");root.innerHTML=`<div class="modal-backdrop"><div class="modal"><h2>${title}</h2><form id="modalForm">${body}</form><div class="modal-actions"><button class="btn" type="button" data-close-modal>Bekor qilish</button><button class="btn primary" type="submit" form="modalForm">${okText}</button></div></div></div>`;const form=document.getElementById("modalForm");form.addEventListener("submit",e=>{e.preventDefault();onSubmit(new FormData(form));});root.querySelector("[data-close-modal]").onclick=()=>{root.innerHTML=""};bindMoneyIn(root);}
function confirmAction(text,yes){openModal("Tasdiqlash",`<p class="muted">${esc(text)}</p>`,()=>{yes();document.getElementById("modalRoot").innerHTML=""},"Ha, davom etish")}
function field(label,name,type="text",value="",extra=""){return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function productForm(p={}){return `<div class="form-grid">${field("Tovar nomi","name","text",p.name||"","required")}${field("Miqdor","qty","number",p.qty??0,'min="0" step="1" required')}${moneyField("Olish narxi (UZS)","buy",p.buy??0,'required')}${moneyField("Sotish narxi (UZS)","sell",p.sell??0,'required')}<label class="checkbox-line"><input type="checkbox" name="free" ${p.free?"checked":""}> Bepul zaxira qo‘shish</label></div>`;}
const pages = {
dashboard:()=>{
  const t=calcToday(), w=weekReport(), dbt=debtInfo();
  const low=state.products.filter(p=>p.qty>0&&p.qty<=3), upcoming=state.purchases;
  const totalUnits=state.products.reduce((a,p)=>a+Number(p.qty||0),0);
  const stockValue=state.products.reduce((a,p)=>a+Number(p.qty||0)*Number(p.buy||0),0);
  const topMap=new Map();
  state.sales.forEach(s=>{const k=s.productId||s.product;const v=topMap.get(k)||{name:s.product,qty:0,revenue:0,profit:0};v.qty+=Number(s.qty||0);v.revenue+=Number(s.revenue||0);v.profit+=Number(s.profit||0);topMap.set(k,v);});
  const topParts=[...topMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,5);
  const activity=[
    ...state.sales.slice(-8).map(s=>({kind:'sale',time:s.time||'',title:"Sotuv yakunlandi",name:s.product,amount:s.revenue,date:s.date})),
    ...state.stockPurchases.slice(-6).map(x=>({kind:'stock',time:'',title:"Omborga tovar qo'shildi",name:x.name,amount:x.total,date:x.date})),
    ...state.expenses.slice(-6).map(x=>({kind:'expense',time:'',title:"Xarajat qayd etildi",name:x.name,amount:x.amount,date:x.date}))
  ].sort((a,b)=>String(b.date+' '+b.time).localeCompare(String(a.date+' '+a.time))).slice(0,6);
  const maxBar=Math.max(1,...Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const ds=localDateString(d);return state.sales.filter(s=>s.date===ds).reduce((a,s)=>a+Number(s.revenue||0),0);}));
  const bars=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const ds=localDateString(d);const value=state.sales.filter(s=>s.date===ds).reduce((a,s)=>a+Number(s.revenue||0),0);return `<div class="chart-col"><span>${value?money(value):'0'}</span><div class="bar" style="height:${Math.max(8,(value/maxBar)*100)}%"></div><small>${d.getDate()}</small></div>`;}).join("");
  return `<section class="dashboard-page">
    <div class="dashboard-hero">
      <div><div class="eyebrow">XUSH KELIBSIZ,</div><h1>Biznesingiz<br><span>bir qarashda.</span></h1><p>Ombor, sotuv, kassa va foydani bitta zamonaviy paneldan boshqaring.</p><div class="hero-meta"><span>${state.products.length} mahsulot</span><span>${state.sales.length} sotuv</span><span>${state.stockPurchases.length} xarid</span></div></div>
      <div class="hero-art"><div class="hero-ring"></div><div class="hero-bike">🔥</div><div class="hero-copy">TAVARLARINGIZNI<br><b>SOTISHDA<br>DAVOM ETING</b></div></div>
    </div>
    <div class="grid metrics dashboard-metrics">
      <div class="card metric accent"><div class="metric-icon">🏛️</div><div class="label">Joriy kassa</div><div class="value">${money(state.cash)}</div><div class="metric-foot ${w.net>=0?'positive':'negative'}">${w.net>=0?'+':'-'} ${money(Math.abs(w.net))}</div></div>
      <div class="card metric"><div class="metric-icon blue">🛒</div><div class="label">Bugungi sotuv</div><div class="value">${money(t.revenue)}</div><div class="metric-foot positive">↑ ${t.units} dona</div></div>
      <div class="card metric"><div class="metric-icon green">📈</div><div class="label">Bugungi foyda</div><div class="value">${money(t.profit)}</div><div class="metric-foot positive">↑ foyda</div></div>
      <div class="card metric"><div class="metric-icon red">📉 </div><div class="label">Bugungi xarajat</div><div class="value">${money(t.expense)}</div><div class="metric-foot negative">↓ xarajat</div></div>
      <div class="card metric"><div class="metric-icon purple">👤</div><div class="label">Mijoz qarzi</div><div class="value">${money(dbt.sum)}</div><div class="metric-foot"><span>${dbt.count} ta so'rov</span></div></div>
      <div class="card metric"><div class="metric-icon dark">🏷️</div><div class="label">Ombor qiymati</div><div class="value">${money(stockValue)}</div><div class="metric-foot"><span>${totalUnits} dona</span></div></div>
    </div>

    <div class="dashboard-grid-main">
      <div class="card chart-card"><div class="section-head"><div><h2>📊 Sotuv va foyda</h2><span class="muted tiny">So'nggi 7 kun</span></div><button class="btn small" data-route-go="archive">Arxiv →</button></div><div class="chart">${bars}</div></div>
      <div class="card activity-card"><div class="section-head"><h2>◷ So'nggi faoliyat</h2><span class="muted tiny">${activity.length} ta</span></div>${activity.length?`<div class="activity-list">${activity.map(x=>`<div class="activity-item"><div class="activity-dot ${x.kind}"></div><div><strong>${esc(x.title)}</strong><small>${esc(x.name)} · ${formatDateUz(x.date)}</small></div><b>${money(x.amount)}</b></div>`).join("")}</div>`:"<div class='empty'>Faoliyat yo'q</div>"}</div>
    </div>

    <div class="dashboard-grid-bottom">
      <div class="card"><div class="section-head"><h2>🏆 Eng ko'p sotilganlar</h2><button class="btn small" data-route-go="archive">Ko'rish →</button></div>${topParts.length?`<div class="top-table">${topParts.map(x=>`<div class="top-row"><span>${esc(x.name)}</span><b>${x.qty} dona</b><i>${money(x.revenue)}</i></div>`).join("")}</div>`:"<div class='empty'>Ma'lumot yo'q</div>"}</div>
      <div class="card"><div class="section-head"><h2>📦 Ombor holati</h2><button class="btn small" data-route-go="inventory">Ko'rish →</button></div><div class="stock-status">${low.length?low.map(p=>`<div class="stock-alert ${p.qty===0?'danger':'ok'}"><b>${esc(p.name)}</b><span>${p.qty} dona qoldi</span></div>`).join(""):`<div class='empty'>Barcha mahsulotlar yetarli</div>`}</div></div>
    </div>

    <div class="quick-actions card"><div><h2>⚡ Tezkor amallar</h2><span class="muted tiny">Ko'p ishlatiladigan funksiyalar</span></div><div class="quick-grid"><button class="quick-btn primary" data-action="add-product">➕ Tovar qo'shish</button><button class="quick-btn" data-action="add-income">💰 Daromad</button><button class="quick-btn" data-action="add-expense">📉 Xarajat</button><button class="quick-btn" data-action="add-cash">💵 Kassa</button></div></div>
  </section>`;
},
inventory:()=>`<section><div class="section-head"><div><h1 class="page-title">Ombor</h1><p class="page-sub">Joriy mahsulotlar va zaxira.</p></div><button class="btn primary" data-action="add-product">+ Yangi tovar</button></div><div class="card"><input class="search" id="searchInventory" value="${esc(searchTerm)}" placeholder="Qidirish..."><div class="table-wrap"><table class="table"><thead><tr><th>Tovar</th><th>Qoldiq</th><th>Olish</th><th>Sotish</th><th>Amallar</th></tr></thead><tbody>${state.products.filter(p=>p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.buy)}</td><td>${money(p.sell)}</td><td><button class="btn small" data-action="add-stock" data-id="${p.id}">+ Qoshish</button> <button class="btn small danger" data-action="delete-product" data-id="${p.id}">O'chirish</button></td></tr>`).join("")||`<tr><td colspan="5"><div class="empty">Hech narsa yo'q</div></td></tr>`}</tbody></table></div></div></section>`,
sales:()=>{const ps=state.products.filter(p=>p.qty>0&&p.name.toLowerCase().includes(searchTerm.toLowerCase()));return `<section><h1 class="page-title">Sotuv</h1><p class="page-sub">Faqat mavjud mahsulotlar ko'rsatiladi.</p><div class="card"><input class="search" id="searchSales" value="${esc(searchTerm)}" placeholder="Tovar nomini qidiring..."><div class="sale-list">${ps.map(p=>`<div class="sale-item"><div><strong>${esc(p.name)}</strong><small>${p.qty} dona bor · ${money(p.sell)}</small></div><input class="sale-qty" data-id="${p.id}" type="number" min="0" max="${p.qty}" value="${cart[p.id]||0}" placeholder="0"></div>`).join("")||`<div class="empty">Mavjud tovarlar yo'q</div>`}</div>${saleBar()}</div></section>`;},
archive:()=>{
  let start,end,title;
  if(archiveMode==="week"){
    const range=weekRange(archiveWeek);
    start=range.start; end=range.end;
    title=`Hafta: ${formatDateUz(start)} — ${formatDateUz(end)}`;
  } else {start=archiveMonth+"-01";const d=new Date(archiveMonth+"-01T12:00:00");d.setMonth(d.getMonth()+1);d.setDate(0);end=localDateString(d);title=monthName(archiveMonth);}
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
  ss.forEach(x=>{const key=x.productId||("name:"+normalizeProductName(x.product));if(!map.has(key))map.set(key,{name:x.product,qty:0,revenue:0,profit:0});const v=map.get(key);v.qty+=Number(x.qty||0);v.revenue+=Number(x.revenue||0);v.profit+=Number(x.profit||0);});
  const rows=[...map.values()];
  const history=[...ss].sort((a,b)=>String(b.date+" "+b.time).localeCompare(String(a.date+" "+a.time)));
  const incomes=[...ii].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const expenses=[...ee].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const purchases=[...bb].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const adjustments=[...aa].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return `<section><div class="section-head"><div><h1 class="page-title">Arxiv</h1><p class="page-sub">Sotuv, xarid, daromad va xarajatlar bir joyda.</p></div><div class="actions"><button class="btn ${archiveMode==="month"?"primary":""}" data-action="archive-month">Oy</button><button class="btn ${archiveMode==="week"?"primary":""}" data-action="archive-week">Hafta</button><button class="btn" data-action="archive-current-week">Bu hafta</button></div></div><div class="card" style="margin-bottom:14px"><div class="section-head archive-head"><h2>${title}${archiveMode==="week"?` <span class="muted tiny">(Dushanba–Yakshanba)</span>`:""}</h2>${archiveMode==="week"?`<div class="week-arrows"><button class="btn small" data-action="archive-prev-week">←</button><button class="btn small" data-action="archive-next-week">→</button></div>`:`<input id="archiveMonth" type="month" value="${archiveMonth}" />`}</div></div><div class="grid metrics"><div class="metric"><div class="label">Sotuv summasi</div><div class="value">${money(rev)}</div></div><div class="metric"><div class="label">Qo'shimcha daromad</div><div class="value">${money(inc)}</div></div><div class="metric"><div class="label">Xarajatlar</div><div class="value">− ${money(exp)}</div></div><div class="metric"><div class="label">Tovar uchun to'lov</div><div class="value">− ${money(buy)}</div></div></div><div class="card"><div class="section-head"><h2>${title} bo'yicha pul hisoboti</h2></div><div class="kpi-line"><span>Jami sotuv</span><b>${money(rev)}</b></div><div class="kpi-line"><span>Kassaga tushgan pul</span><b>+ ${money(collected)}</b></div><div class="kpi-line"><span>Mijoz qarzi</span><b>${money(debt)}</b></div><div class="kpi-line"><span>Qo'shimcha daromad</span><b>+ ${money(inc)}</b></div><div class="kpi-line"><span>Kassaga qo'shilgan pul</span><b>+ ${money(adjust)}</b></div><div class="kpi-line"><span>Xarajatlar</span><b>− ${money(exp)}</b></div><div class="kpi-line"><span>Tovar xaridi</span><b>− ${money(buy)}</b></div><div class="kpi-line"><span>Shu davrning sof pul o'zgarishi</span><b>${money(net)}</b></div><div class="kpi-line"><span>Sotilgan mahsulot</span><b>${ss.reduce((a,x)=>a+Number(x.qty||0),0)} dona</b></div></div><div class="card" style="margin-top:14px"><div class="section-head"><h2>Mahsulotlar bo'yicha sotuv</h2></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Tovar</th><th>Miqdor</th><th>Daromad</th><th>Foyda</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.qty}</td><td>${money(r.revenue)}</td><td>${money(r.profit)}</td></tr>`).join("")}</tbody></table></div>`:"<div class='empty'>Ma'lumot yo'q</div>"}</div><div class="grid two" style="margin-top:14px"><div class="card"><div class="section-head"><h2>Qo'shimcha daromadlar</h2><span class="muted tiny">${incomes.length} ta</span></div>${incomes.length?`<div class="list">${incomes.map(x=>`<div class="row"><span>${esc(x.name)}</span><b>${money(x.amount)}</b></div>`).join("")}</div>`:"<div class='empty'>Yo'q</div>"}</div><div class="card"><div class="section-head"><h2>Xarajatlar</h2><span class="muted tiny">${expenses.length} ta</span></div>${expenses.length?`<div class="list">${expenses.map(x=>`<div class="row"><span>${esc(x.name)}</span><b>− ${money(x.amount)}</b></div>`).join("")}</div>`:"<div class='empty'>Yo'q</div>"}</div></div><div class="card" style="margin-top:14px"><div class="section-head"><h2>Tovar xaridlari</h2><span class="muted tiny">${purchases.length} ta</span></div>${purchases.length?`<div class="list">${purchases.map(x=>`<div class="row"><span>${esc(x.name)}</span><b>${money(x.total||x.expected||0)}</b></div>`).join("")}</div>`:"<div class='empty'>Yo'q</div>"}</div><div class="card" style="margin-top:14px"><div class="section-head"><h2>Sotuvlar</h2><span class="muted tiny">${history.length} ta</span></div>${history.length?`<div class="list">${history.map(x=>`<div class="row"><span>${esc(x.product)} · ${x.qty} dona</span><b>${money(x.revenue)}</b></div>`).join("")}</div>`:"<div class='empty'>Yo'q</div>"}</div></section>`;
},
purchases:()=>`<section><div class="section-head"><div><h1 class="page-title">Xaridlar</h1><p class="page-sub">Kelajakdagi xaridlar ro'yxati.</p></div><button class="btn primary" data-action="add-purchase">+ Yangi xarid</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Nomi</th><th>Miqdor</th><th>Kutilgan narx</th><th>Holat</th><th>Amallar</th></tr></thead><tbody>${state.purchases.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.expected||0)}</td><td>${p.received?"Olingan":"Kutilmoqda"}</td><td><button class="btn small" data-action="purchase-to-stock" data-id="${p.id}">Omborga olish</button> <button class="btn small danger" data-action="delete-purchase" data-id="${p.id}">O'chirish</button></td></tr>`).join("")||`<tr><td colspan="5"><div class="empty">Xaridlar yo'q</div></td></tr>`}</tbody></table></div></div></section>`,
settings:()=>`<section><h1 class="page-title">Sozlamalar</h1><p class="page-sub">Daromadlar, xarajatlar va mahalliy ma'lumotlarni boshqarish.</p><div class="grid two"><div class="card"><h2>➕ Qo'shimcha va xarajatlar</h2><div class="btn-group"><button class="btn" data-action="add-income">Daromad</button><button class="btn" data-action="add-expense">Xarajat</button><button class="btn" data-action="add-cash">Kassa</button></div></div><div class="card"><h2>🔐 Xavfsizlik</h2>${localStorage.getItem(PIN_KEY)?`<button class="btn" data-action="set-pin">PINni o'zgartirish</button><button class="btn danger" data-action="remove-pin">PINni o'chirish</button>`:`<button class="btn" data-action="set-pin">PIN yaratish</button>`}</div></div><div class="card"><h2>📦 Ma'lumotlar</h2><div class="btn-group"><button class="btn" data-action="export">Eksport</button><button class="btn" data-action="import">Import</button><button class="btn danger" data-action="reset">Qayta tiklash</button></div></div></section>`
};
let cart={};
function cartInfo(){let n=0,total=0;for(const [id,v] of Object.entries(cart)){const p=state.products.find(x=>x.id===id),q=Number(v);if(p&&Number.isInteger(q)&&q>0){n++;total+=p.sell*q}}return {n,total};}
function saleBar(){const c=cartInfo();return `<div class="sale-bar"><div><div class="row-meta">Tanlangan: <b id="cartCount">${c.n}</b> xil tovar</div><div class="price" id="cartTotal">Jami: ${money(c.total)}</div></div><button class="btn primary" data-action="sell-all">Sotuvni yakunlash</button></div>`;}
function filteredProducts(){return state.products.filter(p=>p.name.toLowerCase().includes(searchTerm.toLowerCase()))}
function bind(root){
  const theme=document.getElementById("themeToggle");if(theme)theme.onclick=toggleTheme;
  const userSelect=document.getElementById("userSelect");if(userSelect){userSelect.value=state.settings.user||"None";userSelect.onchange=()=>{state.settings.user=userSelect.value||"None";save();}}
  document.querySelectorAll("[data-route]").forEach(b=>b.onclick=()=>{route=b.dataset.route;searchTerm="";const g0=document.getElementById("globalSearch");if(g0)g0.value="";render(true)});
  document.querySelectorAll("[data-route-go]").forEach(b=>b.onclick=()=>{route=b.dataset.routeGo;render(true)});
  const si=document.getElementById("searchInventory"),ss=document.getElementById("searchSales"),sp=document.getElementById("searchPurchases");[si,ss,sp].forEach(el=>el&&el.addEventListener("input",e=>{searchTerm=e.target.value;if(!["inventory","sales","purchases"].includes(route))route="inventory";render()}));
  document.querySelectorAll(".sale-qty").forEach(i=>i.oninput=()=>{cart[i.dataset.id]=i.value;const c=cartInfo(),n=document.getElementById("cartCount"),t=document.getElementById("cartTotal");if(n)n.textContent=c.n;if(t)t.textContent="Jami: "+money(c.total);});
  const am=document.getElementById("archiveMonth");if(am)am.onchange=e=>{if(e.target.value)archiveMonth=e.target.value;render();};
  const aw=document.getElementById("archiveWeek");if(aw)aw.onchange=e=>{if(e.target.value)archiveWeek=e.target.value;render();};
  document.querySelectorAll("[data-money-input]").forEach(i=>{i.value=formatMoneyInput(i.value);i.addEventListener("input",()=>{const old=i.value, caret=i.selectionStart??old.length, digitsBefore=(old.slice(0,caret).match(/\d/g)||[]).length, raw=old.replace(/\D/g,"");i.value=raw?raw.replace(/\B(?=(\d{3})+(?!\d))/g,"."):"";if(raw && document.activeElement===i){let pos=0, seen=0;while(pos<i.value.length && seen<digitsBefore){if(/\d/.test(i.value[pos]))seen++;pos++;}try{i.setSelectionRange(pos,pos)}catch{}}});i.addEventListener("blur",()=>{i.value=formatMoneyInput(i.value);});});
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>actions[b.dataset.action]?.(b.dataset.id));
}
const actions={
"archive-month":()=>{archiveMode="month";render()},
"archive-week":()=>{archiveMode="week";render()},
"archive-current-week":()=>{archiveMode="week";archiveWeek=today();render()},
"archive-prev-week":()=>{archiveMode="week";archiveWeek=shiftWeek(archiveWeek||today(),-1);render()},
"archive-next-week":()=>{archiveMode="week";archiveWeek=shiftWeek(archiveWeek||today(),1);render()},
"add-product":()=>openModal("Tovar qo'shish",productForm(),f=>{const name=f.get("name").trim(),qty=Number(f.get("qty")),buy=parseMoney(f.get("buy")),sell=parseMoney(f.get("sell")),free=f.get("free")==="on";if(!name||[qty,buy,sell].some(x=>!Number.isFinite(x)||x<0)||!Number.isInteger(qty))return toast("Ma'lumotlarni to'g'ri kiriting.","error");const old=findProduct(name,buy);if(old){old.qty+=qty;old.sell=sell;if(qty>0&&!free){state.stockPurchases.push({id:uid(),date:today(),name:old.name,productId:old.id,qty,unitCost:buy,total:buy*qty});}toast("Bir xil olish narxidagi tovar zaxirasi qo'shildi.");}else{const p={id:uid(),name,qty,buy,sell,addedAt:nowISO()};state.products.push(p);if(qty>0&&!free){state.stockPurchases.push({id:uid(),date:today(),name,productId:p.id,qty,unitCost:buy,total:buy*qty});}toast("Yangi tovar qo'shildi.");}syncCash();save();document.getElementById("modalRoot").innerHTML="";render();}),
"edit-product":id=>{const p=state.products.find(x=>x.id===id);if(!p)return;openModal("Tovarni tahrirlash",`${field("Tovar nomi","name","text",p.name||"","required")}${moneyField("Olish narxi (UZS)","buy",p.buy??0,'required')}${moneyField("Sotish narxi (UZS)","sell",p.sell??0,'required')}`,f=>{const name=f.get("name").trim();const buy=parseMoney(f.get("buy"));const sell=parseMoney(f.get("sell"));if(!name||!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0)return toast("Narxni to'g'ri kiriting.","error");p.name=name;p.buy=buy;p.sell=sell;save();document.getElementById("modalRoot").innerHTML="";render();},"Yangilash");},
"add-stock":id=>{const p=state.products.find(x=>x.id===id);if(!p)return;openModal("Zaxira qo'shish",`${field("Qo'shiladigan miqdor","qty","number",1,'min="1" step="1" required')}${moneyField("Olish narxi (UZS)","buy",p.buy??0,'required')}`,f=>{const q=Number(f.get("qty")),buy=parseMoney(f.get("buy"));if(!Number.isInteger(q)||q<=0||!Number.isFinite(buy)||buy<0)return toast("Miqdor va narxni to'g'ri kiriting.","error");const target=findProduct(p.name,buy);if(target){target.qty+=q;state.stockPurchases.push({id:uid(),date:today(),name:target.name,productId:target.id,qty:q,unitCost:buy,total:buy*q});}else{const np={id:uid(),name:p.name,qty:q,buy,sell:p.sell,addedAt:nowISO()};state.products.push(np);state.stockPurchases.push({id:uid(),date:today(),name:np.name,productId:np.id,qty:q,unitCost:buy,total:buy*q});}syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Zaxira qo'shildi.");render();},"Qo'shish");},
"delete-product":id=>confirmAction("Bu mahsulotni o'chirishni xohlaysizmi?",()=>{state.products=state.products.filter(p=>p.id!==id);save();toast("Mahsulot o'chirildi.");render()}),
"sell":id=>{toast("Sotuvni yakunlash tugmasidan foydalaning.","error")},
"sell-all":()=>{const items=[];for(const [id,v] of Object.entries(cart)){const p=state.products.find(x=>x.id===id); if(!p||v===""||v==null||Number(v)===0)continue;const q=Number(v); if(!Number.isInteger(q)||q<=0)return toast((p?.name||"Tovar")+": miqdor 0 dan katta butun son bo'lsin.","error");if(q>p.qty)return toast(p.name+": omborda faqat "+p.qty+" dona bor.","error");items.push([p,q]);}if(!items.length)return toast("Kamida bitta tovar miqdorini kiriting.","error");const total=items.reduce((a,[p,q])=>a+p.sell*q,0);openModal("Sotuvni yakunlash",`${items.map(([p,q])=>`<div class="kpi-line"><span>${esc(p.name)} · ${q} dona</span><b>${money(p.sell*q)}</b></div>`).join("")}<div class="kpi-line"><span><b>Jami summa</b></span><b>${money(total)}</b></div>${moneyField("Mijoz bergan pul (UZS)","paid","",'required')}`,f=>{const paid=parseMoney(f.get("paid"));if(!Number.isInteger(paid)||paid<0)return toast("Mijoz bergan pul 0 yoki undan katta butun summa bo'lsin.","error");const change=Math.max(0,paid-total),debt=Math.max(0,total-paid),tid=uid(),time=new Date().toLocaleTimeString("uz-UZ",{hour:"2-digit",minute:"2-digit",second:"2-digit"});items.forEach(([p,q])=>{const revenue=p.sell*q,profit=(p.sell-p.buy)*q;p.qty-=q;state.sales.push({id:uid(),transactionId:tid,product:p.name,productId:p.id,qty:q,sellingPrice:p.sell,purchasePrice:p.buy,revenue,profit,paid:Math.min(paid,total),date:today(),time});});syncCash();cart={};save();document.getElementById("modalRoot").innerHTML="";toast(debt>0?"Sotuv saqlandi. Qarz: "+money(debt):change>0?"Sotuv saqlandi. Qaytim: "+money(change):"Sotuv saqlandi.");render();},"Saqlash");setTimeout(()=>{const inp=document.querySelector('#modalForm input[name="paid"]'),out=document.getElementById("paymentPreview");if(inp&&out)inp.oninput=()=>{const paid=parseMoney(inp.value||0),diff=paid-total;out.textContent=diff>=0?"Qaytim: "+money(diff):"Qarz: "+money(Math.abs(diff));};},0);},
"add-cash":()=>openModal("Kassaga pul qo'shish",`${moneyField("Summa (UZS)","amount","",'required')}<div class="field"><label>Izoh (ixtiyoriy)</label><textarea name="note" placeholder="Masalan: boshlang'ich kapital"></textarea></div>${field("Sana","date","date",today(),'required')}`,f=>{const amount=parseMoney(f.get("amount"));const note=f.get("note")||"";const date=f.get("date")||today();if(!Number.isFinite(amount)||amount<0)return toast("Summa noto'g'ri.","error");state.cashAdjustments.push({id:uid(),date,amount,note:String(note)});syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Kassaga pul qo'shildi.");render();},"Qo'shish"),
"add-income":()=>openModal("Qo'shimcha daromad qo'shish",`${field("Daromad nomi","name","text","","required")}${moneyField("Summa (UZS)","amount","",'required')}${field("Sana","date","date",today(),'required')}`,f=>{const name=f.get("name").trim();const amount=parseMoney(f.get("amount"));const date=f.get("date")||today();if(!name||!Number.isFinite(amount)||amount<0)return toast("Ma'lumotlarni to'g'ri kiriting.","error");state.incomes.push({id:uid(),date,name,amount});save();document.getElementById("modalRoot").innerHTML="";toast("Daromad qo'shildi.");render();},"Saqlash"),
"add-expense":()=>openModal("Xarajat qo'shish",`${field("Xarajat nomi","name","text","","required")}${moneyField("Summa (UZS)","amount","",'required')}${field("Sana","date","date",today(),'required')}`,f=>{const name=f.get("name").trim();const amount=parseMoney(f.get("amount"));const date=f.get("date")||today();if(!name||!Number.isFinite(amount)||amount<0)return toast("Ma'lumotlarni to'g'ri kiriting.","error");state.expenses.push({id:uid(),date,name,amount});save();document.getElementById("modalRoot").innerHTML="";toast("Xarajat qo'shildi.");render();},"Saqlash"),
"add-purchase":()=>openModal("Xaridlar ro'yxatiga qo'shish",`${field("Tovar nomi","name","text","","required")}${field("Miqdor","qty","number",1,'min="1" step="1" required')}${moneyField("Kutilgan narx (UZS)","expected","",'required')}`,f=>{const name=f.get("name").trim();const qty=Number(f.get("qty"));const expected=parseMoney(f.get("expected"));if(!name||!Number.isInteger(qty)||qty<=0||!Number.isFinite(expected)||expected<0)return toast("Ma'lumotlarni to'g'ri kiriting.","error");state.purchases.push({id:uid(),name,qty,expected,date:today(),received:false});save();document.getElementById("modalRoot").innerHTML="";toast("Xarid rejasiga qo'shildi.");render();},"Saqlash"),
"delete-purchase":id=>confirmAction("Bu xarid rejasini o'chirishni xohlaysizmi?",()=>{state.purchases=state.purchases.filter(p=>p.id!==id);save();toast("O'chirildi.");render()}),
"purchase-to-stock":id=>{const p=state.purchases.find(x=>x.id===id);if(!p)return;const existing=findProduct(p.name,p.expected);openModal("Xaridni omborga olish",`${moneyField("Haqiqiy olish narxi (UZS)","buy",p.expected||0,'required')}${existing?"":""}${existing?"":"<div class='field'><label>Sotish narxi (UZS)</label><input name='sell' type='text' inputmode='numeric' autocomplete='off' value='${esc(String(existing?existing.sell:0))}' data-money-input='1' required></div>"}`,f=>{const buy=parseMoney(f.get("buy"));const sell=parseMoney(f.get("sell"));if(!Number.isFinite(buy)||buy<0||!Number.isFinite(sell)||sell<0)return toast("Narx noto'g'ri.","error");const target=findProduct(p.name,buy);if(target)target.qty+=p.qty;else{const np={id:uid(),name:p.name,qty:p.qty,buy,sell,addedAt:nowISO()};state.products.push(np);}const prod=target||state.products[state.products.length-1];state.stockPurchases.push({id:uid(),date:today(),name:p.name,productId:prod.id,qty:p.qty,unitCost:buy,total:buy*p.qty});state.purchases=state.purchases.filter(x=>x.id!==id);syncCash();save();document.getElementById("modalRoot").innerHTML="";toast("Xarid omborga olindi.");render();},"Qo'shish");},
"export":()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`tavars-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);},
"import":()=>{const inp=document.createElement("input");inp.type="file";inp.accept="application/json,.json";inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const parsed=JSON.parse(String(r.result));state=normalizeState(parsed);syncCash();save();toast("Ma'lumotlar import qilindi.");render();}catch{toast("Noto'g'ri JSON fayl.","error");}};r.readAsText(f);};inp.click();},
reset:()=>confirmAction("Barcha mahalliy ma'lumotlar butunlay o'chiriladi. Davom etasizmi?",()=>{localStorage.removeItem(KEY);state=load();toast("Ma'lumotlar tozalandi.");render()})
};
const gs=document.getElementById("globalSearch");if(gs)gs.addEventListener("input",e=>{searchTerm=e.target.value;if(!["inventory","sales","purchases"].includes(route))route="inventory";render()});
const PIN_KEY="tavars-pin-v1";
async function hashPin(pin){const data=new TextEncoder().encode("tavars:"+pin);if(window.crypto&&crypto.subtle){const buf=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");}return pin;}
const pinField=(label,name)=>`<div class="field"><label>${label}</label><input name="${name}" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required></div>`;
function pinButtons(){return localStorage.getItem(PIN_KEY)?`<button class="btn" data-action="set-pin">🔒 PINni o'zgartirish</button><button class="btn danger" data-action="remove-pin">PINni o'chirish</button>`:`<button class="btn" data-action="set-pin">🔒 PIN yaratish</button>`;}
async function checkPin(pin){return (await hashPin(pin))===localStorage.getItem(PIN_KEY)}
actions["set-pin"]=()=>{const has=!!localStorage.getItem(PIN_KEY);openModal(has?"PINni o'zgartirish":"PIN yaratish",(has?pinField("Hozirgi PIN","old"):"")+pinField("Yangi PIN (4–6 raqam)","pin")+pinField("PINni tasdiqlash","confirm"),async f=>{const old=String(f.get("old")||"");const pin=String(f.get("pin")||"");const confirm=String(f.get("confirm")||"");if(has && !(await checkPin(old)))return toast("Hozirgi PIN noto'g'ri.","error");if(pin.length<4||pin.length>6||!/\d+/.test(pin))return toast("PIN 4–6 raqamdan iborat bo'lsin.","error");if(pin!==confirm)return toast("PINlar mos kelmadi.","error");localStorage.setItem(PIN_KEY,await hashPin(pin));document.getElementById("modalRoot").innerHTML="";toast(has?"PIN yangilandi.":"PIN yaratildi.");},has?"Saqlash":"Yaratish");};
actions["remove-pin"]=()=>openModal("PINni o'chirish",pinField("Hozirgi PIN","old"),async f=>{if(!(await checkPin(String(f.get("old")||""))))return toast("PIN noto'g'ri.","error");localStorage.removeItem(PIN_KEY);document.getElementById("modalRoot").innerHTML="";toast("PIN o'chirildi.");},"O'chirish");
function showLock(){if(!localStorage.getItem(PIN_KEY))return;const d=document.createElement("div");d.id="pinLock";d.innerHTML=`<form class="pin-box"><h2>🔒 TAVAR'S</h2><p>PIN kodni kiriting</p><input type="password" inputmode="numeric" maxlength="6" autocomplete="off" /><button class="btn primary" type="submit">Kirish</button><div class="pin-err"></div></form>`;document.body.appendChild(d);const form=d.querySelector(".pin-box");form.addEventListener("submit",async e=>{e.preventDefault();const value=form.querySelector("input").value.trim();if(!(await checkPin(value))){form.querySelector(".pin-err").textContent="PIN noto'g'ri.";return;}d.remove();});}
showLock();
syncCash();
applyTheme();
render();
