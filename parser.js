// Shared parser: used by editor (app.js) and DB viewer (db.js).
// Depends on: window.SCHEMA from schema.js

window.uid = function uid() { return 'r' + Math.random().toString(36).slice(2, 9); };

window.emptyState = function emptyState() {
  return {
    basic: Object.fromEntries(SCHEMA.basic.fields.map(f => [f, ''])),
    insurance: {
      summary: { count: '', monthly: '', paid: '', remain: '', total: '' },
      products: [],
    },
    category: {
      rows: SCHEMA.category.seeds.map(([major, minor]) => ({
        id: uid(), major, minor, values: [], hidden: false,
      })),
      productNames: [],
    },
    products: [],
    mergedView: false,
  };
};

window.buildGrid = function buildGrid(tableEl) {
  const trs = [...tableEl.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr, :scope [role="row"]')]
    .filter(tr => tr.closest('[role="table"], table') === tableEl);
  const grid = [], occupied = [];
  let maxCols = 0;
  for (let r = 0; r < trs.length; r++) {
    const cells = [...trs[r].children].filter(n => /^(TD|TH)$/i.test(n.tagName));
    let c = 0;
    for (const cell of cells) {
      while (occupied[r]?.[c]) c++;
      const rs = Math.max(1, parseInt(cell.getAttribute('rowspan') || cell.getAttribute('aria-rowspan') || '1', 10));
      const cs = Math.max(1, parseInt(cell.getAttribute('colspan') || cell.getAttribute('aria-colspan') || '1', 10));
      const text = cell.textContent.replace(/\s+/g, ' ').trim();
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        const rr = r + dr, cc = c + dc;
        (grid[rr] = grid[rr] || [])[cc] = (dr === 0 && dc === 0) ? text : '';
        (occupied[rr] = occupied[rr] || [])[cc] = true;
        if (cc + 1 > maxCols) maxCols = cc + 1;
      }
      c += cs;
    }
  }
  for (let r = 0; r < grid.length; r++) {
    grid[r] = grid[r] || [];
    for (let c = 0; c < maxCols; c++) if (grid[r][c] == null) grid[r][c] = '';
  }
  return { grid, rows: grid.length, cols: maxCols };
};

window.parseSummaryText = function parseSummaryText(txt) {
  if (!txt) return {};
  const m = (re) => { const x = txt.match(re); return x ? x[1] : ''; };
  return {
    count: m(/보험\s*개수\s*([\d,]+)\s*개/),
    monthly: m(/월납\s*보험료\s*합계\s*([\d,]+)\s*원/),
    paid: m(/기납\s*보험료\s*합계\s*([\d,]+)\s*원/),
    remain: m(/잔여\s*보험료\s*합계\s*([\d,]+)\s*원/),
    total: m(/총\s*보험료\s*합계\s*([\d,]+)\s*원/),
  };
};

window.findProductHeader = function findProductHeader(tbl) {
  let cur = tbl;
  for (let d = 0; d < 8; d++) {
    cur = cur.parentElement; if (!cur) break;
    let prev = cur.previousElementSibling; const parts = []; let n = 0;
    while (prev && n < 3) {
      const t = prev.textContent.replace(/\s+/g, ' ').trim();
      if (t && t.length < 200) parts.unshift(t);
      prev = prev.previousElementSibling; n++;
    }
    const joined = parts.join(' | ');
    if (/보험/.test(joined) && !/상품 ?별 ?보장 ?목록/.test(joined) && joined.length > 5) return joined;
  }
  return '';
};

window.parseHtml = function parseHtml(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const tables = [...doc.querySelectorAll('[role="table"], table')];
  if (!tables.length) return null;

  const headingTexts = ['기본정보', '가입보험 상세정보', '카테고리별 상세정보', '상품 별 보장 목록', '상품별 보장 목록'];
  const headings = [];
  doc.querySelectorAll('div,span,h1,h2,h3,h4').forEach(el => {
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (headingTexts.includes(t)) headings.push({ text: t, node: el });
  });
  function sectionFor(tbl) {
    // 1) heading이 table 내부(descendant)인 경우: 해당 table이 이 섹션
    for (const h of headings) {
      if (tbl.contains(h.node)) return h.text;
    }
    // 2) heading이 table 앞에 위치(문서 순서)인 경우: 가장 가까운 heading의 섹션
    let chosen = null;
    for (const h of headings) {
      const pos = h.node.compareDocumentPosition(tbl);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) chosen = h;
    }
    return chosen?.text || '기타';
  }
  const grouped = {};
  tables.forEach(tbl => (grouped[sectionFor(tbl)] = grouped[sectionFor(tbl)] || []).push(tbl));

  const s = emptyState();

  if (grouped['기본정보']) {
    const g = buildGrid(grouped['기본정보'][0]);
    for (let r = 0; r < g.rows; r++) {
      const row = g.grid[r];
      for (let c = 0; c + 1 < row.length; c += 2) {
        const key = row[c], val = row[c + 1];
        if (SCHEMA.basic.fields.includes(key)) s.basic[key] = val;
      }
    }
  }

  if (grouped['가입보험 상세정보']) {
    const g = buildGrid(grouped['가입보험 상세정보'][0]);
    let startCol = 0;
    const firstCell = g.grid[0]?.[0] || '';
    if (/합계|개수/.test(firstCell)) {
      s.insurance.summary = parseSummaryText(firstCell);
      startCol = 1;
    }
    const row0 = g.grid[0].slice(startCol);
    const productNames = row0.slice(1);
    s.insurance.products = productNames.map(name => {
      const p = {}; SCHEMA.insurance.rows.forEach(f => (p[f] = ''));
      p['보험명'] = name;
      return p;
    });
    for (let r = 1; r < g.rows; r++) {
      const row = g.grid[r].slice(startCol);
      const label = row[0];
      if (!SCHEMA.insurance.rows.includes(label)) continue;
      row.slice(1).forEach((v, i) => { if (s.insurance.products[i]) s.insurance.products[i][label] = v; });
    }
    s.category.productNames = productNames.slice();
  }

  if (grouped['카테고리별 상세정보']) {
    const parts = grouped['카테고리별 상세정보'].map(buildGrid);
    const allRows = [];
    let lastMajor = ''; // rowspan으로 병합된 대분류 상속
    for (let p = 0; p < parts.length; p++) {
      const g = parts[p];
      const startR = (p === 0) ? 1 : 0;
      for (let r = startR; r < g.rows; r++) {
        const row = g.grid[r];
        const major = row[0] || lastMajor;
        if (row[0]) lastMajor = row[0];
        allRows.push({ major, minor: row[1] || '', total: row[2] || '', values: row.slice(3) });
      }
    }
    const parsedMap = new Map(allRows.map(r => [r.major + '|' + r.minor, r]));
    s.category.rows.forEach(schemaRow => {
      const match = parsedMap.get(schemaRow.major + '|' + schemaRow.minor);
      if (match) {
        schemaRow.values = match.values.slice();
        schemaRow.total = match.total;
        parsedMap.delete(schemaRow.major + '|' + schemaRow.minor);
      } else {
        schemaRow.values = []; schemaRow.total = '';
      }
    });
    for (const extra of parsedMap.values()) {
      s.category.rows.push({
        id: uid(), major: extra.major, minor: extra.minor,
        total: extra.total, values: extra.values, hidden: false, extra: true,
      });
    }
  }

  // 3.5) 데이터 정규화 — import 시점부터 분류된 형식으로 저장
  normalizeInsuranceData(s);

  const productKey = grouped['상품 별 보장 목록'] ? '상품 별 보장 목록' : grouped['상품별 보장 목록'] ? '상품별 보장 목록' : null;
  if (productKey) {
    grouped[productKey].forEach(tbl => {
      const g = buildGrid(tbl);
      if (g.rows < 2) return;
      const coverages = [];
      for (let r = 1; r < g.rows; r++) {
        const row = g.grid[r];
        coverages.push({
          contractor: row[0] || '', major: row[1] || '', minor: row[2] || '',
          name: row[3] || '', amount: row[4] || '', term: row[5] || '',
          start: row[6] || '', end: row[7] || '',
        });
      }
      const header = findProductHeader(tbl);
      s.products.push({ id: uid(), header: header || '(상품명 미상)', coverages });
    });
  }
  return s;
};

/** Save/load shared state to localStorage for cross-page sync. */
window.saveSharedState = function saveSharedState(state) {
  try { localStorage.setItem('coverageDbState', JSON.stringify({ savedAt: Date.now(), state })); } catch {}
};
window.loadSharedState = function loadSharedState() {
  try {
    const raw = localStorage.getItem('coverageDbState');
    if (!raw) return null;
    return JSON.parse(raw).state;
  } catch { return null; }
};

/** Parse amount strings like "10 만원", "3,000만원", "10,000 원" to a number in 원. */
window.parseAmount = function parseAmount(s) {
  if (!s) return null;
  const clean = String(s).replace(/[^\d만원,]/g, '').replace(/,/g, '');
  const num = parseInt(clean.replace(/[만원]/g, ''), 10);
  if (isNaN(num)) return null;
  if (/만원/.test(s)) return num * 10000;
  return num;
};
/**
 * 숫자만 편집되는 금액 셀. 단위(만원/원)는 고정 suffix 로 표시.
 * opts: { unit?, cls?, readonly? }  (unit 미지정 시 text 에서 자동 탐지, 없으면 '원')
 */
window.detectUnit = function detectUnit(text) {
  if (!text) return null;
  const s = String(text).trim();
  if (/만원$/.test(s)) return '만원';
  if (/원$/.test(s)) return '원';
  return null;
};
window.extractNumber = function extractNumber(text) {
  if (!text) return null;
  const m = String(text).match(/[\d,]+/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
};
window.editableAmount = function editableAmount(text, setter, opts = {}) {
  const unit = opts.unit || detectUnit(text) || '원';
  const num = extractNumber(text);

  const wrap = document.createElement('span');
  wrap.className = 'editable-amount' + (opts.cls ? ' ' + opts.cls : '') + (opts.readonly ? ' readonly' : '');

  const numSpan = document.createElement('span');
  numSpan.className = 'ea-num';
  if (!opts.readonly) {
    numSpan.contentEditable = 'true';
    numSpan.spellcheck = false;
  }
  numSpan.textContent = num != null ? num.toLocaleString() : '';

  const unitSpan = document.createElement('span');
  unitSpan.className = 'ea-unit';
  unitSpan.textContent = unit;

  if (!opts.readonly) {
    let original = numSpan.textContent;
    numSpan.addEventListener('focus', () => { original = numSpan.textContent; });
    numSpan.addEventListener('blur', () => {
      const raw = numSpan.textContent.replace(/[^\d]/g, '');
      if (!raw) {
        numSpan.textContent = '';
        setter('');
        return;
      }
      const n = parseInt(raw, 10);
      const display = n.toLocaleString();
      numSpan.textContent = display;
      setter(`${display} ${unit}`);
    });
    numSpan.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); numSpan.blur(); return; }
      if (e.key === 'Escape') { numSpan.textContent = original; numSpan.blur(); return; }
      const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
      if (allowed.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (!/^[\d,]$/.test(e.key)) e.preventDefault();
    });
    numSpan.addEventListener('paste', e => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text');
      const clean = t.replace(/[^\d]/g, '');
      if (clean) document.execCommand('insertText', false, parseInt(clean, 10).toLocaleString());
    });
  }

  wrap.appendChild(numSpan);
  wrap.appendChild(unitSpan);
  return wrap;
};

/**
 * 한 행의 상품별 값을 합산. 만원/원 혼합도 처리 — 모두 원 단위로 정규화 후 표시.
 * values: string[] 또는 () => string 배열
 * 반환: 합산 문자열 (예: "13,000만원", "27,000원"), null if nothing
 */
window.sumAmounts = function sumAmounts(values) {
  let totalWon = 0;
  let anyValid = false;
  let allManwon = true;
  values.forEach(text => {
    if (!text || text === '-') return;
    const n = extractNumber(text);
    if (n == null) return;
    anyValid = true;
    if (/만원/.test(String(text))) {
      totalWon += n * 10000;
    } else {
      totalWon += n;
      allManwon = false;
    }
  });
  if (!anyValid) return null;
  if (allManwon) return (totalWon / 10000).toLocaleString() + '만원';
  return totalWon.toLocaleString() + '원';
};

/**
 * 날짜 입력 — 텍스트 기반 YYYY-MM-DD 강제 (네이티브 달력/팝업 없음)
 * · 숫자만 입력 허용, 4자리 → 자동 하이픈 → 8자리까지
 * · Blur 시 형식 검증 (유효 날짜면 setter, 아니면 빈 값)
 */
window.editableDate = function editableDate(text, setter) {
  const wrap = document.createElement('span');
  wrap.className = 'editable-date';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'YYYY-MM-DD';
  input.maxLength = 10;
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const m = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) input.value = `${m[1]}-${m[2]}-${m[3]}`;

  const formatDigits = (digits) => {
    const d = digits.slice(0, 8);
    if (d.length <= 4) return d;
    if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
    return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  };

  input.addEventListener('input', () => {
    const digits = input.value.replace(/[^\d]/g, '');
    input.value = formatDigits(digits);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); return; }
    if (e.key === 'Escape') { input.value = m ? `${m[1]}-${m[2]}-${m[3]}` : ''; input.blur(); return; }
    const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
  });
  input.addEventListener('paste', e => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text');
    const digits = String(t).replace(/[^\d]/g, '');
    document.execCommand('insertText', false, formatDigits(digits));
  });
  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (v === '') { setter(''); return; }
    const valid = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (valid) {
      // 범위 간단 체크 (월 1~12, 일 1~31)
      const mm = +valid[2], dd = +valid[3];
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
        input.value = ''; setter(''); return;
      }
      setter(v);
    } else {
      input.value = ''; setter('');
    }
  });
  wrap.appendChild(input);
  return wrap;
};

/**
 * 드롭다운 선택 — options 중 하나를 고정
 */
window.editableSelect = function editableSelect(value, setter, options) {
  const sel = document.createElement('select');
  sel.className = 'editable-select';
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => setter(sel.value));
  return sel;
};

/**
 * 숫자 + 고정 단위 (년/세/개월). editableAmount 의 간소화 버전.
 */
window.editableUnit = function editableUnit(text, setter, unit, opts = {}) {
  const num = extractNumber(text);
  const wrap = document.createElement('span');
  wrap.className = 'editable-amount editable-unit' + (opts.cls ? ' ' + opts.cls : '');
  const numSpan = document.createElement('span');
  numSpan.className = 'ea-num';
  numSpan.contentEditable = 'true';
  numSpan.spellcheck = false;
  numSpan.textContent = num != null ? String(num) : '';
  const unitSpan = document.createElement('span');
  unitSpan.className = 'ea-unit';
  unitSpan.textContent = unit;

  let original = numSpan.textContent;
  numSpan.addEventListener('focus', () => { original = numSpan.textContent; });
  numSpan.addEventListener('blur', () => {
    const raw = numSpan.textContent.replace(/[^\d]/g, '');
    if (!raw) { numSpan.textContent = ''; setter(''); return; }
    const n = parseInt(raw, 10);
    numSpan.textContent = String(n);
    setter(String(n) + unit);
  });
  numSpan.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); numSpan.blur(); return; }
    if (e.key === 'Escape') { numSpan.textContent = original; numSpan.blur(); return; }
    const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
  });
  wrap.appendChild(numSpan);
  wrap.appendChild(unitSpan);
  return wrap;
};

/**
 * "YYYY-MM-DD / NN 세" 복합 필드 에디터
 * writer(date, age) 로 원본 형식 재조립
 */
window.editableDateAge = function editableDateAge(text, writer) {
  const wrap = document.createElement('span');
  wrap.className = 'editable-composite';
  const dateStr = (String(text||'').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
  const ageStr = (String(text||'').match(/(\d+)\s*세/) || [])[1] || '';

  const dateEl = editableDate(dateStr, v => writer(v, ageStr));
  const sep = document.createElement('span'); sep.className = 'ea-sep'; sep.textContent = ' / ';
  const ageEl = editableUnit(ageStr, v => {
    const n = (v.match(/\d+/)||[])[0] || '';
    writer(dateStr, n);
  }, '세');
  wrap.appendChild(dateEl); wrap.appendChild(sep); wrap.appendChild(ageEl);
  return wrap;
};

/**
 * "월납/연납/일시납 / N년" 복합 필드 에디터
 * writer(cycle, years) 로 재조립 (일시납이면 '일시납 / -')
 */
window.editableCyclePeriod = function editableCyclePeriod(text, writer) {
  const wrap = document.createElement('span');
  wrap.className = 'editable-composite';
  const cycleStr = (String(text||'').match(/(월납|연납|일시납)/) || [])[1] || '월납';
  const yearStr = (String(text||'').match(/(\d+)\s*년/) || [])[1] || '';
  const monthStr = (String(text||'').match(/(\d+)\s*개월/) || [])[1] || '';

  const sel = editableSelect(cycleStr, v => writer(v, yearStr, monthStr), ['월납','연납','일시납']);
  const sep = document.createElement('span'); sep.className = 'ea-sep'; sep.textContent = ' / ';
  wrap.appendChild(sel); wrap.appendChild(sep);

  if (cycleStr === '일시납') {
    const dash = document.createElement('span'); dash.className = 'ea-dash'; dash.textContent = '-';
    wrap.appendChild(dash);
  } else {
    const yearEl = editableUnit(yearStr, v => {
      const n = (v.match(/\d+/)||[])[0] || '';
      writer(cycleStr, n, '');
    }, '년');
    wrap.appendChild(yearEl);
  }
  return wrap;
};

/**
 * import 시점의 데이터 정규화 — 모든 필드를 편집기 헬퍼가 기대하는 형식으로 통일
 * · 날짜: YYYY-MM-DD
 * · 납입주기/납입기간: "월납 / N년" | "연납 / N년" | "일시납 / -"
 * · 보장만기/만기연령, 납입종료일/종료연령: "YYYY-MM-DD / NN 세"
 * · 월납/기납/잔여/총 보험료: "N,NNN 원" (쉼표 포함)
 */
window.normalizeInsuranceData = function normalizeInsuranceData(s) {
  if (!s?.insurance?.products) return;
  s.insurance.products.forEach(p => {
    // 계약일 — 날짜부분만 남김
    const ctrlDate = (String(p['계약일']||'').match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (ctrlDate) p['계약일'] = ctrlDate;

    // 납입주기/납입기간 정규화
    const cycleText = String(p['납입주기/납입기간']||'');
    const cycleMatch = cycleText.match(/(월납|연납|일시납)/);
    const yearMatch = cycleText.match(/(\d+)\s*년/);
    const monthMatch = cycleText.match(/(\d+)\s*개월/);
    if (cycleMatch) {
      const cycle = cycleMatch[1];
      if (cycle === '일시납') p['납입주기/납입기간'] = '일시납 / -';
      else if (monthMatch) p['납입주기/납입기간'] = `${cycle} / ${monthMatch[1]}개월`;
      else if (yearMatch) p['납입주기/납입기간'] = `${cycle} / ${yearMatch[1]}년`;
    }

    // 보장만기/만기연령 · 납입종료일/종료연령 정규화
    ['보장만기/만기연령', '납입종료일/종료연령'].forEach(k => {
      const t = String(p[k]||'');
      const d = (t.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
      const a = (t.match(/(\d+)\s*세/) || [])[1] || '';
      if (d || a) {
        p[k] = (d && a) ? `${d} / ${a} 세`
             : d ? `${d} / -`
             : `- / ${a} 세`;
      }
    });

    // 보험료 필드: 공백 정리 ("* 6,480 원" → "* 6,480 원" 그대로 유지)
    // editableAmount 가 숫자만 뽑아쓰므로 별도 변환 불필요
  });

  // 생년월일 정규화 — "2003-02-08 (보험나이 23세)"
  if (s.basic) {
    const bd = String(s.basic['생년월일']||'');
    const d = (bd.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    const a = (bd.match(/보험나이\s*(\d+)/) || [])[1] || '';
    if (d || a) {
      s.basic['생년월일'] = d && a ? `${d} (보험나이 ${a}세)` : (d || bd);
    }
    // 상령일
    const sr = (String(s.basic['상령일']||'').match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (sr) s.basic['상령일'] = sr;
  }
};

window.formatWon = function formatWon(n) {
  if (n == null || isNaN(n)) return '-';
  if (n >= 10000) {
    const manwon = Math.round(n / 10000);
    return manwon.toLocaleString() + '만원';
  }
  return n.toLocaleString() + '원';
};
