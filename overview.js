// 전체 보험 한눈에 보기 — 보험 정보 + 소분류 매트릭스
// parser.js 전역 의존: parseHtml, loadSharedState, saveSharedState, uid

let state = null;

const customerHeaderEl = document.getElementById('customerHeader');
const tableWrap = document.getElementById('overviewTable');
const toolbar = document.getElementById('toolbar');
const emptyStateEl = document.getElementById('emptyState');
const statsInfo = document.getElementById('statsInfo');
const toggleHiddenBtn = document.getElementById('toggleHiddenBtn');
const addRowBtn = document.getElementById('addRowBtn');
const toastEl = document.getElementById('toast');

function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); }

// 상단 12행 보험 정보 정의 (label vs key mapping)
// calc: 'paid'/'remaining'/'total' 이면 calculatePayment 결과 사용 (readonly)
const INSURANCE_ROWS = [
  { label: '보험사명', key: '보험사명' },
  { label: '상품명', key: '보험명' },
  { label: '계약일', key: '계약일' },
  { label: '계약자/피보험자', key: '계약자/피보험자' },
  { label: '완납 여부', key: '납입 여부' },
  { label: '납입주기/납입기간', key: '납입주기/납입기간' },
  { label: '보장만기/만기연령', key: '보장만기/만기연령' },
  { label: '납입종료일/종료연령', key: '납입종료일/종료연령' },
  { label: '월납보험료', key: '월납보험료', align: 'right' },
  { label: '기납보험료', key: '기납보험료', align: 'right', calc: 'paid' },
  { label: '잔여보험료', key: '잔여보험료', align: 'right', calc: 'remaining' },
  { label: '총보험료',   key: '총보험료',   align: 'right', calc: 'total' },
];

// ============================================================
// 납입 현황 계산 (index.js 와 동일한 공식)
// ============================================================
function parseMonthlyPremium(str) {
  if (!str) return 0;
  const m = String(str).match(/[\d,]+/);
  if (!m) return 0;
  return parseInt(m[0].replace(/,/g, ''), 10) || 0;
}
function parseIsoDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setHours(0, 0, 0, 0);
  return d;
}
function monthsBetween(a, b) {
  if (!a || !b) return 0;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m--;
  return Math.max(0, m);
}
function yearsBetween(a, b) {
  if (!a || !b) return 0;
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return Math.max(0, y);
}
function extractUnitsFromCycle(cycle, mode) {
  if (!cycle) return null;
  const yearMatch = cycle.match(/(\d+)\s*년/);
  if (yearMatch) {
    const years = +yearMatch[1];
    return mode === 'annual' ? years : years * 12;
  }
  const monthMatch = cycle.match(/(\d+)\s*개월/);
  if (monthMatch) {
    const months = +monthMatch[1];
    return mode === 'annual' ? Math.round(months / 12) : months;
  }
  return null;
}
function extractDateFromField(str) {
  if (!str) return '';
  const m = str.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
function formatCurrency(n) {
  if (n == null || isNaN(n)) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

function calculatePayment(p) {
  const monthly = parseMonthlyPremium(p['월납보험료']);
  const startDate = parseIsoDate((p['계약일'] || '').split(' ')[0]);
  const endDate = parseIsoDate(extractDateFromField(p['납입종료일/종료연령']));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cycle = (p['납입주기/납입기간'] || '').trim();
  const isLumpSum = /일시납/.test(cycle);
  const isAnnual = /연납/.test(cycle);

  if (isLumpSum) {
    const paid = (startDate && today >= startDate);
    return {
      total: monthly, paid: paid ? monthly : 0, remaining: paid ? 0 : monthly,
      valid: monthly > 0,
    };
  }
  if (!monthly || !startDate) return { valid: false };

  let totalUnits;
  if (isAnnual) {
    totalUnits = extractUnitsFromCycle(cycle, 'annual') ?? (endDate ? yearsBetween(startDate, endDate) : null);
  } else {
    totalUnits = extractUnitsFromCycle(cycle, 'monthly') ?? (endDate ? monthsBetween(startDate, endDate) : null);
  }
  if (!totalUnits || totalUnits <= 0) return { valid: false };

  let elapsedUnits;
  if (today < startDate) elapsedUnits = 0;
  else if (isAnnual) elapsedUnits = Math.min(totalUnits, yearsBetween(startDate, today) + 1);
  else elapsedUnits = Math.min(totalUnits, monthsBetween(startDate, today) + 1);
  const remainingUnits = Math.max(0, totalUnits - elapsedUnits);

  return {
    total: monthly * totalUnits,
    paid: monthly * elapsedUnits,
    remaining: monthly * remainingUnits,
    valid: true,
  };
}

// ============================================================
// Core helpers
// ============================================================
function visibleProducts() {
  if (!state?.insurance?.products) return [];
  return state.insurance.products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.hidden || state.insurance?.showHidden);
}
function toggleProductHidden(origIdx) {
  state.insurance.products[origIdx].hidden = !state.insurance.products[origIdx].hidden;
  saveSharedState(state);
  render();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Inline editable span. opts.readonly / opts.cls */
function editable(text, setter, opts = {}) {
  const span = document.createElement('span');
  span.className = 'editable' + (opts.readonly ? ' readonly' : '') + (opts.cls ? ' ' + opts.cls : '');
  if (opts.readonly) {
    span.textContent = text ?? '';
    return span;
  }
  span.contentEditable = 'true';
  span.spellcheck = false;
  span.textContent = text ?? '';
  let original = span.textContent;
  span.addEventListener('focus', () => { original = span.textContent; });
  span.addEventListener('blur', () => {
    const newVal = span.textContent.trim();
    if (newVal === original) return;
    setter(newVal);
    saveSharedState(state);
  });
  span.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); span.blur(); }
    if (e.key === 'Escape') { span.textContent = original; span.blur(); }
  });
  return span;
}

// ============================================================
// Render
// ============================================================
function render() {
  if (!state) { showEmpty(); return; }
  const visible = visibleProducts();
  if (!visible.length) { showEmpty('표시할 보험 상품이 없습니다'); return; }
  emptyStateEl.style.display = 'none';
  toolbar.style.display = '';

  // 1) 구데이터 중복 정리 (같은 minor 여러 행 → 하나로 병합)
  const dedupedCount = deduplicateCategoryRows();
  // 2) 모바일에서 추가된 소분류 자동 매칭 (빈/대시 제외)
  const autoAdded = syncMissingMinorsFromCoverages();
  if (dedupedCount) toast(`중복 ${dedupedCount}개 정리됨`);

  renderCustomerHeader();
  renderToolbar();
  renderMainTable(visible);
}
function showEmpty(msg) {
  customerHeaderEl.innerHTML = '';
  tableWrap.innerHTML = '';
  toolbar.style.display = 'none';
  emptyStateEl.style.display = '';
  if (msg) emptyStateEl.firstChild && (emptyStateEl.textContent = msg);
}

function renderCustomerHeader() {
  const basic = state.basic || {};
  const gender = basic['성별'] || '';
  const ageMatch = (basic['생년월일'] || '').match(/보험나이\s*(\d+)\s*세/);
  const age = ageMatch ? ageMatch[1] : '';
  const birthDate = (basic['생년월일'] || '').split(' ')[0] || '';
  const today = new Date(); const pad = n => String(n).padStart(2, '0');
  const nowStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  const productCount = visibleProducts().length;
  customerHeaderEl.innerHTML = `
    <div class="customer-title">
      <span class="customer-name">고객</span>
      <span class="customer-meta">(${age ? age + '세' : '나이 미상'}${gender ? ', ' + escapeHtml(gender) : ''})</span>
      <span class="customer-suffix">님의 <b>전체 보험 현황</b></span>
    </div>
    <div class="customer-aside">
      <span class="date">${nowStr}</span>
      <span class="stats">상품 ${productCount}개${birthDate ? ' · 생년월일 ' + escapeHtml(birthDate) : ''}</span>
    </div>
  `;
}

function renderToolbar() {
  const hiddenCount = state.category.rows.filter(r => r.hidden).length;
  toggleHiddenBtn.textContent = `숨김 행 ${hiddenCount}개 ${state.category.showHidden ? '숨기기' : '보기'}`;
  toggleHiddenBtn.onclick = () => { state.category.showHidden = !state.category.showHidden; saveSharedState(state); render(); };
  addRowBtn.onclick = addCategoryRow;

  // 숨김 상품 토글
  const productHiddenBtn = document.getElementById('toggleHiddenProductsBtn');
  if (productHiddenBtn) {
    const hiddenProdCount = state.insurance.products.filter(p => p.hidden).length;
    productHiddenBtn.textContent = `👁 숨김 상품 ${hiddenProdCount}개 ${state.insurance.showHidden ? '숨기기' : '보기'}`;
    productHiddenBtn.style.display = hiddenProdCount ? '' : 'none';
    productHiddenBtn.classList.toggle('active', !!state.insurance.showHidden);
    productHiddenBtn.onclick = () => {
      state.insurance.showHidden = !state.insurance.showHidden;
      saveSharedState(state); render();
    };
  }

  // 중복/extra 정리 버튼
  const cleanBtn = document.getElementById('cleanExtraBtn');
  if (cleanBtn) {
    const extraCount = state.category.rows.filter(r => r.extra).length;
    cleanBtn.textContent = `🧹 중복 정리${extraCount ? ' (' + extraCount + ')' : ''}`;
    cleanBtn.disabled = extraCount === 0;
    cleanBtn.onclick = () => {
      if (!confirm(`extra 표시된 행 ${extraCount}개를 제거합니다. 계속하시겠습니까?`)) return;
      state.category.rows = state.category.rows.filter(r => !r.extra);
      saveSharedState(state);
      render();
      toast(`${extraCount}개 정리 완료`);
    };
  }

  const totalRows = state.category.rows.length;
  const visibleCatRows = state.category.rows.filter(r => !r.hidden).length;
  const autoSyncedCount = state.category.rows.filter(r => r.autoSynced).length;
  const extraCount = state.category.rows.filter(r => r.extra).length;
  const totalCoverages = (state.products || []).reduce((s, p) => s + (p.coverages?.length || 0), 0);
  statsInfo.textContent = `소분류 ${visibleCatRows}/${totalRows}행${extraCount ? ' · extra ' + extraCount : ''} · 전체 담보 ${totalCoverages}건`;
}

function renderMainTable(visible) {
  tableWrap.innerHTML = '';
  const t = document.createElement('table'); t.className = 'overview-tbl';

  // colgroup: [label] [합산] [product...] [action]
  const cg = document.createElement('colgroup');
  cg.appendChild(mkCol(190)); // label
  cg.appendChild(mkCol(130)); // 합산
  visible.forEach(() => cg.appendChild(mkCol(165))); // products (날짜+세 한 줄 fit)
  cg.appendChild(mkCol(110)); // action
  t.appendChild(cg);

  // thead: 합산 + 상품 숫자/이름
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(mkTh(''));
  const sumTh = document.createElement('th');
  sumTh.className = 'sum-head';
  sumTh.innerHTML = `<div class="col-num">Σ</div><div class="col-name">합산</div>`;
  hr.appendChild(sumTh);
  visible.forEach(({ p, i: origIdx }, i) => {
    const th = document.createElement('th');
    if (p.hidden) th.classList.add('col-hidden');
    th.innerHTML = `<div class="col-num">${i + 1}</div><div class="col-name">${escapeHtml(p['보험명'] || '(새 보험)')}</div>`;
    // 숨김 버튼 — 보험번호 옆
    const hideBtn = document.createElement('button');
    hideBtn.className = 'col-hide-btn' + (p.hidden ? ' is-hidden' : '');
    hideBtn.title = p.hidden ? '다시 표시' : '이 상품 숨기기';
    hideBtn.textContent = p.hidden ? '👁' : '🙈';
    hideBtn.onclick = (e) => { e.stopPropagation(); toggleProductHidden(origIdx); };
    th.appendChild(hideBtn);
    hr.appendChild(th);
  });
  hr.appendChild(mkTh(''));
  thead.appendChild(hr); t.appendChild(thead);

  const tbody = document.createElement('tbody');

  // ==== 상단 보험 정보 12행 ====
  INSURANCE_ROWS.forEach(def => {
    const tr = document.createElement('tr'); tr.className = 'ins-row';
    const th = document.createElement('th'); th.className = 'row-label';
    th.textContent = def.label;
    if (def.calc) th.classList.add('calc-label');
    tr.appendChild(th);

    // 합산 셀 (숫자 금액 행일 때만 실제 합계) — 숨김 상품은 제외
    const sumTd = document.createElement('td'); sumTd.className = 'sum-cell';
    if (def.calc || def.key === '월납보험료') {
      let totalWon = 0; let anyValid = false;
      visible.forEach(({ p }) => {
        if (p.hidden) return;
        if (def.calc) {
          const info = calculatePayment(p);
          if (info.valid) { totalWon += info[def.calc] || 0; anyValid = true; }
        } else {
          const n = extractNumber(p[def.key]);
          if (n != null) { totalWon += n; anyValid = true; }
        }
      });
      if (anyValid) {
        const s = document.createElement('span');
        s.className = 'sum-value ' + (def.calc === 'paid' ? 'paid' : def.calc === 'remaining' ? 'remaining' : 'total');
        s.textContent = totalWon.toLocaleString() + '원';
        sumTd.appendChild(s);
      } else sumTd.textContent = '-';
    } else {
      sumTd.textContent = '-';
    }
    tr.appendChild(sumTd);

    visible.forEach(({ p }) => {
      const td = document.createElement('td');
      if (def.align === 'right') td.classList.add('align-right');
      if (p.hidden) td.classList.add('col-hidden');
      if (def.calc) {
        td.classList.add('calc-cell');
        const info = calculatePayment(p);
        if (info.valid) {
          const val = info[def.calc];
          const span = document.createElement('span');
          span.className = 'calc-value ' + (def.calc === 'paid' ? 'paid' : def.calc === 'remaining' ? 'remaining' : 'total');
          span.textContent = formatCurrency(val);
          td.appendChild(span);
        } else {
          const fallback = (p[def.key] || '').trim();
          const span = document.createElement('span');
          span.className = 'calc-fallback';
          span.textContent = fallback || '-';
          span.title = '계산 불가 — 월납/계약일/납입주기/납입종료일 확인 필요';
          td.appendChild(span);
        }
      } else if (def.key === '월납보험료') {
        td.appendChild(editableAmount(p[def.key] || '', v => { p[def.key] = v; saveSharedState(state); }, { unit: '원', cls: 'strong primary' }));
      } else if (def.key === '계약일') {
        td.appendChild(editableDate(p[def.key] || '', v => { p[def.key] = v; saveSharedState(state); render(); }));
      } else if (def.key === '납입주기/납입기간') {
        td.appendChild(editableCyclePeriod(p[def.key] || '', (cycle, years, months) => {
          if (cycle === '일시납') p[def.key] = '일시납 / -';
          else if (months) p[def.key] = `${cycle} / ${months}개월`;
          else if (years) p[def.key] = `${cycle} / ${years}년`;
          else p[def.key] = `${cycle} / -`;
          saveSharedState(state); render();
        }));
      } else if (def.key === '보장만기/만기연령' || def.key === '납입종료일/종료연령') {
        td.appendChild(editableDateAge(p[def.key] || '', (date, age) => {
          const d = date || '-', a = age || '-';
          p[def.key] = (d === '-' && a === '-') ? '- / -' : `${d} / ${a} 세`;
          saveSharedState(state); render();
        }));
      } else {
        td.appendChild(editable(p[def.key] || '', v => p[def.key] = v, {
          cls: def.align === 'right' ? 'num' : '',
        }));
      }
      tr.appendChild(td);
    });
    tr.appendChild(document.createElement('td'));
    tbody.appendChild(tr);
  });

  // ==== Spacer + "소분류" 섹션 헤더 (합산 포함) ====
  tbody.appendChild(spacerRow(visible.length + 3));
  const sh = document.createElement('tr'); sh.className = 'section-header';
  const sht = document.createElement('th'); sht.className = 'row-label section-label'; sht.textContent = '소분류';
  sh.appendChild(sht);
  sh.appendChild(document.createElement('th')); // 합산 헤더 자리
  visible.forEach(() => sh.appendChild(document.createElement('th')));
  sh.appendChild(document.createElement('th'));
  tbody.appendChild(sh);

  // ==== 카테고리 행 (대분류 그룹 사이 spacer) ====
  const visibleCatRows = state.category.rows.filter(r => !r.hidden || state.category.showHidden);
  const groups = groupByMajor(visibleCatRows);
  groups.forEach((g, gi) => {
    g.rows.forEach(row => { tbody.appendChild(renderCategoryRow(row, visible)); });
    if (gi < groups.length - 1) tbody.appendChild(spacerRow(visible.length + 3));
  });

  t.appendChild(tbody);
  tableWrap.appendChild(t);
}

function renderCategoryRow(row, visible) {
  const tr = document.createElement('tr');
  tr.className = 'cat-row' + (row.hidden ? ' row-hidden' : '') + (row.extra ? ' user-added' : '');
  tr.dataset.id = row.id;

  const th = document.createElement('th'); th.className = 'row-label minor-label';
  th.appendChild(editable(row.minor || '', v => row.minor = v, { readonly: !row.extra }));
  tr.appendChild(th);

  // 합산 셀 — 숨김 상품 제외하고 소분류 값 합
  const sumTd = document.createElement('td'); sumTd.className = 'sum-cell';
  const rowValues = visible
    .filter(({ p }) => !p.hidden)
    .map(({ i: prodIdx }) => resolveCellValue(row, prodIdx).value);
  const summed = sumAmounts(rowValues);
  if (summed) {
    const s = document.createElement('span');
    s.className = 'sum-value amount-secondary';
    s.textContent = summed;
    sumTd.appendChild(s);
  } else {
    sumTd.textContent = '-';
  }
  tr.appendChild(sumTd);

  visible.forEach(({ p, i: prodIdx }) => {
    const td = document.createElement('td'); td.classList.add('align-right');
    if (p.hidden) td.classList.add('col-hidden');
    const { value, source } = resolveCellValue(row, prodIdx);
    if (source === 'coverage') td.classList.add('from-coverage');
    td.appendChild(editableAmount(value, v => writeCellValue(row, prodIdx, v), { unit: detectUnit(value) || '만원', cls: 'secondary' }));
    tr.appendChild(td);
  });

  const actTd = document.createElement('td'); actTd.className = 'row-actions';
  const strip = document.createElement('div'); strip.className = 'actions-inline';
  strip.appendChild(mkActionBtn('▲', () => moveCategoryRow(row, -1)));
  strip.appendChild(mkActionBtn('▼', () => moveCategoryRow(row, 1)));
  strip.appendChild(mkActionBtn(row.hidden ? '👁' : '🙈', () => {
    row.hidden = !row.hidden; saveSharedState(state); render();
  }));
  actTd.appendChild(strip);
  tr.appendChild(actTd);

  return tr;
}

/** 특정 상품 엔티티(state.products[*])를 찾음 — __productId 바인딩 우선 */
function findProductEntity(prodIdx) {
  const p = state.insurance.products[prodIdx];
  if (!p) return null;
  if (p.__productId) {
    const m = state.products.find(x => x.id === p.__productId);
    if (m) return m;
  }
  const name = (p['보험명'] || '').trim();
  if (!name) return null;
  return state.products.find(x => x.header && x.header.includes(name)) || null;
}

/** 셀 값 해석: 모바일에서 편집한 coverage 우선 → import matrix 폴백 */
function resolveCellValue(row, prodIdx) {
  const entity = findProductEntity(prodIdx);
  if (entity) {
    const minorKey = (row.minor || '').trim();
    const matches = entity.coverages.filter(c => (c.minor || '').trim() === minorKey);
    if (matches.length === 1) {
      return { value: matches[0].amount || '', source: 'coverage' };
    }
    if (matches.length > 1) {
      const amounts = matches.map(c => c.amount).filter(Boolean);
      return { value: amounts.join(' + '), source: 'coverage-multi' };
    }
  }
  return { value: (row.values && row.values[prodIdx]) || '', source: 'matrix' };
}

/** 셀 편집 시 양방향 동기화 — row.values + 매칭되는 유일 coverage */
function writeCellValue(row, prodIdx, newVal) {
  row.values = row.values || [];
  row.values[prodIdx] = newVal;

  const entity = findProductEntity(prodIdx);
  if (entity) {
    const minorKey = (row.minor || '').trim();
    const matches = entity.coverages.filter(c => (c.minor || '').trim() === minorKey);
    if (matches.length === 1) {
      matches[0].amount = newVal; // unique match면 coverage에도 반영
    }
    // multiple matches 는 모호하므로 row.values만 저장
  }
}

/** 구데이터/재파싱으로 생긴 중복 minor 행 통합 — 첫 행에 values 병합 후 제거 */
function deduplicateCategoryRows() {
  if (!state?.category?.rows?.length) return 0;
  const firstByMinor = new Map();
  const toRemoveIds = new Set();
  state.category.rows.forEach(row => {
    const key = (row.minor || '').trim();
    if (!key || key === '-') return; // 빈/대시 minor 는 건드리지 않음
    if (!firstByMinor.has(key)) {
      firstByMinor.set(key, row);
    } else {
      // 중복 → 첫 행의 빈/'-' 슬롯만 duplicate의 유효값으로 채우는 방식으로 병합
      const first = firstByMinor.get(key);
      first.values = first.values || [];
      (row.values || []).forEach((v, i) => {
        if (!v || v === '-') return;
        const existing = first.values[i];
        if (!existing || existing === '-') first.values[i] = v;
      });
      // 첫 행이 seed(extra=false)가 아닌데 중복된 행이 seed면 seed를 우선
      if (row.extra === false && first.extra === true) {
        // 첫 행의 데이터를 seed로 옮기는 대신 간단히 first 업데이트
        // (구조상 seed/extra swap보다 first를 "seed-like"로 유지)
      }
      toRemoveIds.add(row.id);
    }
  });
  if (toRemoveIds.size) {
    state.category.rows = state.category.rows.filter(r => !toRemoveIds.has(r.id));
    saveSharedState(state);
  }
  return toRemoveIds.size;
}

/** 모바일에서 추가된 소분류 중 스키마에 없는 것을 자동으로 overview 매트릭스에 추가 */
function syncMissingMinorsFromCoverages() {
  if (!state?.products?.length) return 0;
  const seen = new Set(
    state.category.rows.map(r => (r.minor || '').trim()).filter(Boolean)
  );
  const added = [];
  state.products.forEach(prod => {
    (prod.coverages || []).forEach(c => {
      const m = (c.minor || '').trim();
      // 빈/대시 소분류는 매트릭스 행으로 추가하지 않음 (미분류 보장은 별도 영역에서 확인)
      if (!m || m === '-') return;
      if (!seen.has(m)) {
        seen.add(m);
        added.push({
          id: uid(),
          major: (c.major || '(미분류)').trim(),
          minor: m, total: '',
          values: new Array(state.insurance.products.length).fill(''),
          hidden: false, extra: true, autoSynced: true,
        });
      }
    });
  });
  if (added.length) {
    state.category.rows.push(...added);
    saveSharedState(state);
  }
  return added.length;
}

function spacerRow(colCount) {
  const tr = document.createElement('tr'); tr.className = 'spacer-row';
  const td = document.createElement('td'); td.colSpan = colCount;
  td.style.border = 'none';
  tr.appendChild(td); return tr;
}
function groupByMajor(rows) {
  const groups = []; let last = null;
  rows.forEach(r => {
    const maj = r.major || '(미분류)';
    if (!last || last.major !== maj) { last = { major: maj, rows: [r] }; groups.push(last); }
    else last.rows.push(r);
  });
  return groups;
}
function moveCategoryRow(row, delta) {
  const arr = state.category.rows;
  const idx = arr.findIndex(r => r.id === row.id);
  if (idx < 0) return;
  const to = idx + delta;
  if (to < 0 || to >= arr.length) return;
  const [item] = arr.splice(idx, 1); arr.splice(to, 0, item);
  saveSharedState(state); render();
}
function addCategoryRow() {
  if (!state) { state = emptyState(); }
  state.category.rows.push({
    id: uid(), major: '', minor: '새 소분류', total: '',
    values: new Array(state.insurance.products.length).fill(''),
    hidden: false, extra: true,
  });
  saveSharedState(state); render();
  toast('소분류 추가됨 — 이름과 값을 입력하세요');
}
function mkCol(w) { const c = document.createElement('col'); c.style.width = (typeof w === 'number' ? w + 'px' : w); return c; }
function mkTh(text) { const th = document.createElement('th'); th.textContent = text; return th; }
function mkActionBtn(text, fn) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn icon';
  b.textContent = text; b.onclick = fn; return b;
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

document.getElementById('pasteBtn').addEventListener('click', async () => {
  openModal('pasteModal');
  const ta = document.getElementById('pasteArea');
  ta.value = '';
  let autoFilled = false;
  if (navigator.clipboard?.readText) {
    try {
      const t = await navigator.clipboard.readText();
      if (t?.trim().startsWith('{')) { ta.value = t; autoFilled = true; }
    } catch {}
  }
  setTimeout(() => { ta.focus(); if (autoFilled) ta.select(); }, 50);
  if (!autoFilled) toast('Ctrl+V로 붙여넣으세요');
});
document.getElementById('pasteFromClipBtn').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    document.getElementById('pasteArea').value = t || '';
    toast(t ? '클립보드에서 가져옴' : '클립보드 비어있음');
  } catch { toast('권한 거부 — textarea에 직접 Ctrl+V 하세요'); }
});
document.getElementById('pasteConfirmBtn').addEventListener('click', () => {
  const text = document.getElementById('pasteArea').value.trim();
  if (!text) return toast('비어있습니다 — JSON 붙여넣기 필요');
  if (!text.startsWith('{')) { toast('JSON 형식 아님'); return; }
  let data;
  try { data = JSON.parse(text); }
  catch (e) { toast('JSON 파싱 실패: ' + e.message.slice(0, 40)); return; }
  if (data.htmlSnapshot) {
    const parsed = parseHtml(data.htmlSnapshot);
    if (parsed) {
      state = parsed; saveSharedState(state); render();
      closeModals(); toast('가져옴 · ' + state.insurance.products.length + '개 상품'); return;
    }
    toast('htmlSnapshot 파싱 실패'); return;
  }
  if (Array.isArray(data.tables)) { toast('구형 북마클릿 — 새로 등록 필요'); return; }
  toast('알 수 없는 JSON 형식');
});
document.getElementById('printBtn').onclick = () => window.print();

// ============================================================
// 북마클릿 설치 (overview.html 독립 동작)
// ============================================================
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
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(json).then(()=>alert(tables.length+'개 표 + HTML 스냅샷을 복사했습니다.\\n뷰어의 "📋 붙여넣기" 를 누르세요.'),fb);}else{fb();}
})();`;
const BOOKMARKLET_URL = 'javascript:' + encodeURIComponent(BOOKMARKLET_SRC.replace(/\n\s*/g, ''));

document.getElementById('bookmarkletBtn')?.addEventListener('click', () => {
  const link = document.getElementById('bmLink');
  const code = document.getElementById('bmCode');
  if (link) link.href = BOOKMARKLET_URL;
  if (code) code.value = BOOKMARKLET_URL;
  openModal('bmModal');
});
document.getElementById('bmCopyBtn')?.addEventListener('click', () => {
  const ta = document.getElementById('bmCode');
  if (!ta) return;
  ta.select(); document.execCommand('copy'); toast('복사됨');
});

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModals();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

// storage 이벤트로 다른 페이지 수정 자동 반영
window.addEventListener('storage', e => {
  if (e.key !== 'coverageDbState') return;
  const s = loadSharedState();
  if (s) { state = s; render(); toast('다른 페이지 변경 반영'); }
});

// Boot
(function boot() {
  const s = loadSharedState();
  if (s) { state = s; render(); }
  else showEmpty();
})();
