/* TAVAR'S — boost.js
 * Qo'shimcha modul: zaxira nusxa, nasiya daftari, kam qolgan tovar,
 * CSV (Excel) eksport, chek chop etish.
 * Ulash: index.html oxiriga (app.js dan keyin) qo'shing:
 *   <script src="boost.js" defer></script>
 * Mavjud kodingizga tegmaydi: faqat localStorage'ni o'qiydi va o'zining
 * "tvx_" prefiksli kalitlariga yozadi.
 */
(function () {
  'use strict';

  var PREFIX = 'tvx_';
  var K_LAST_BACKUP = PREFIX + 'lastBackup';
  var K_DEBTS = PREFIX + 'debts';
  var K_LOW = PREFIX + 'lowStock';
  var BACKUP_DAYS = 7;

  /* ---------- yordamchilar ---------- */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { toast("Saqlab bo'lmadi: xotira to'lgan bo'lishi mumkin"); return false; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function parseMoney(s) { return Number(String(s).replace(/\./g, '').replace(/\s/g, '').replace(',', '.')) || 0; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- ma'lumotni avtomatik topish ----------
   * Sizning ma'lumot tuzilmangizni bilmaymiz, shuning uchun localStorage ichidagi
   * obyektlar massivlarini skanerlaymiz va maydon nomlaridan taxmin qilamiz. */
  var NAME_KEYS = ['name', 'nomi', 'nom', 'title', 'product', 'tovar'];
  var QTY_KEYS = ['qty', 'quantity', 'dona', 'soni', 'stock', 'count', 'miqdor'];

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] !== undefined) return obj[keys[i]];
    }
    return undefined;
  }
  function collectArrays(value, path, out, depth) {
    if (depth > 3 || value == null) return;
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
        out.push({ path: path, rows: value });
      }
      return;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach(function (k) { collectArrays(value[k], path + '.' + k, out, depth + 1); });
    }
  }
  function scanStorage() {
    var found = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.indexOf(PREFIX) === 0) continue;
      var data = load(key, null);
      if (data) collectArrays(data, key, found, 0);
    }
    return found;
  }
  function findProducts() {
    var list = [];
    scanStorage().forEach(function (t) {
      t.rows.forEach(function (r) {
        var n = pick(r, NAME_KEYS), q = pick(r, QTY_KEYS);
        if (n !== undefined && q !== undefined && !isNaN(Number(q))) {
          list.push({ name: String(n), qty: Number(q) });
        }
      });
    });
    return list;
  }

  /* ---------- 1. Zaxira nusxa ---------- */
  function exportBackup() {
    var dump = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      dump[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify({ app: 'TAVARS', date: new Date().toISOString(), data: dump }, null, 2)],
      { type: 'application/json' });
    download(blob, 'tavars-zaxira-' + today() + '.json');
    localStorage.setItem(K_LAST_BACKUP, String(Date.now()));
    toast('Zaxira nusxa yuklab olindi');
    refreshBanner();
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || parsed.app !== 'TAVARS' || typeof parsed.data !== 'object') throw new Error('format');
        var n = Object.keys(parsed.data).length;
        if (!confirm('Hozirgi barcha ma\'lumot o\'chirilib, ' + n + ' ta yozuv tiklanadi. Davom etasizmi?')) return;
        localStorage.clear();
        Object.keys(parsed.data).forEach(function (k) { localStorage.setItem(k, parsed.data[k]); });
        toast('Tiklandi. Sahifa qayta yuklanmoqda...');
        setTimeout(function () { location.reload(); }, 800);
      } catch (e) {
        toast("Fayl noto'g'ri: faqat TAVARS zaxira faylini tanlang");
      }
    };
    reader.readAsText(file);
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function daysSinceBackup() {
    var t = Number(localStorage.getItem(K_LAST_BACKUP));
    return t ? Math.floor((Date.now() - t) / 86400000) : Infinity;
  }

  /* ---------- 2. CSV (Excel) eksport ---------- */
  function toCSV(rows) {
    var cols = [];
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0 && typeof r[k] !== 'object') cols.push(k); });
    });
    function cell(v) {
      v = v == null ? '' : String(v);
      return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = [cols.map(cell).join(';')];
    rows.forEach(function (r) { lines.push(cols.map(function (c) { return cell(r[c]); }).join(';')); });
    return '\ufeff' + lines.join('\r\n');
  }
  function exportCSV() {
    var tables = scanStorage();
    if (!tables.length) { toast("Eksport qilinadigan jadval topilmadi"); return; }
    tables.forEach(function (t, i) {
      var name = t.path.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 40) || ('jadval' + i);
      setTimeout(function () {
        download(new Blob([toCSV(t.rows)], { type: 'text/csv;charset=utf-8' }), name + '-' + today() + '.csv');
      }, i * 400);
    });
    toast(tables.length + ' ta jadval yuklanmoqda (Excel\'da ochiladi)');
  }

  /* ---------- 3. Nasiya daftari ---------- */
  function debtsView() {
    var debts = load(K_DEBTS, []);
    var total = 0;
    var rows = debts.map(function (d) {
      var paid = (d.payments || []).reduce(function (s, p) { return s + p.sum; }, 0);
      var left = d.amount - paid;
      total += Math.max(left, 0);
      return '<tr><td>' + esc(d.name) + (d.phone ? '<br><small>' + esc(d.phone) + '</small>' : '') + '</td>' +
        '<td class="n">' + money(d.amount) + '</td>' +
        '<td class="n ' + (left > 0 ? 'bad' : 'ok') + '">' + money(left) + '</td>' +
        '<td class="act"><button data-pay="' + d.id + '">To\'lov</button>' +
        '<button data-del="' + d.id + '" class="ghost">O\'chirish</button></td></tr>';
    }).join('');
    return '<h3>Nasiya daftari</h3>' +
      '<p class="sum">Jami qarz: <b>' + money(total) + '</b> so\'m</p>' +
      '<div class="row"><input id="tvxDName" placeholder="Mijoz ismi">' +
      '<input id="tvxDPhone" placeholder="Telefon" inputmode="tel">' +
      '<input id="tvxDAmt" placeholder="Summa" inputmode="numeric">' +
      '<button id="tvxDAdd">Qo\'shish</button></div>' +
      (rows ? '<div class="scroll"><table><thead><tr><th>Mijoz</th><th>Qarz</th><th>Qoldi</th><th></th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' : '<p class="muted">Hozircha nasiya yo\'q. Yuqoridan birinchisini qo\'shing.</p>');
  }
  function bindDebts(root) {
    var amt = root.querySelector('#tvxDAmt');
    if (amt) amt.addEventListener('input', function () { amt.value = money(parseMoney(amt.value)).replace(/^0$/, ''); });
    var add = root.querySelector('#tvxDAdd');
    if (add) add.onclick = function () {
      var name = root.querySelector('#tvxDName').value.trim();
      var sum = parseMoney(amt.value);
      if (!name || sum <= 0) { toast('Ism va summani kiriting'); return; }
      var debts = load(K_DEBTS, []);
      debts.push({ id: uid(), name: name, phone: root.querySelector('#tvxDPhone').value.trim(),
        amount: sum, date: today(), payments: [] });
      save(K_DEBTS, debts);
      show('debts');
    };
    root.querySelectorAll('[data-pay]').forEach(function (b) {
      b.onclick = function () {
        var v = parseMoney(prompt("To'lov summasi (so'm):") || '');
        if (v <= 0) return;
        var debts = load(K_DEBTS, []);
        debts.forEach(function (d) { if (d.id === b.dataset.pay) d.payments.push({ date: today(), sum: v }); });
        save(K_DEBTS, debts);
        show('debts');
      };
    });
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Bu yozuv o'chirilsinmi?")) return;
        save(K_DEBTS, load(K_DEBTS, []).filter(function (d) { return d.id !== b.dataset.del; }));
        show('debts');
      };
    });
  }

  /* ---------- 4. Kam qolgan tovar ---------- */
  function lowList() {
    var limit = Number(localStorage.getItem(K_LOW));
    if (isNaN(limit) || localStorage.getItem(K_LOW) === null) limit = 3;
    return { limit: limit, items: findProducts().filter(function (p) { return p.qty <= limit; })
      .sort(function (a, b) { return a.qty - b.qty; }) };
  }
  function lowView() {
    var r = lowList();
    var rows = r.items.map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td class="n ' + (p.qty <= 0 ? 'bad' : '') + '">' + p.qty + ' dona</td></tr>';
    }).join('');
    return '<h3>Kam qolgan tovarlar</h3>' +
      '<div class="row"><label>Ogohlantirish chegarasi (dona):</label>' +
      '<input id="tvxLimit" type="number" min="0" value="' + r.limit + '" style="max-width:90px"></div>' +
      (rows ? '<div class="scroll"><table><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">Hamma tovar yetarli. Agar omborda tovar bo\'lsa-yu bu yerda ko\'rinmasa, tovar ma\'lumoti kutilgan maydon nomlarida emas.</p>');
  }
  function bindLow(root) {
    var el = root.querySelector('#tvxLimit');
    if (el) el.onchange = function () { localStorage.setItem(K_LOW, String(Math.max(0, Number(el.value) || 0))); show('low'); refreshBadge(); };
  }

  /* ---------- 5. Chek chop etish ---------- */
  function receiptView() {
    return '<h3>Chek chop etish</h3>' +
      '<div id="tvxLines"></div>' +
      '<div class="row"><button id="tvxAddLine" class="ghost">+ Qator</button>' +
      '<button id="tvxPrint">Chop etish</button></div>' +
      '<p class="muted">Qo\'lda kiritilgan tovarlar uchun. Chek brauzer orqali printerga yoki PDF\'ga chiqadi.</p>';
  }
  function bindReceipt(root) {
    var box = root.querySelector('#tvxLines');
    function addLine() {
      var d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = '<input class="rn" placeholder="Tovar nomi"><input class="rq" placeholder="Soni" inputmode="numeric" style="max-width:70px" value="1">' +
        '<input class="rp" placeholder="Narxi" inputmode="numeric" style="max-width:120px">';
      var p = d.querySelector('.rp');
      p.addEventListener('input', function () { p.value = money(parseMoney(p.value)).replace(/^0$/, ''); });
      box.appendChild(d);
    }
    addLine();
    root.querySelector('#tvxAddLine').onclick = addLine;
    root.querySelector('#tvxPrint').onclick = function () {
      var items = [], total = 0;
      box.querySelectorAll('.row').forEach(function (r) {
        var n = r.querySelector('.rn').value.trim();
        var q = Number(r.querySelector('.rq').value) || 0;
        var p = parseMoney(r.querySelector('.rp').value);
        if (n && q > 0) { items.push({ n: n, q: q, p: p }); total += q * p; }
      });
      if (!items.length) { toast('Kamida bitta tovar kiriting'); return; }
      var w = window.open('', '_blank', 'width=360,height=600');
      if (!w) { toast("Oyna bloklandi: brauzerda popup'ga ruxsat bering"); return; }
      w.document.write('<!doctype html><meta charset="utf-8"><title>Chek</title>' +
        '<style>body{font:13px/1.5 monospace;width:280px;margin:12px auto}h2{text-align:center;margin:0}' +
        'table{width:100%;border-collapse:collapse}td{padding:2px 0}.r{text-align:right}hr{border:0;border-top:1px dashed #000}</style>' +
        '<h2>TAVAR\'S</h2><p style="text-align:center">' + new Date().toLocaleString('uz-UZ') + '</p><hr><table>' +
        items.map(function (i) {
          return '<tr><td>' + esc(i.n) + '<br>' + i.q + ' x ' + money(i.p) + '</td><td class="r">' + money(i.q * i.p) + '</td></tr>';
        }).join('') + '</table><hr><p class="r"><b>JAMI: ' + money(total) + ' so\'m</b></p>' +
        '<p style="text-align:center">Xaridingiz uchun rahmat!</p>');
      w.document.close();
      w.focus();
      setTimeout(function () { w.print(); }, 300);
    };
  }

  /* ---------- 6. Zaxira paneli ---------- */
  function backupView() {
    var d = daysSinceBackup();
    return '<h3>Zaxira va eksport</h3>' +
      '<p class="muted">Ma\'lumotlar faqat shu brauzerda saqlanadi. Telefon almashsa yoki brauzer tozalansa, hammasi yo\'qoladi. Zaxira nusxani muntazam oling.</p>' +
      '<p>Oxirgi zaxira: <b>' + (d === Infinity ? 'hali olinmagan' : (d === 0 ? 'bugun' : d + ' kun oldin')) + '</b></p>' +
      '<div class="row"><button id="tvxExp">Zaxira nusxa olish</button>' +
      '<button id="tvxImp" class="ghost">Zaxiradan tiklash</button>' +
      '<input id="tvxFile" type="file" accept="application/json" hidden></div>' +
      '<div class="row"><button id="tvxCsv" class="ghost">Excel (CSV) ga eksport</button></div>';
  }
  function bindBackup(root) {
    root.querySelector('#tvxExp').onclick = function () { exportBackup(); show('backup'); };
    var f = root.querySelector('#tvxFile');
    root.querySelector('#tvxImp').onclick = function () { f.click(); };
    f.onchange = function () { if (f.files[0]) importBackup(f.files[0]); };
    root.querySelector('#tvxCsv').onclick = exportCSV;
  }

  /* ---------- UI ---------- */
  var css = '' +
    '#tvxFab{position:fixed;right:14px;bottom:14px;z-index:9998;background:#e0b84a;color:#101510;border:0;border-radius:999px;' +
    'padding:12px 16px;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer}' +
    '#tvxFab span{background:#b3261e;color:#fff;border-radius:999px;padding:1px 7px;margin-left:6px;font-size:12px}' +
    '#tvxPanel{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}' +
    '#tvxPanel.open{display:flex}' +
    '#tvxBox{background:#1a221a;color:#e9efe6;width:min(560px,100%);max-height:88vh;overflow:auto;border-radius:16px 16px 0 0;' +
    'padding:16px;font:14px/1.45 system-ui,sans-serif}' +
    '#tvxBox h3{margin:4px 0 10px;font-size:18px}' +
    '#tvxTabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}' +
    '#tvxTabs button,#tvxBox button{background:#e0b84a;color:#101510;border:0;border-radius:8px;padding:8px 12px;font:600 13px system-ui;cursor:pointer}' +
    '#tvxTabs button.on{outline:2px solid #fff}' +
    '#tvxBox button.ghost,#tvxTabs button{background:#2a352a;color:#e9efe6}' +
    '#tvxBox input{background:#101510;color:#e9efe6;border:1px solid #3a4a3a;border-radius:8px;padding:8px;font:14px system-ui;flex:1;min-width:0}' +
    '#tvxBox .row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;align-items:center}' +
    '#tvxBox table{width:100%;border-collapse:collapse}#tvxBox th,#tvxBox td{padding:6px 4px;border-bottom:1px solid #2f3d2f;text-align:left;vertical-align:top}' +
    '#tvxBox .n{text-align:right;white-space:nowrap}#tvxBox .bad{color:#ff8a80}#tvxBox .ok{color:#8fd694}' +
    '#tvxBox .muted{color:#9fb09b}#tvxBox .sum{font-size:16px}#tvxBox .scroll{overflow-x:auto}' +
    '#tvxBox .act{white-space:nowrap}#tvxBox .act button{margin-left:4px;padding:5px 8px}' +
    '#tvxBanner{position:fixed;left:0;right:0;top:0;z-index:9997;background:#e0b84a;color:#101510;padding:8px 12px;' +
    'font:600 13px system-ui;display:none;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap}' +
    '#tvxBanner button{background:#101510;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}' +
    '#tvxToast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#101510;color:#fff;border:1px solid #3a4a3a;' +
    'padding:9px 14px;border-radius:10px;z-index:10000;font:13px system-ui;display:none;max-width:90%}' +
    '@media (prefers-reduced-motion:no-preference){#tvxBox{animation:tvxUp .18s ease-out}}' +
    '@keyframes tvxUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}';

  var tabs = [
    { id: 'backup', label: 'Zaxira', view: backupView, bind: bindBackup },
    { id: 'debts', label: 'Nasiya', view: debtsView, bind: bindDebts },
    { id: 'low', label: 'Kam qolgan', view: lowView, bind: bindLow },
    { id: 'receipt', label: 'Chek', view: receiptView, bind: bindReceipt }
  ];
  var panel, box, fab, banner, toastEl, current = 'backup';

  function show(id) {
    current = id;
    var t = tabs.filter(function (x) { return x.id === id; })[0];
    box.innerHTML = '<div id="tvxTabs">' + tabs.map(function (x) {
      return '<button data-tab="' + x.id + '" class="' + (x.id === id ? 'on' : '') + '">' + x.label + '</button>';
    }).join('') + '<button data-close="1" class="ghost" style="margin-left:auto">Yopish</button></div>' + t.view();
    box.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { show(b.dataset.tab); }; });
    box.querySelector('[data-close]').onclick = function () { panel.classList.remove('open'); };
    t.bind(box);
  }
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.style.display = 'none'; }, 2800);
  }
  function refreshBadge() {
    var n = lowList().items.length;
    fab.innerHTML = 'Qo\'shimchalar' + (n ? '<span title="Kam qolgan tovarlar">' + n + '</span>' : '');
  }
  function refreshBanner() {
    var d = daysSinceBackup();
    var need = d >= BACKUP_DAYS && localStorage.length > 0;
    banner.style.display = need ? 'flex' : 'none';
    if (need) {
      banner.innerHTML = (d === Infinity ? 'Zaxira nusxa hali olinmagan.' : d + ' kundan beri zaxira olinmagan.') +
        ' <button id="tvxBanBtn">Hozir olish</button>';
      banner.querySelector('#tvxBanBtn').onclick = exportBackup;
    }
  }

  function init() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    banner = document.createElement('div'); banner.id = 'tvxBanner';
    toastEl = document.createElement('div'); toastEl.id = 'tvxToast'; toastEl.setAttribute('role', 'status');
    fab = document.createElement('button'); fab.id = 'tvxFab'; fab.type = 'button';
    panel = document.createElement('div'); panel.id = 'tvxPanel';
    box = document.createElement('div'); box.id = 'tvxBox';
    panel.appendChild(box);
    [banner, toastEl, fab, panel].forEach(function (el) { document.body.appendChild(el); });

    fab.onclick = function () { show(current); panel.classList.add('open'); };
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.classList.remove('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.classList.remove('open'); });

    refreshBadge();
    refreshBanner();
    setInterval(refreshBadge, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
