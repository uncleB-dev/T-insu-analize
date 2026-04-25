// Design Ref: Plan §3 — 모바일 최적화 상품별 가입담보 상세
// parser.js 전역 의존: parseHtml, loadSharedState, saveSharedState, parseAmount, formatWon

let state = null;
let activeIdx = 0;

const customerHeaderEl = document.getElementById('customerHeader');
const tabBar = document.getElementById('tabBar');
const tabBarWrap = document.getElementById('tabBarWrap');
const panel = document.getElementById('panel');
const emptyStateEl = document.getElementById('emptyState');
const toastEl = document.getElementById('toast');

function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); }

// ============================================================
// State helpers
// ============================================================
function visibleProducts() {
  if (!state?.insurance?.products) return [];
  return state.insurance.products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.hidden || state.insurance?.showHidden);
}
function toggleProductHidden(origIdx) {
  state.insurance.products[origIdx].hidden = !state.insurance.products[origIdx].hidden;
  // 현재 탭이 숨겨진 경우 다음 가시 탭으로
  const newVisible = state.insurance.products
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.hidden || state.insurance?.showHidden);
  if (activeIdx >= newVisible.length) activeIdx = Math.max(0, newVisible.length - 1);
  saveSharedState(state);
  render();
}
function totalCoverageCount() {
  return (state?.products || []).reduce((s, p) => s + (p.coverages?.length || 0), 0);
}

// ============================================================
// Render
// ============================================================
function render() {
  if (!state) { showEmpty(); return; }
  renderHiddenProductsToggle();
  const visible = visibleProducts();
  if (!visible.length) { showEmpty('표시할 상품이 없습니다. 상품을 추가하거나 숨김을 해제하세요.'); return; }
  if (activeIdx >= visible.length) activeIdx = 0;
  emptyStateEl.style.display = 'none';
  renderCustomerHeader();
  tabBarWrap.style.display = '';
  renderTabs(visible);
  renderPanel(visible[activeIdx].p);
}

function renderHiddenProductsToggle() {
  const btn = document.getElementById('toggleHiddenProductsBtn');
  if (!btn || !state?.insurance?.products) return;
  const hiddenCount = state.insurance.products.filter(p => p.hidden).length;
  if (!hiddenCount) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.textContent = `👁 숨김 ${hiddenCount}`;
  btn.classList.toggle('active', !!state.insurance.showHidden);
  btn.onclick = () => { state.insurance.showHidden = !state.insurance.showHidden; saveSharedState(state); render(); };
}
function showEmpty(msg) {
  customerHeaderEl.innerHTML = '';
  tabBar.innerHTML = '';
  tabBarWrap.style.display = 'none';
  panel.innerHTML = '';
  emptyStateEl.style.display = '';
  if (msg) emptyStateEl.textContent = msg;
}

// ----- M2: 고객 요약 헤더 -----
function renderCustomerHeader() {
  const basic = state.basic || {};
  const gender = basic['성별'] || '';
  const age = extractInsuranceAge(basic['생년월일']);
  const birthDate = (basic['생년월일'] || '').split(' ')[0] || '';

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const nowStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} ${pad(today.getHours())}:${pad(today.getMinutes())}`;

  const productCount = visibleProducts().length;
  const coverageCount = totalCoverageCount();

  customerHeaderEl.innerHTML = `
    <div class="customer-title">
      <span class="customer-name">고객</span>
      <span class="customer-meta">(${age ? age + '세' : '나이 미상'}${gender ? ', ' + escapeHtml(gender) : ''})</span>
      <span class="customer-suffix">님의 <b>상품별 가입담보 상세</b></span>
    </div>
    <div class="customer-aside">
      <span class="date">${nowStr}</span>
      <span class="stats">※ 상품 ${productCount}개 · 보장 ${coverageCount}건${birthDate ? ' · 생년월일 ' + escapeHtml(birthDate) : ''}</span>
    </div>
  `;
}

// ----- 탭 -----
function renderTabs(visible) {
  tabBar.innerHTML = '';
  visible.forEach(({ p }, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === activeIdx ? ' active' : '') + (p.userAdded ? ' user-added' : '') + (p.hidden ? ' is-hidden' : '');
    btn.setAttribute('role', 'tab');
    btn.title = p['보험명'] || '(이름 없음)';
    btn.innerHTML = `
      <span class="tab-company">${escapeHtml(p['보험사명'] || '')}</span>
      <span class="tab-name">${escapeHtml(p['보험명'] || '(새 보험)')}</span>
    `;
    btn.onclick = () => { activeIdx = i; render(); scrollTabIntoView(btn); };
    tabBar.appendChild(btn);
  });
  // 탭 끝 "+" 버튼 — 새 보험 추가
  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add'; addBtn.title = '새 보험 추가';
  addBtn.setAttribute('aria-label', '새 보험 추가');
  addBtn.innerHTML = `<span class="tab-add-icon">＋</span><span class="tab-add-label">새 보험</span>`;
  addBtn.onclick = addNewProduct;
  tabBar.appendChild(addBtn);
}
function scrollTabIntoView(btn) {
  const r = btn.getBoundingClientRect();
  const br = tabBar.getBoundingClientRect();
  if (r.left < br.left) tabBar.scrollBy({ left: r.left - br.left - 20, behavior: 'smooth' });
  else if (r.right > br.right) tabBar.scrollBy({ left: r.right - br.right + 20, behavior: 'smooth' });
}

// ----- M3+M4+M5: 상품 패널 -----
function renderPanel(product) {
  panel.innerHTML = '';
  panel.appendChild(renderProductBlock(product));
}
function renderProductBlock(p) {
  const block = document.createElement('section'); block.className = 'product-block';
  block.appendChild(renderBlockHeader(p));    // M3
  block.appendChild(renderSummaryTable(p));   // M4
  block.appendChild(renderPaymentStatus(p));  // M4.5 — 납입 현황 자동 계산
  block.appendChild(renderCoverageTable(p));  // M5
  return block;
}

// ============================================================
// M4.5: 납입 현황 자동 계산
// 입력: 계약일, 월납 보험료, 납입종료일, 오늘 날짜
// 출력: 총 납입 / 현재까지 납입 / 앞으로 납입 + 진행률
// ============================================================
function calculatePayment(p) {
  const monthly = parseMonthlyPremium(p['월납보험료']);
  const startDate = parseIsoDate((p['계약일'] || '').split(' ')[0]);
  const endDate = parseIsoDate(extractDate(p['납입종료일/종료연령']));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cycle = (p['납입주기/납입기간'] || '').trim();
  const isLumpSum = /일시납/.test(cycle);
  const isAnnual = /연납/.test(cycle);
  const isMonthly = /월납/.test(cycle);

  // 일시납: 계약일 이후면 납입 완료로 간주
  if (isLumpSum) {
    const paid = (startDate && today >= startDate);
    return {
      total: monthly, paid: paid ? monthly : 0, remaining: paid ? 0 : monthly,
      totalUnits: 1, elapsedUnits: paid ? 1 : 0, remainingUnits: paid ? 0 : 1,
      unitName: '회', progress: paid ? 100 : 0, valid: monthly > 0, type: '일시납',
    };
  }

  if (!monthly || !startDate) {
    return { valid: false, reason: '데이터 부족 (계약일·월납보험료 중 누락)' };
  }

  // 총 납입 횟수: 주기 문자열 우선 (예: "월납 / 20년" → 240), 실패 시 날짜 차이로 fallback
  let totalUnits, elapsedUnits, unitName;
  if (isAnnual) {
    totalUnits = extractUnitsFromCycle(cycle, 'annual')
      ?? (endDate ? yearsBetween(startDate, endDate) : null);
    unitName = '년';
  } else {
    totalUnits = extractUnitsFromCycle(cycle, 'monthly')
      ?? (endDate ? monthsBetween(startDate, endDate) : null);
    unitName = '개월';
  }
  if (!totalUnits || totalUnits <= 0) {
    return { valid: false, reason: '납입 기간 계산 불가 (납입주기/납입기간·납입종료일 확인 필요)' };
  }

  // 경과 횟수: 계약 당월/당년 포함하므로 +1 (CRM 공식과 일치)
  if (today < startDate) {
    elapsedUnits = 0;
  } else if (isAnnual) {
    elapsedUnits = Math.min(totalUnits, yearsBetween(startDate, today) + 1);
  } else {
    elapsedUnits = Math.min(totalUnits, monthsBetween(startDate, today) + 1);
  }
  const remainingUnits = Math.max(0, totalUnits - elapsedUnits);
  const progress = totalUnits > 0 ? (elapsedUnits / totalUnits) * 100 : 0;

  return {
    total: monthly * totalUnits,
    paid: monthly * elapsedUnits,
    remaining: monthly * remainingUnits,
    totalUnits, elapsedUnits, remainingUnits, unitName, progress,
    valid: true, type: isAnnual ? '연납' : isMonthly ? '월납' : '정기납',
  };
}

// "월납 / 20년" → 240 (월납) / 20 (연납)
// "연납 / 10년" → 10 (연납) / 120 (월납)
// "월납 / 120개월" → 120 (월납)
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

// "* 6,480 원" / "15,000 원" → 6480
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
function formatCurrency(n) {
  if (n == null || isNaN(n)) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

function renderPaymentStatus(p) {
  const info = calculatePayment(p);
  const block = document.createElement('div'); block.className = 'payment-status';

  const head = document.createElement('div'); head.className = 'ps-head';
  head.innerHTML = `<span class="ps-head-title">💰 납입 현황</span>${info.type ? `<span class="ps-head-badge">${info.type}</span>` : ''}<span class="ps-head-today">기준일 ${todayIso()}</span>`;
  block.appendChild(head);

  if (!info.valid) {
    const warn = document.createElement('div'); warn.className = 'ps-warn';
    warn.textContent = info.reason || '납입 현황을 계산할 수 없습니다';
    block.appendChild(warn);
    return block;
  }

  const grid = document.createElement('div'); grid.className = 'ps-grid';
  grid.innerHTML = `
    <div class="ps-item total">
      <div class="ps-label">총 납입 예정</div>
      <div class="ps-value">${formatCurrency(info.total)}</div>
      <div class="ps-sub">${info.totalUnits}${info.unitName}</div>
    </div>
    <div class="ps-item paid">
      <div class="ps-label">현재까지 납입</div>
      <div class="ps-value">${formatCurrency(info.paid)}</div>
      <div class="ps-sub">${info.elapsedUnits}${info.unitName} · ${info.progress.toFixed(1)}%</div>
    </div>
    <div class="ps-item remaining">
      <div class="ps-label">앞으로 납입</div>
      <div class="ps-value">${formatCurrency(info.remaining)}</div>
      <div class="ps-sub">${info.remainingUnits}${info.unitName}</div>
    </div>
  `;
  block.appendChild(grid);

  // 진행률 바
  const bar = document.createElement('div'); bar.className = 'ps-bar';
  bar.innerHTML = `<div class="ps-bar-fill" style="width:${info.progress.toFixed(1)}%"></div>`;
  block.appendChild(bar);

  return block;
}

function todayIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// M3: 상품 블록 헤더 (편집 가능 + 우상단 숨김 버튼)
function renderBlockHeader(p) {
  const head = document.createElement('div'); head.className = 'block-header';
  if (p.hidden) head.classList.add('is-hidden');

  // 우상단 숨김 토글 — 원형 회색 버튼
  const hideBtn = document.createElement('button');
  hideBtn.className = 'block-hide-btn' + (p.hidden ? ' is-hidden' : '');
  hideBtn.title = p.hidden ? '다시 표시' : '이 보험 숨기기';
  hideBtn.textContent = p.hidden ? '○' : '⊖';
  hideBtn.onclick = () => {
    // activeIdx 로 현재 p 의 원본 인덱스 역추적
    const visible = visibleProducts();
    const origIdx = visible[activeIdx]?.i;
    if (origIdx != null) toggleProductHidden(origIdx);
  };
  head.appendChild(hideBtn);

  const insurer = document.createElement('div'); insurer.className = 'insurer';
  insurer.appendChild(editable(p['보험사명'] || '', v => p['보험사명'] = v));
  head.appendChild(insurer);

  const line2 = document.createElement('div'); line2.className = 'product-line';

  const name = document.createElement('div'); name.className = 'product-name';
  name.appendChild(editable(p['보험명'] || '', v => p['보험명'] = v));
  line2.appendChild(name);

  const joinDate = document.createElement('div'); joinDate.className = 'join-date';
  const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '|';
  const lbl = document.createElement('span'); lbl.textContent = ' 가입일자 : ';
  const dateOnly = (p['계약일'] || '').split(' ')[0] || '';
  const dateEditor = editable(dateOnly, v => p['계약일'] = v, { recalc: true, cls: 'strong' });
  joinDate.appendChild(sep); joinDate.appendChild(lbl); joinDate.appendChild(dateEditor);
  line2.appendChild(joinDate);

  head.appendChild(line2);
  return head;
}

// M4: 2×4 요약표 (분류된 입력: 날짜·드롭다운·단위 고정)
function renderSummaryTable(p) {
  const grid = document.createElement('div'); grid.className = 'summary-table';
  const labelCell = (text) => { const el = document.createElement('div'); el.className = 'st-cell st-label'; el.textContent = text; return el; };
  const valCell = () => { const el = document.createElement('div'); el.className = 'st-cell st-value'; return el; };
  const reRender = () => { saveSharedState(state); const y = window.scrollY; render(); window.scrollTo(0, y); };

  // Row 1
  grid.appendChild(labelCell('계약자 / 피보험자'));
  const c1 = valCell();
  c1.appendChild(editable(p['계약자/피보험자'] || '', v => { p['계약자/피보험자'] = v; saveSharedState(state); }));
  grid.appendChild(c1);

  grid.appendChild(labelCell('납입주기 / 납입기간 / 만기'));
  const c2 = valCell();
  // 주기(드롭다운) / 기간(년)
  c2.appendChild(editableCyclePeriod(p['납입주기/납입기간'] || '', (cycle, years, months) => {
    if (cycle === '일시납') p['납입주기/납입기간'] = '일시납 / -';
    else if (months) p['납입주기/납입기간'] = `${cycle} / ${months}개월`;
    else if (years) p['납입주기/납입기간'] = `${cycle} / ${years}년`;
    else p['납입주기/납입기간'] = `${cycle} / -`;
    reRender();
  }));
  const sep2 = document.createElement('span'); sep2.className = 'ea-sep'; sep2.textContent = ' / ';
  c2.appendChild(sep2);
  // 만기연령 (세)
  c2.appendChild(editableUnit(extractAge(p['보장만기/만기연령']) || '', v => {
    const n = (v.match(/\d+/) || [])[0] || '';
    const dateOnly = extractDate(p['보장만기/만기연령']);
    p['보장만기/만기연령'] = dateOnly ? `${dateOnly} / ${n} 세` : (n ? `- / ${n} 세` : '- / -');
    saveSharedState(state);
  }, '세'));
  grid.appendChild(c2);

  // Row 2
  grid.appendChild(labelCell('보험기간'));
  const c3 = valCell();
  // 계약일 (date input)
  c3.appendChild(editableDate((p['계약일'] || '').split(' ')[0], v => {
    p['계약일'] = v; reRender();
  }));
  const sep3 = document.createElement('span'); sep3.className = 'ea-sep'; sep3.textContent = ' ~ ';
  c3.appendChild(sep3);
  // 보장만기 날짜 (date input)
  c3.appendChild(editableDate(extractDate(p['보장만기/만기연령']), v => {
    const age = extractAge(p['보장만기/만기연령']);
    const ageNum = age ? age.replace('세', '') : '';
    p['보장만기/만기연령'] = ageNum ? `${v || '-'} / ${ageNum} 세` : (v || '- / -');
    saveSharedState(state);
  }));
  grid.appendChild(c3);

  grid.appendChild(labelCell('월납 보험료'));
  const c4 = valCell();
  c4.appendChild(editableAmount(p['월납보험료'] || '', v => {
    p['월납보험료'] = v; reRender();
  }, { unit: '원', cls: 'strong primary' }));
  grid.appendChild(c4);

  return grid;
}

// M5: 담보 상세 4컬럼 표 — NO · 회사 담보명 · 소분류 · 가입금액 (편집 가능)
// 회사 담보명에 "갱신" 포함 행 → 옅은 붉은색 배경
function renderCoverageTable(insuranceProduct) {
  const coverages = findCoveragesFor(insuranceProduct);
  const wrap = document.createElement('div'); wrap.className = 'coverage-wrap';

  if (!coverages.length) {
    const empty = document.createElement('div'); empty.className = 'coverage-empty';
    empty.innerHTML = `
      <div>이 상품의 담보 목록이 없습니다.</div>
      <button class="btn small primary coverage-add-btn" type="button">＋ 담보 추가</button>
    `;
    empty.querySelector('button').onclick = addNewCoverage;
    wrap.appendChild(empty);
    return wrap;
  }

  const t = document.createElement('table'); t.className = 'cv-tbl';
  const cg = document.createElement('colgroup');
  // 가입금액 컬럼 폭을 230px 로 확장 — 셀 내부 padding-right: 100px 와 결합해
  // 표는 카드 우측까지 꽉 차되, 숫자/단위만 좌측으로 약 100px 이동
  // (콘텐츠 영역 = 230 - 16(left pad) - 100(right pad) = 114px → "200,000 만원" ~91px 여유)
  cg.innerHTML = `
    <col style="width:60px" />
    <col />
    <col />
    <col style="width:230px" />
  `;
  t.appendChild(cg);
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>NO</th>
    <th>회사 담보명</th>
    <th>소분류</th>
    <th class="align-right">가입금액</th>
  </tr>`;
  t.appendChild(thead);

  const tbody = document.createElement('tbody');
  coverages.forEach((c, i) => {
    const tr = document.createElement('tr');
    // "갱신" 키워드 → 행 배경 옅은 붉은색
    if (/갱신/.test(c.name || '')) tr.classList.add('row-renew');

    const tdNo = document.createElement('td'); tdNo.className = 'no'; tdNo.textContent = String(i + 1);
    tr.appendChild(tdNo);

    // 회사 담보명 — "prefix / detail" 형식에서 detail(슬래시 뒷부분)만 표시
    const tdName = document.createElement('td'); tdName.className = 'name';
    const nameParts = (c.name || '').split(/\s*\/\s*/);
    const namePrefix = (nameParts[0] || '').trim();
    const nameDisplay = nameParts.length > 1 ? nameParts.slice(1).join(' / ').trim() : namePrefix;
    tdName.appendChild(editable(nameDisplay, v => {
      // prefix 가 있으면 그대로 유지, 편집된 값으로 뒤만 교체
      c.name = nameParts.length > 1 ? `${namePrefix} / ${v}` : v;
      if (/갱신/.test(c.name)) tr.classList.add('row-renew');
      else tr.classList.remove('row-renew');
    }));
    tdName.title = c.name || '';
    tr.appendChild(tdName);

    const tdStd = document.createElement('td'); tdStd.className = 'std';
    tdStd.appendChild(editable(c.minor || '', v => c.minor = v));
    tr.appendChild(tdStd);

    const tdAmt = document.createElement('td'); tdAmt.className = 'amount align-right';
    tdAmt.appendChild(editableAmount(c.amount || '', v => {
      c.amount = v; saveSharedState(state);
    }, { unit: detectUnit(c.amount) || '만원', cls: 'secondary' }));
    tr.appendChild(tdAmt);

    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  wrap.appendChild(t);

  // 담보 추가 푸터
  const footer = document.createElement('div'); footer.className = 'coverage-footer';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn small'; addBtn.type = 'button';
  addBtn.textContent = '＋ 담보 추가';
  addBtn.onclick = addNewCoverage;
  footer.appendChild(addBtn);
  wrap.appendChild(footer);

  return wrap;
}
function decorateAmount(text) {
  if (!text || text === '-') return '-';
  if (/^[\d,]+\s*만원$/.test(text)) return `<span class="amount-secondary">${escapeHtml(text)}</span>`;
  if (/^\*?\s*[\d,]+\s*원$/.test(text)) return `<span class="amount-primary">${escapeHtml(text)}</span>`;
  return escapeHtml(text);
}

// Plan R3: product.header 포함 매칭 — 유저 추가 상품은 __productId 로 바인딩
function findCoveragesFor(insuranceProduct) {
  if (!state?.products || !insuranceProduct) return [];
  // 유저 추가 상품: 명시적 ID 바인딩
  if (insuranceProduct.__productId) {
    const m = state.products.find(p => p.id === insuranceProduct.__productId);
    if (m) return m.coverages;
  }
  // 원본 CRM 상품: 이름 서브스트링 매칭
  const name = (insuranceProduct['보험명'] || '').trim();
  if (!name) return [];
  const match = state.products.find(p => p.header && p.header.includes(name));
  return match ? match.coverages : [];
}
function findProductEntityFor(insuranceProduct) {
  if (!state?.products || !insuranceProduct) return null;
  if (insuranceProduct.__productId) {
    const m = state.products.find(p => p.id === insuranceProduct.__productId);
    if (m) return m;
  }
  const name = (insuranceProduct['보험명'] || '').trim();
  if (!name) return null;
  return state.products.find(p => p.header && p.header.includes(name)) || null;
}

// 새 보험 상품 추가 — 같은 양식(빈 값)으로 생성, 활성 탭으로 전환
function addNewProduct() {
  if (!state) {
    state = emptyState();
  }
  const newInsurance = {};
  SCHEMA.insurance.rows.forEach(f => newInsurance[f] = '');
  newInsurance.userAdded = true;
  newInsurance.hidden = false;

  const newProductEntity = {
    id: uid(), header: '', coverages: [], userAdded: true,
  };
  newInsurance.__productId = newProductEntity.id;

  state.insurance.products.push(newInsurance);
  state.category.productNames.push('');
  state.category.rows.forEach(r => { r.values = r.values || []; r.values.push(''); });
  state.products.push(newProductEntity);

  // 새로 추가된 상품을 활성화 (visible 기준 마지막)
  const visible = state.insurance.products.map((p, i) => ({ p, i })).filter(({ p }) => !p.hidden);
  activeIdx = visible.length - 1;

  saveSharedState(state);
  render();
  toast('새 보험이 추가됐습니다 — 정보를 입력하세요');
  // 보험사명 첫 셀에 포커스 힌트
  setTimeout(() => {
    const first = panel.querySelector('.insurer .editable');
    if (first) first.focus();
  }, 50);
}

// 현재 활성 상품에 새 담보 행 추가
function addNewCoverage() {
  const visible = state.insurance.products.map((p, i) => ({ p, i })).filter(({ p }) => !p.hidden);
  if (!visible.length) return;
  const insuranceProduct = visible[activeIdx].p;

  let entity = findProductEntityFor(insuranceProduct);
  if (!entity) {
    // 없으면 즉석 생성 + 바인딩
    entity = { id: uid(), header: insuranceProduct['보험명'] || '', coverages: [], userAdded: true };
    insuranceProduct.__productId = entity.id;
    state.products.push(entity);
  }
  entity.coverages.push({
    contractor: '', major: '', minor: '', name: '', amount: '',
    term: '', start: '', end: '',
  });
  saveSharedState(state);
  render();
  toast('담보 추가됨');
}

// ============================================================
// Utilities
// ============================================================
function extractInsuranceAge(birthStr) {
  if (!birthStr) return '';
  const m = birthStr.match(/보험나이\s*(\d+)\s*세/);
  return m ? m[1] : '';
}
function extractDate(str) {
  if (!str) return '';
  const m = str.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}
function extractAge(str) {
  if (!str) return '';
  const m = str.match(/(\d+)\s*세/);
  return m ? `${m[1]}세` : '';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Inline editable span. Writes back to state via setter, saves to localStorage, optionally re-renders.
 * opts.recalc: 납입 현황 같은 계산값에 영향을 주면 true → render() 호출
 * opts.cls: extra css class
 */
function editable(text, setter, opts = {}) {
  const span = document.createElement('span');
  span.className = 'editable' + (opts.cls ? ' ' + opts.cls : '');
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
    if (opts.recalc) {
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
  });
  span.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); span.blur(); }
    if (e.key === 'Escape') { span.textContent = original; span.blur(); }
  });
  return span;
}

// ============================================================
// IO (loadHtmlBtn 은 헤더에서 제거됨 — 존재 시에만 리스너 부착)
// ============================================================
document.getElementById('loadHtmlBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  const parsed = parseHtml(text);
  if (parsed) { state = parsed; saveSharedState(state); activeIdx = 0; render(); toast('불러왔습니다'); }
  else toast('파싱 실패');
  e.target.value = '';
});

document.getElementById('pasteBtn').addEventListener('click', async () => {
  openModal('pasteModal');
  const ta = document.getElementById('pasteArea');
  ta.value = '';
  // 1) 클립보드 자동 읽기 시도 (file:// 에서는 보통 실패 — 수동 Ctrl+V 대체)
  let autoFilled = false;
  if (navigator.clipboard?.readText) {
    try {
      const t = await navigator.clipboard.readText();
      if (t?.trim().startsWith('{')) { ta.value = t; autoFilled = true; }
    } catch {}
  }
  // 2) 포커스 — 사용자가 바로 Ctrl+V 할 수 있도록
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
  // 진단: 내용이 JSON 형식인가?
  if (!text.startsWith('{')) {
    toast('JSON 형식 아님 (첫 글자: ' + text.slice(0, 20) + '...)');
    return;
  }
  let data;
  try { data = JSON.parse(text); }
  catch (e) { toast('JSON 파싱 실패: ' + e.message.slice(0, 40)); return; }

  if (data.htmlSnapshot) {
    const parsed = parseHtml(data.htmlSnapshot);
    if (parsed) {
      state = parsed; saveSharedState(state); activeIdx = 0; render();
      closeModals(); toast('가져옴 · ' + state.insurance.products.length + '개 상품'); return;
    }
    toast('htmlSnapshot 파싱 실패');
    return;
  }
  // tables 만 있는 구형 JSON 도 최소한 요약 안내
  if (Array.isArray(data.tables)) {
    toast('구형 북마클릿 — 편집기에서 새 북마클릿 복사하세요');
    return;
  }
  toast('알 수 없는 JSON 형식 — htmlSnapshot 필드 필요');
});
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModals();
});

// ============================================================
// 북마클릿 설치 (editor.html 없이 index.html 에서 완결)
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

// Tab arrows + keyboard
document.getElementById('tabLeftBtn').onclick = () => {
  const visible = visibleProducts(); if (!visible.length) return;
  activeIdx = Math.max(0, activeIdx - 1); render();
  const btn = tabBar.children[activeIdx]; if (btn) scrollTabIntoView(btn);
};
document.getElementById('tabRightBtn').onclick = () => {
  const visible = visibleProducts(); if (!visible.length) return;
  activeIdx = Math.min(visible.length - 1, activeIdx + 1); render();
  const btn = tabBar.children[activeIdx]; if (btn) scrollTabIntoView(btn);
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') return closeModals();
  if (e.key === 'ArrowLeft') document.getElementById('tabLeftBtn').click();
  if (e.key === 'ArrowRight') document.getElementById('tabRightBtn').click();
});

// Plan SC-7: storage 이벤트로 편집기 수정값 자동 반영
window.addEventListener('storage', e => {
  if (e.key !== 'coverageDbState') return;
  const s = loadSharedState();
  if (s) { state = s; render(); toast('편집기 변경 반영'); }
});

// 빈 상태에서 "＋ 새 보험부터 시작" 버튼
const emptyAddBtn = document.getElementById('emptyAddBtn');
if (emptyAddBtn) emptyAddBtn.onclick = addNewProduct;

// Boot — Plan SC-2
(function boot() {
  const s = loadSharedState();
  if (s) { state = s; render(); }
  else showEmpty();
})();
