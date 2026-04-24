// DB 뷰 — 3개 탭(A: Flat / B: Pivot / C: Master-Detail)
// parser.js가 제공하는 전역: parseHtml, parseAmount, formatWon, loadSharedState, saveSharedState

let state = null;
let activeTab = 'A';
const toastEl = document.getElementById('toast');
const emptyEl = document.getElementById('emptyState');
const main = document.getElementById('main');

function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); }

// ============================================================
// Flat coverage list derived from state
// ============================================================
function flatCoverages() {
  if (!state) return [];
  const rows = [];
  state.products.forEach(p => {
    p.coverages.forEach(c => {
      rows.push({
        product: p.header || '(상품명 미상)',
        productId: p.id,
        contractor: c.contractor || '',
        major: c.major || '',
        minor: c.minor || '',
        name: c.name || '',
        amount: c.amount || '',
        amountNum: parseAmount(c.amount) || 0,
        term: c.term || '',
        start: c.start || '',
        end: c.end || '',
      });
    });
  });
  return rows;
}

// ============================================================
// Tab switching
// ============================================================
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

function render() {
  main.innerHTML = '';
  if (!state) { emptyEl.style.display = ''; return; }
  emptyEl.style.display = 'none';
  if (activeTab === 'A') renderFlat();
  else if (activeTab === 'B') renderPivot();
  else if (activeTab === 'C') renderMasterDetail();
}

// ============================================================
// View A — Flat spreadsheet
// ============================================================
const flatState = {
  search: '',
  groupBy: 'none',   // none | product | major | contractor
  sortBy: 'product',
  sortDir: 'asc',
  productFilter: new Set(),
  majorFilter: new Set(),
};

function renderFlat() {
  const rows = flatCoverages();

  // toolbar
  const toolbar = el('div', 'toolbar');
  const search = el('input'); search.type = 'search'; search.placeholder = '보장명·상품·금액 검색';
  search.value = flatState.search;
  search.oninput = () => { flatState.search = search.value; rerenderBody(); };
  toolbar.appendChild(labeled('🔍', search));

  toolbar.appendChild(labeled('그룹', mkGroupSelect()));

  // Filter chips — 상품
  const products = [...new Set(rows.map(r => r.product))];
  toolbar.appendChild(mkChipGroup('상품', products, flatState.productFilter));

  const majors = [...new Set(rows.map(r => r.major).filter(Boolean))];
  toolbar.appendChild(mkChipGroup('대분류', majors, flatState.majorFilter));

  const clearBtn = el('button', 'btn small', '필터 초기화');
  clearBtn.onclick = () => { flatState.search = ''; flatState.productFilter.clear(); flatState.majorFilter.clear(); render(); };
  toolbar.appendChild(el('div', 'spacer'));
  toolbar.appendChild(clearBtn);

  main.appendChild(toolbar);

  // stats bar
  const stats = el('div', 'stats');
  const wrap = el('div', 'db-wrap');
  const tableWrap = el('div', 'db-table-wrap');

  function rerenderBody() {
    const filtered = filterAndSort(rows);
    refreshStats(stats, filtered);
    tableWrap.innerHTML = '';
    tableWrap.appendChild(buildFlatTable(filtered));
  }
  main.appendChild(stats);
  wrap.appendChild(tableWrap);
  main.appendChild(wrap);
  rerenderBody();
}

function filterAndSort(rows) {
  const q = flatState.search.trim().toLowerCase();
  let out = rows.filter(r => {
    if (q) {
      const hay = [r.product, r.major, r.minor, r.name, r.amount, r.contractor].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (flatState.productFilter.size && !flatState.productFilter.has(r.product)) return false;
    if (flatState.majorFilter.size && !flatState.majorFilter.has(r.major)) return false;
    return true;
  });
  const key = flatState.sortBy, dir = flatState.sortDir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    const va = key === 'amountNum' ? a.amountNum : (a[key] || '');
    const vb = key === 'amountNum' ? b.amountNum : (b[key] || '');
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'ko') * dir;
  });
  return out;
}

function refreshStats(stats, rows) {
  stats.innerHTML = '';
  const totalAmount = rows.reduce((s, r) => s + (r.amountNum || 0), 0);
  stats.appendChild(statItem('보장 건수', rows.length + '건'));
  stats.appendChild(statItem('총 보장 금액', formatWon(totalAmount), true));
  stats.appendChild(statItem('상품 수', new Set(rows.map(r => r.product)).size + '개'));
  stats.appendChild(statItem('대분류 수', new Set(rows.map(r => r.major).filter(Boolean)).size + '개'));
}

function buildFlatTable(rows) {
  const table = el('table', 'db-tbl');
  const columns = [
    { key: 'product', label: '상품' },
    { key: 'major', label: '대분류' },
    { key: 'minor', label: '소분류' },
    { key: 'name', label: '보장명' },
    { key: 'amountNum', label: '보장 금액', align: 'right', format: (r) => r.amount },
    { key: 'term', label: '납입기간' },
    { key: 'start', label: '시작일' },
    { key: 'end', label: '종료일' },
    { key: 'contractor', label: '계약자/피보험자' },
  ];

  const thead = el('thead');
  const htr = el('tr');
  columns.forEach(c => {
    const th = el('th'); th.textContent = c.label;
    if (flatState.sortBy === c.key) {
      const ind = el('span', 'sort-ind', flatState.sortDir === 'asc' ? '▲' : '▼');
      th.appendChild(ind);
    }
    th.onclick = () => {
      if (flatState.sortBy === c.key) flatState.sortDir = flatState.sortDir === 'asc' ? 'desc' : 'asc';
      else { flatState.sortBy = c.key; flatState.sortDir = 'asc'; }
      render();
    };
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = el('tbody');
  if (flatState.groupBy === 'none') {
    rows.forEach(r => tbody.appendChild(buildFlatRow(r, columns)));
  } else {
    const groups = new Map();
    rows.forEach(r => {
      const k = r[flatState.groupBy] || '(미지정)';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    for (const [gk, grs] of groups) {
      const head = el('tr', 'group-head');
      const td = el('td'); td.colSpan = columns.length;
      const total = grs.reduce((s, r) => s + (r.amountNum || 0), 0);
      td.textContent = `${gk} — ${grs.length}건, ${formatWon(total)}`;
      head.appendChild(td); tbody.appendChild(head);
      grs.forEach(r => tbody.appendChild(buildFlatRow(r, columns)));
    }
  }
  table.appendChild(tbody);
  return table;
}

function buildFlatRow(r, columns) {
  const tr = el('tr');
  columns.forEach(c => {
    const td = el('td');
    if (c.align === 'right') td.className = 'amount-cell';
    const val = c.format ? c.format(r) : r[c.key];
    td.textContent = val || '-';
    tr.appendChild(td);
  });
  return tr;
}

function mkGroupSelect() {
  const s = el('select');
  [
    ['none', '없음'], ['product', '상품별'],
    ['major', '대분류별'], ['contractor', '피보험자별'],
  ].forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = l; s.appendChild(o); });
  s.value = flatState.groupBy;
  s.onchange = () => { flatState.groupBy = s.value; render(); };
  return s;
}

function mkChipGroup(label, values, activeSet) {
  const wrap = el('div');
  wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '6px';
  const lb = el('span', 'label', label + ':');
  wrap.appendChild(lb);
  const group = el('div', 'chip-group');
  values.forEach(v => {
    const chip = el('span', 'chip' + (activeSet.has(v) ? ' active' : ''), v);
    chip.onclick = () => { activeSet.has(v) ? activeSet.delete(v) : activeSet.add(v); render(); };
    group.appendChild(chip);
  });
  wrap.appendChild(group);
  return wrap;
}

// ============================================================
// View B — Pivot matrix
// ============================================================
const pivotState = { collapsed: new Set() };

function renderPivot() {
  const productNames = state.category.productNames;
  if (!productNames || !productNames.length) {
    main.appendChild(el('div', 'empty-state', '상품 데이터가 없습니다. 편집기에서 먼저 HTML을 불러오세요.'));
    return;
  }
  // Toolbar
  const toolbar = el('div', 'toolbar');
  const expandAll = el('button', 'btn small', '모두 펼치기');
  expandAll.onclick = () => { pivotState.collapsed.clear(); render(); };
  const collapseAll = el('button', 'btn small', '모두 접기');
  collapseAll.onclick = () => {
    const majors = new Set(state.category.rows.map(r => r.major));
    pivotState.collapsed = majors; render();
  };
  toolbar.appendChild(expandAll); toolbar.appendChild(collapseAll);
  toolbar.appendChild(el('span', 'label', '색 진하기 = 금액 많음'));
  main.appendChild(toolbar);

  // Compute max amount for heatmap scaling
  let maxAmt = 0;
  state.category.rows.forEach(r => r.values.forEach(v => {
    const n = parseAmount(v); if (n > maxAmt) maxAmt = n;
  }));

  const wrap = el('div', 'pivot-wrap');
  const t = el('table', 'pivot-tbl');
  const thead = el('thead'); const hr = el('tr');
  hr.appendChild(el('th', '', '대분류'));
  hr.appendChild(el('th', '', '보장명'));
  productNames.forEach(n => hr.appendChild(el('th', '', n)));
  hr.appendChild(el('th', '', '합계'));
  thead.appendChild(hr); t.appendChild(thead);

  const tbody = el('tbody');
  // Group by major
  const groups = new Map();
  state.category.rows.forEach(r => {
    if (r.hidden) return;
    const k = r.major || '(미분류)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  for (const [major, rows] of groups) {
    const collapsed = pivotState.collapsed.has(major);
    // Group header row
    const gh = el('tr', 'group-head');
    const gth = el('th'); gth.colSpan = productNames.length + 3;
    gth.style.cursor = 'pointer'; gth.style.textAlign = 'left';
    gth.textContent = (collapsed ? '▶ ' : '▼ ') + major + ` (${rows.length}건)`;
    gth.onclick = () => { collapsed ? pivotState.collapsed.delete(major) : pivotState.collapsed.add(major); render(); };
    gh.appendChild(gth); tbody.appendChild(gh);

    if (collapsed) continue;

    rows.forEach(r => {
      const tr = el('tr');
      const majorCell = el('th', 'row-major', ''); tr.appendChild(majorCell);
      tr.appendChild(el('th', 'row-minor', r.minor || '-'));
      let rowSum = 0;
      r.values.forEach(v => {
        const n = parseAmount(v); if (n) rowSum += n;
        const cls = v && v !== '-' ? ('amount ' + heatClass(n, maxAmt)) : 'empty';
        tr.appendChild(el('td', cls, v || '-'));
      });
      tr.appendChild(el('td', 'total', rowSum ? formatWon(rowSum) : '-'));
      tbody.appendChild(tr);
    });
  }

  // Product totals row
  const totals = new Array(productNames.length).fill(0);
  state.category.rows.forEach(r => r.values.forEach((v, i) => { const n = parseAmount(v); if (n) totals[i] += n; }));
  const tr = el('tr');
  const pt = el('th', 'row-major', '합계'); tr.appendChild(pt);
  tr.appendChild(el('th', 'row-minor', ''));
  totals.forEach(t => tr.appendChild(el('td', 'total', t ? formatWon(t) : '-')));
  tr.appendChild(el('td', 'total', totals.reduce((a, b) => a + b, 0) ? formatWon(totals.reduce((a, b) => a + b, 0)) : '-'));
  tbody.appendChild(tr);
  t.appendChild(tbody);

  wrap.appendChild(t);
  main.appendChild(wrap);
}

function heatClass(n, max) {
  if (!n || !max) return '';
  const ratio = n / max;
  if (ratio > 0.75) return 'heat-4';
  if (ratio > 0.5) return 'heat-3';
  if (ratio > 0.25) return 'heat-2';
  if (ratio > 0.05) return 'heat-1';
  return '';
}

// ============================================================
// View C — Master-Detail
// ============================================================
const mdState = { mode: 'product', selectedId: null, search: '' };

function renderMasterDetail() {
  if (!state.products.length) {
    main.appendChild(el('div', 'empty-state', '상품 데이터가 없습니다.'));
    return;
  }
  const layout = el('div', 'md-layout');

  // Left list
  const list = el('div', 'md-list');
  const toolbar = el('div', 'md-toolbar');
  const search = el('input'); search.type = 'search'; search.placeholder = '검색…'; search.value = mdState.search;
  search.oninput = () => { mdState.search = search.value; renderListItems(); };
  toolbar.appendChild(search);
  const modeBar = el('div', 'md-mode');
  const pBtn = el('button', mdState.mode === 'product' ? 'active' : '', '상품 중심');
  const cBtn = el('button', mdState.mode === 'coverage' ? 'active' : '', '보장 중심');
  pBtn.onclick = () => { mdState.mode = 'product'; mdState.selectedId = null; render(); };
  cBtn.onclick = () => { mdState.mode = 'coverage'; mdState.selectedId = null; render(); };
  modeBar.appendChild(pBtn); modeBar.appendChild(cBtn);
  toolbar.appendChild(modeBar);
  list.appendChild(toolbar);
  const items = el('div', 'md-items');
  list.appendChild(items);

  const detail = el('div', 'md-detail');

  layout.appendChild(list); layout.appendChild(detail);
  main.appendChild(layout);

  function renderListItems() {
    items.innerHTML = '';
    const q = mdState.search.trim().toLowerCase();
    if (mdState.mode === 'product') {
      state.products.filter(p => !q || (p.header || '').toLowerCase().includes(q))
        .forEach(p => {
          const it = el('div', 'md-item' + (mdState.selectedId === p.id ? ' selected' : ''));
          it.appendChild(el('div', 'primary', p.header || '(상품명 미상)'));
          it.appendChild(el('div', 'secondary', `보장 ${p.coverages.length}건`));
          it.onclick = () => { mdState.selectedId = p.id; render(); };
          items.appendChild(it);
        });
    } else {
      // coverage-centric — group by coverage name across all products
      const flat = flatCoverages();
      const byName = new Map();
      flat.forEach(r => {
        const k = r.name || r.minor || '-';
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(r);
      });
      [...byName.entries()]
        .filter(([k]) => !q || k.toLowerCase().includes(q))
        .forEach(([name, list]) => {
          const it = el('div', 'md-item' + (mdState.selectedId === name ? ' selected' : ''));
          it.appendChild(el('div', 'primary', name));
          it.appendChild(el('div', 'secondary', `${list.length}개 상품에 포함`));
          it.onclick = () => { mdState.selectedId = name; render(); };
          items.appendChild(it);
        });
    }
  }
  renderListItems();

  // Detail
  if (mdState.mode === 'product') {
    const prod = state.products.find(p => p.id === mdState.selectedId) || state.products[0];
    mdState.selectedId = prod.id;
    detail.innerHTML = '';
    detail.appendChild(el('h2', '', prod.header || '(상품명 미상)'));
    const meta = el('div', 'meta-bar');
    meta.innerHTML = `<span>보장 수 <b>${prod.coverages.length}건</b></span>`;
    const total = prod.coverages.reduce((s, c) => s + (parseAmount(c.amount) || 0), 0);
    meta.innerHTML += `<span>총 보장 금액 <b>${formatWon(total)}</b></span>`;
    detail.appendChild(meta);

    const sec = el('div', 'sub-section');
    sec.appendChild(el('h3', '', `보장 목록`));
    prod.coverages.forEach(c => {
      const r = el('div', 'coverage-row');
      r.appendChild(el('div', '', c.contractor || '-'));
      r.appendChild(el('div', '', (c.major || '-') + ' / ' + (c.minor || '-')));
      r.appendChild(el('div', '', c.name || '-'));
      r.appendChild(el('div', '', c.amount || '-'));
      r.appendChild(el('div', '', c.term || '-'));
      r.appendChild(el('div', '', c.start || '-'));
      r.appendChild(el('div', '', c.end || '-'));
      sec.appendChild(r);
    });
    detail.appendChild(sec);
  } else {
    const name = mdState.selectedId;
    const flat = flatCoverages();
    const list = flat.filter(r => (r.name || r.minor || '-') === name);
    if (!list.length) { detail.appendChild(el('div', 'empty-state', '좌측에서 보장을 선택하세요')); return; }
    detail.innerHTML = '';
    detail.appendChild(el('h2', '', name));
    const totalAmt = list.reduce((s, r) => s + r.amountNum, 0);
    const meta = el('div', 'meta-bar');
    meta.innerHTML = `<span>상품 수 <b>${list.length}개</b></span><span>총 보장액 <b>${formatWon(totalAmt)}</b></span>`;
    detail.appendChild(meta);
    const sec = el('div', 'sub-section');
    sec.appendChild(el('h3', '', '상품별 보유 현황'));
    list.forEach(r => {
      const row = el('div', 'coverage-row');
      row.appendChild(el('div', '', r.product));
      row.appendChild(el('div', '', r.major + ' / ' + r.minor));
      row.appendChild(el('div', '', r.name));
      row.appendChild(el('div', '', r.amount));
      row.appendChild(el('div', '', r.term));
      row.appendChild(el('div', '', r.start));
      row.appendChild(el('div', '', r.end));
      sec.appendChild(row);
    });
    detail.appendChild(sec);
  }
}

// ============================================================
// Helpers
// ============================================================
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function labeled(label, input) {
  const w = el('div');
  w.style.display = 'flex'; w.style.alignItems = 'center'; w.style.gap = '6px';
  w.appendChild(el('span', 'label', label));
  w.appendChild(input);
  return w;
}
function statItem(label, value, accent) {
  const w = el('div', 'stat-item');
  w.appendChild(el('div', 'label', label));
  w.appendChild(el('div', 'value' + (accent ? ' accent' : ''), value));
  return w;
}

// ============================================================
// IO
// ============================================================
document.getElementById('loadHtmlBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  const parsed = parseHtml(text);
  if (parsed) { state = parsed; saveSharedState(state); render(); toast('불러왔습니다'); }
  else toast('파싱 실패');
  e.target.value = '';
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  const s = loadSharedState();
  if (s) { state = s; render(); toast('편집기 상태 동기화됨'); }
  else toast('공유 상태 없음');
});

// Boot
(function boot() {
  const s = loadSharedState();
  if (s) { state = s; render(); }
  else emptyEl.style.display = '';
})();
