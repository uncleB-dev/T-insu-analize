// ============================================================
// State (parser.js provides uid, emptyState, parseHtml, saveSharedState, loadSharedState)
// ============================================================
let state = null;

// ============================================================
// Rendering
// ============================================================
const root = document.getElementById('root');
const emptyStateEl = document.getElementById('emptyState');
const sourceInfo = document.getElementById('sourceInfo');
const toastEl = document.getElementById('toast');
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); }

function render() {
  root.innerHTML = '';
  if (!state) { emptyStateEl.style.display = ''; return; }
  emptyStateEl.style.display = 'none';

  root.appendChild(renderBasic());
  root.appendChild(renderInsurance());
  root.appendChild(renderCategory());
  if (state.mergedView) {
    root.appendChild(renderProductsMerged());
  } else {
    root.appendChild(renderProducts());
  }
}

function section(title, subtitle, rightControls) {
  const s = document.createElement('section'); s.className = 'section';
  const h = document.createElement('div'); h.className = 'section-title';
  h.innerHTML = `<span>${title}</span>${subtitle ? `<span class="section-sub">${subtitle}</span>` : ''}`;
  if (rightControls) { h.style.display = 'flex'; h.style.alignItems = 'center'; h.style.justifyContent = 'space-between'; h.appendChild(rightControls); }
  s.appendChild(h);
  return s;
}

/** Shared cell factory. opts.readonly → 비편집(라벨/잠긴 정보). */
function editCell(text, setter, opts = {}) {
  const el = document.createElement('div');
  el.className = 'cell' + (opts.align === 'right' ? ' align-right' : '') + (opts.readonly ? ' readonly' : '');
  if (opts.readonly) {
    decorate(el, text ?? '', opts);
    return el;
  }
  el.contentEditable = 'true';
  el.spellcheck = false;
  decorate(el, text ?? '', opts);
  el.addEventListener('focus', () => { el.dataset.raw = text ?? ''; el.textContent = text ?? ''; });
  el.addEventListener('blur', () => {
    const v = el.textContent;
    if (setter) setter(v);
    decorate(el, v, opts);
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = el.dataset.raw ?? ''; el.blur(); }
  });
  return el;
}

/** Decorate non-focused cells with tag/amount/date styling. */
function decorate(el, text, opts = {}) {
  el.innerHTML = '';
  if (!text) { el.textContent = opts.placeholder || ''; return; }
  // Status tags
  if (/^정상$/.test(text))   return addTag(el, text, 'ok');
  if (/^비갱신형$/.test(text)) return addTag(el, text, 'norenew');
  if (/^갱신형( 특약)?$/.test(text)) return addTag(el, text, 'renew');
  if (/^(납입중|납임중)$/.test(text)) return addTag(el, text, 'paying');
  if (/^(납입종료|납입완료)$/.test(text)) return addTag(el, text, 'done');
  if (/^소멸$/.test(text)) return addTag(el, text, 'expired');
  // Highlighted amount (starts with *)
  if (/^\*\s*[\d,]+/.test(text)) {
    const s = document.createElement('span'); s.className = 'amount primary'; s.textContent = text;
    el.appendChild(s); return;
  }
  // Pure money "123,456 만원" / "123만원" / "10,000 원"
  if (/^[\d,]+\s*(만원|원)$/.test(text)) {
    const s = document.createElement('span'); s.className = 'amount'; s.textContent = text;
    el.appendChild(s); return;
  }
  el.textContent = text;
}
function addTag(el, text, kind) {
  const s = document.createElement('span'); s.className = 'tag tag-' + kind; s.textContent = text;
  el.appendChild(s);
}

// --- 기본정보 ---
function renderBasic() {
  const s = section('기본정보');
  const wrap = document.createElement('div'); wrap.className = 'grid-wrap';
  const t = document.createElement('table'); t.className = 'tbl basic';
  const tr = document.createElement('tr');
  SCHEMA.basic.fields.forEach(f => {
    const th = document.createElement('th'); th.textContent = f;
    const td = document.createElement('td');
    td.appendChild(editCell(state.basic[f], v => state.basic[f] = v));
    tr.appendChild(th); tr.appendChild(td);
  });
  t.appendChild(tr); wrap.appendChild(t); s.appendChild(wrap);
  return s;
}

// --- 가입보험 상세정보 ---
function renderInsurance() {
  const visible = state.insurance.products.map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.hidden || state.insurance.showHidden);
  const hiddenCount = state.insurance.products.filter(p => p.hidden).length;

  const controls = document.createElement('div'); controls.className = 'section-controls';
  const addBtn = document.createElement('button'); addBtn.className = 'btn small primary';
  addBtn.textContent = '＋ 상품 추가';
  addBtn.onclick = addProduct;
  const showHiddenBtn = document.createElement('button'); showHiddenBtn.className = 'btn small';
  showHiddenBtn.textContent = `숨김 상품 ${hiddenCount}개 ${state.insurance.showHidden ? '숨기기' : '보기'}`;
  showHiddenBtn.onclick = () => { state.insurance.showHidden = !state.insurance.showHidden; render(); };
  controls.appendChild(showHiddenBtn); controls.appendChild(addBtn);

  const s = section('가입보험 상세정보', `${state.insurance.products.length}개 상품 (표시 ${visible.length})`, controls);
  const container = document.createElement('div'); container.className = 'insurance-layout';

  // Summary box (left)
  const box = document.createElement('aside'); box.className = 'summary-box';
  [
    ['count', '보험 개수', '개'],
    ['monthly', '월납 보험료 합계', '원'],
    ['paid', '기납 보험료 합계', '원'],
    ['remain', '잔여 보험료 합계', '원'],
    ['total', '총 보험료 합계', '원'],
  ].forEach(([k, label, unit]) => {
    const item = document.createElement('div'); item.className = 'summary-item' + (k === 'total' ? ' total' : '');
    const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = label;
    const val = document.createElement('div'); val.className = 'value';
    val.appendChild(editCell(state.insurance.summary[k], v => state.insurance.summary[k] = v));
    const unitEl = document.createElement('span'); unitEl.className = 'unit'; unitEl.textContent = ' ' + unit;
    val.appendChild(unitEl);
    item.appendChild(lab); item.appendChild(val); box.appendChild(item);
  });
  container.appendChild(box);

  // Grid (right) — 카테고리 섹션과 컬럼 폭 정렬 일치:
  // [action spacer][label][total spacer][product(visible)...]
  const gridWrap = document.createElement('div'); gridWrap.className = 'grid-wrap';
  const t = document.createElement('table'); t.className = 'tbl insurance-grid fixed';
  const cg = document.createElement('colgroup');
  cg.appendChild(mkCol(SCHEMA.widths.actionCol));  // 카테고리의 액션 컬럼 폭과 대응
  cg.appendChild(mkCol(SCHEMA.widths.labelCol));
  cg.appendChild(mkCol(SCHEMA.widths.totalCol));   // 카테고리의 "보험명(합계)" 컬럼 폭과 대응
  visible.forEach(() => cg.appendChild(mkCol(SCHEMA.widths.productCol)));
  t.appendChild(cg);

  // Header row: [action spacer] [보험명 label] [total spacer] + product names (with col actions)
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(mkTh(''));
  const hlabel = document.createElement('th'); hlabel.className = 'row-label'; hlabel.textContent = '보험명';
  hr.appendChild(hlabel);
  hr.appendChild(mkTh(''));
  visible.forEach(({ p, i }) => {
    const th = document.createElement('th');
    if (p.hidden) th.classList.add('col-hidden');
    th.appendChild(buildColHeader(p, i));
    hr.appendChild(th);
  });
  thead.appendChild(hr); t.appendChild(thead);

  const tbody = document.createElement('tbody');
  SCHEMA.insurance.rows.slice(1).forEach(field => {
    const tr = document.createElement('tr');
    const spacer1 = document.createElement('td'); spacer1.className = 'spacer-col'; tr.appendChild(spacer1);
    const th = document.createElement('th'); th.className = 'row-label'; th.textContent = field;
    tr.appendChild(th);
    const spacer2 = document.createElement('td'); spacer2.className = 'spacer-col'; tr.appendChild(spacer2);
    visible.forEach(({ p }) => {
      const td = document.createElement('td');
      if (p.hidden) td.classList.add('col-hidden');
      const opts = /보험료$/.test(field) ? { align: 'right' } : {};
      td.appendChild(editCell(p[field], v => p[field] = v, opts));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody); gridWrap.appendChild(t); container.appendChild(gridWrap);
  s.appendChild(container);
  return s;
}

/** 상품 컬럼 헤더: [이동/숨김 버튼 바] + [상품명(최초 로드는 readonly, 유저 추가는 편집 가능)] */
function buildColHeader(product, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'col-header';
  const actions = document.createElement('div'); actions.className = 'col-actions';
  actions.appendChild(mkBtn('◀', () => moveProduct(idx, -1)));
  actions.appendChild(mkBtn('▶', () => moveProduct(idx, 1)));
  actions.appendChild(mkBtn(product.hidden ? '👁' : '🙈', () => toggleProductHidden(idx)));
  const title = document.createElement('div'); title.className = 'col-title';
  title.appendChild(editCell(product['보험명'], v => {
    product['보험명'] = v;
    state.category.productNames[idx] = v;
  }, { readonly: !product.userAdded }));
  wrap.appendChild(actions); wrap.appendChild(title);
  return wrap;
}

// --- 카테고리별 상세정보 ---
// 보장명(소분류)은 최초 로드 항목 → readonly, 유저 추가(extra) 행만 편집 가능
function renderCategory() {
  const productNames = state.category.productNames;
  const visible = state.insurance.products.map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.hidden || state.insurance.showHidden);

  const controls = document.createElement('div'); controls.className = 'section-controls';
  const hiddenCount = state.category.rows.filter(r => r.hidden).length;
  const toggleHiddenBtn = document.createElement('button');
  toggleHiddenBtn.className = 'btn small';
  toggleHiddenBtn.textContent = `숨김 행 ${hiddenCount}개 ${state.category.showHidden ? '숨기기' : '보기'}`;
  toggleHiddenBtn.onclick = () => { state.category.showHidden = !state.category.showHidden; render(); };
  const addRowBtn = document.createElement('button'); addRowBtn.className = 'btn small primary';
  addRowBtn.textContent = '＋ 보장명 행 추가';
  addRowBtn.onclick = () => {
    state.category.rows.push({ id: uid(), major: '', minor: '', total: '', values: new Array(productNames.length).fill(''), hidden: false, extra: true });
    render();
  };
  controls.appendChild(toggleHiddenBtn); controls.appendChild(addRowBtn);

  const s = section('카테고리별 상세정보', '', controls);
  const gridWrap = document.createElement('div'); gridWrap.className = 'grid-wrap';
  const t = document.createElement('table'); t.className = 'tbl category-grid fixed';

  const cg = document.createElement('colgroup');
  cg.appendChild(mkCol(SCHEMA.widths.actionCol));
  cg.appendChild(mkCol(SCHEMA.widths.labelCol));
  cg.appendChild(mkCol(SCHEMA.widths.totalCol));
  visible.forEach(() => cg.appendChild(mkCol(SCHEMA.widths.productCol)));
  t.appendChild(cg);

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(mkTh(''));
  hr.appendChild(mkTh('보장명'));
  hr.appendChild(mkTh('보험명'));
  visible.forEach(({ p }) => {
    const th = mkTh('');
    const name = document.createElement('div'); name.className = 'col-title';
    name.textContent = p['보험명'] || '(미입력)';
    if (p.hidden) th.classList.add('col-hidden');
    th.appendChild(name);
    hr.appendChild(th);
  });
  thead.appendChild(hr); t.appendChild(thead);

  const tbody = document.createElement('tbody');
  state.category.rows.forEach((row, idx) => {
    if (row.hidden && !state.category.showHidden) return;
    const tr = document.createElement('tr');
    if (row.hidden) tr.classList.add('row-hidden');
    tr.appendChild(rowActions(row, idx, 'category'));
    // 보장명 — 최초 로드는 readonly, 유저 추가 행만 편집 가능
    const n = document.createElement('td');
    n.appendChild(editCell(row.minor, v => row.minor = v, { readonly: !row.extra }));
    tr.appendChild(n);
    const to = document.createElement('td');
    to.appendChild(editCell(row.total, v => row.total = v, { align: 'right' }));
    tr.appendChild(to);
    visible.forEach(({ p, i: ci }) => {
      const td = document.createElement('td');
      if (p.hidden) td.classList.add('col-hidden');
      td.appendChild(editCell(row.values[ci] || '', v => { row.values[ci] = v; }, { align: 'right' }));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody); gridWrap.appendChild(t); s.appendChild(gridWrap);
  return s;
}

// --- 상품별 보장 목록 ---
function renderProducts() {
  const controls = document.createElement('div'); controls.className = 'section-controls';
  const mergeBtn = document.createElement('button'); mergeBtn.className = 'btn small';
  mergeBtn.textContent = '🔀 통합 뷰';
  mergeBtn.onclick = () => { state.mergedView = true; render(); };
  controls.appendChild(mergeBtn);

  const s = section('상품별 보장 목록', `${state.products.length}개 상품`, controls);

  state.products.forEach(prod => {
    const unmatched = prod.coverages.filter(c => !c.minor || c.minor === '-');
    const card = document.createElement('div'); card.className = 'product-card';
    const head = document.createElement('div'); head.className = 'product-header';
    const t = document.createElement('div'); t.className = 'title';
    t.appendChild(editCell(prod.header, v => prod.header = v, { readonly: true }));
    if (unmatched.length) {
      const badge = document.createElement('span'); badge.className = 'unmatched-badge';
      badge.textContent = `미분류 ${unmatched.length}`;
      badge.title = '카테고리 소분류에 매칭되지 않은 보장 — 카테고리 섹션에서 "보장명 행 추가"로 매칭 가능';
      head.appendChild(t); head.appendChild(badge);
    } else {
      head.appendChild(t);
    }
    card.appendChild(head);

    const body = document.createElement('div'); body.className = 'product-body';
    if (!prod.coverages.length) {
      const e = document.createElement('div'); e.className = 'empty-sub'; e.textContent = '상품의 보장 목록이 없어요';
      body.appendChild(e);
    } else {
      body.appendChild(renderCoverageTable(prod.coverages, prod, false));
    }
    card.appendChild(body); s.appendChild(card);
  });
  return s;
}

// --- 상품별 보장 목록 통합 뷰 ---
function renderProductsMerged() {
  const controls = document.createElement('div'); controls.className = 'section-controls';
  const backBtn = document.createElement('button'); backBtn.className = 'btn small';
  backBtn.textContent = '◀ 개별 뷰';
  backBtn.onclick = () => { state.mergedView = false; render(); };
  controls.appendChild(backBtn);

  const s = section('상품별 보장 목록 (통합)', `${state.products.length}개 상품 통합`, controls);

  // Flatten with `source` column
  const allRows = [];
  state.products.forEach(p => p.coverages.forEach(c => allRows.push({ __source: p.header, __prod: p, ...c })));
  s.appendChild(renderCoverageTable(allRows, null, true));
  return s;
}

function renderCoverageTable(rows, owner, showSource) {
  const wrap = document.createElement('div'); wrap.className = 'grid-wrap';
  const t = document.createElement('table'); t.className = 'tbl coverage-grid';
  const cg = document.createElement('colgroup');
  if (showSource) cg.appendChild(mkCol(220));
  cg.appendChild(mkCol(36));
  SCHEMA.productCoverage.columns.forEach(c => cg.appendChild(mkCol(c.width, c.flex)));
  t.appendChild(cg);

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  if (showSource) hr.appendChild(mkTh('상품'));
  hr.appendChild(mkTh(''));
  SCHEMA.productCoverage.columns.forEach(c => hr.appendChild(mkTh(c.label)));
  thead.appendChild(hr); t.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    if (showSource) { const td = document.createElement('td'); td.textContent = row.__source; td.className = 'source-col'; tr.appendChild(td); }
    if (owner) {
      tr.appendChild(rowActions(row, idx, 'coverage', owner));
    } else {
      tr.appendChild(document.createElement('td'));
    }
    SCHEMA.productCoverage.columns.forEach(c => {
      const td = document.createElement('td');
      // 최초 로드된 행의 라벨성 필드(계약자/대분류/소분류/보장명)는 readonly,
      // 유저 추가 행(__added) 또는 값 필드(amount/term/start/end/contractor)는 편집 가능
      const isLabelField = ['contractor', 'major', 'minor', 'name'].includes(c.key);
      const readonly = isLabelField && !row.__added;
      td.appendChild(editCell(row[c.key] || '', v => { row[c.key] = v; }, { align: c.align, readonly }));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody); wrap.appendChild(t);

  // Add row button
  if (owner) {
    const bar = document.createElement('div'); bar.className = 'row-add-bar';
    const b = document.createElement('button'); b.className = 'btn small';
    b.textContent = '＋ 보장 행 추가';
    b.onclick = () => {
      const blank = { __added: true }; SCHEMA.productCoverage.columns.forEach(c => blank[c.key] = '');
      owner.coverages.push(blank); render();
    };
    bar.appendChild(b); wrap.appendChild(bar);
  }
  return wrap;
}

/** Up/Down / Hide — 삭제 버튼 제거 (데이터 보존, 숨김만 가능) */
function rowActions(row, idx, kind, owner) {
  const td = document.createElement('td'); td.className = 'row-actions';
  const strip = document.createElement('div'); strip.className = 'actions-inline';
  strip.appendChild(mkBtn('▲', () => moveRow(kind, idx, -1, owner)));
  strip.appendChild(mkBtn('▼', () => moveRow(kind, idx, 1, owner)));
  strip.appendChild(mkBtn(row.hidden ? '👁' : '🙈', () => { row.hidden = !row.hidden; render(); }));
  td.appendChild(strip);
  return td;
}
function moveRow(kind, idx, delta, owner) {
  const arr = kind === 'category' ? state.category.rows : owner.coverages;
  const to = idx + delta;
  if (to < 0 || to >= arr.length) return;
  const [item] = arr.splice(idx, 1); arr.splice(to, 0, item);
  render();
}

// ===== 상품(컬럼) 조작 =====
function addProduct() {
  const blank = { userAdded: true, hidden: false };
  SCHEMA.insurance.rows.forEach(f => (blank[f] = ''));
  state.insurance.products.push(blank);
  state.category.productNames.push('');
  state.category.rows.forEach(r => (r.values = r.values || [], r.values.push('')));
  saveSharedState(state);
  render();
}
function moveProduct(idx, delta) {
  const to = idx + delta;
  if (to < 0 || to >= state.insurance.products.length) return;
  const swap = (arr) => { [arr[idx], arr[to]] = [arr[to], arr[idx]]; };
  swap(state.insurance.products);
  swap(state.category.productNames);
  state.category.rows.forEach(r => { if (r.values) swap(r.values); });
  saveSharedState(state);
  render();
}
function toggleProductHidden(idx) {
  const p = state.insurance.products[idx];
  p.hidden = !p.hidden;
  saveSharedState(state);
  render();
}
function mkBtn(text, fn, cls = '') {
  const b = document.createElement('button'); b.className = 'btn icon ' + cls; b.textContent = text;
  b.onclick = fn; return b;
}
function mkCol(w, flex) { const c = document.createElement('col'); c.style.width = (typeof w === 'number' ? w + 'px' : w); if (flex) c.style.minWidth = (typeof w === 'number' ? w + 'px' : w); return c; }
function mkTh(text) { const th = document.createElement('th'); th.textContent = text; return th; }
function textNode(s) { return document.createTextNode(s); }

// ============================================================
// IO
// ============================================================
document.getElementById('loadHtmlBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

const dz = document.getElementById('dropzone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragging'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragging'); handleFiles(e.dataTransfer.files); });

async function handleFiles(files) {
  for (const f of files) {
    const text = await f.text();
    const parsed = parseHtml(text);
    if (parsed) {
      state = parsed; render();
      sourceInfo.textContent = `${f.name}`;
      saveSharedState(state);
      toast('불러왔습니다');
    } else toast('파싱 실패');
  }
}

document.getElementById('pasteBtn').addEventListener('click', async () => {
  openModal('pasteModal'); document.getElementById('pasteArea').value = '';
  if (navigator.clipboard?.readText) {
    try { const t = await navigator.clipboard.readText(); if (t?.trim().startsWith('{')) document.getElementById('pasteArea').value = t; } catch {}
  }
});
document.getElementById('pasteFromClipBtn').addEventListener('click', async () => {
  try { const t = await navigator.clipboard.readText(); document.getElementById('pasteArea').value = t || ''; } catch { toast('권한 거부됨'); }
});
document.getElementById('pasteConfirmBtn').addEventListener('click', () => {
  const text = document.getElementById('pasteArea').value.trim();
  if (!text) return toast('비어있습니다');
  try {
    const data = JSON.parse(text);
    if (data.htmlSnapshot) {
      const parsed = parseHtml(data.htmlSnapshot);
      if (parsed) {
        state = parsed; render(); sourceInfo.textContent = '북마클릿';
        saveSharedState(state);
        closeModals(); toast('가져옴'); return;
      }
    }
    toast('htmlSnapshot 없음 — 북마클릿을 재등록하세요');
  } catch { toast('JSON 형식 오류'); }
});

document.getElementById('saveJsonBtn').addEventListener('click', () => {
  if (!state) return toast('비어있습니다');
  const blob = new Blob([JSON.stringify({ savedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'coverage.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

document.getElementById('loadStateBtn').addEventListener('click', () => document.getElementById('stateInput').click());
document.getElementById('stateInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.state) { state = data.state; render(); toast('상태 복원'); }
  } catch { toast('불러오기 실패'); }
  e.target.value = '';
});

// Bookmarklet
const BOOKMARKLET_SRC = `(function(){
  function build(tbl){
    const trs=[...tbl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr, :scope [role="row"]')].filter(tr=>tr.closest('[role="table"], table')===tbl);
    const grid=[],occ=[];let maxC=0;
    for(let r=0;r<trs.length;r++){
      const cells=[...trs[r].children].filter(n=>/^(TD|TH)$/i.test(n.tagName));
      let c=0;
      for(const cell of cells){
        while(occ[r]&&occ[r][c])c++;
        const rs=Math.max(1,parseInt(cell.getAttribute('rowspan')||cell.getAttribute('aria-rowspan')||'1',10));
        const cs=Math.max(1,parseInt(cell.getAttribute('colspan')||cell.getAttribute('aria-colspan')||'1',10));
        const tx=cell.textContent.replace(/\\s+/g,' ').trim();
        for(let dr=0;dr<rs;dr++)for(let dc=0;dc<cs;dc++){
          const rr=r+dr,cc=c+dc;
          (grid[rr]=grid[rr]||[])[cc]=(dr===0&&dc===0)?tx:'';
          (occ[rr]=occ[rr]||[])[cc]=true;
          if(cc+1>maxC)maxC=cc+1;
        }
        c+=cs;
      }
    }
    for(let r=0;r<grid.length;r++){grid[r]=grid[r]||[];for(let c=0;c<maxC;c++)if(grid[r][c]==null)grid[r][c]='';}
    return grid;
  }
  const tables=[];
  document.querySelectorAll('[role="table"], table').forEach((tbl,idx)=>{
    const rows=build(tbl); if(rows.length)tables.push({title:'Table '+(idx+1),rows});
  });
  const payload={source:location.href,extractedAt:new Date().toISOString(),tables,htmlSnapshot:document.documentElement.outerHTML};
  const json=JSON.stringify(payload);
  const fb=()=>{const w=window.open('','_blank');if(!w){prompt('Ctrl+C로 복사',json);return;}w.document.write('<title>복사하세요</title><textarea style="width:100%;height:90vh">'+json.replace(/</g,'&lt;')+'</textarea>');};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(()=>alert(tables.length+'개 표 + HTML 스냅샷을 복사했습니다.\\n뷰어의 "📋 클립보드 붙여넣기"를 눌러주세요.'),fb);}else{fb();}
})();`;
const BOOKMARKLET_URL = 'javascript:' + encodeURIComponent(BOOKMARKLET_SRC.replace(/\n\s*/g, ''));
document.getElementById('bookmarkletBtn').addEventListener('click', () => {
  document.getElementById('bmLink').href = BOOKMARKLET_URL;
  document.getElementById('bmCode').value = BOOKMARKLET_URL;
  openModal('bmModal');
});
document.getElementById('bmCopyBtn')?.addEventListener('click', () => {
  const ta = document.getElementById('bmCode'); ta.select(); document.execCommand('copy'); toast('복사됨');
});

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModals();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

// Boot — auto-restore from shared storage so DB tab and editor share state.
(function boot() {
  const shared = loadSharedState();
  if (shared) { state = shared; render(); sourceInfo.textContent = '이전 세션 복원'; }
  else emptyStateEl.style.display = '';
})();

// Save on blur — each cell edit triggers a state save (debounced).
let saveTimer = null;
document.addEventListener('blur', () => {
  if (!state) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSharedState(state), 300);
}, true);
