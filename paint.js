// =================================================================
// paint.js — Konva.js 기반 미니멀 그림판
// Design Ref: paint-minimal.plan.md
// Session 1 (M1+M2+M3): boot + Konva Stage + 배경 이미지 + 도구 상태
// (S2: 도구 핸들러, S3: Transformer/Undo/Export)
// =================================================================
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // 1. 캡처 데이터 로드
  // ---------------------------------------------------------------
  const raw = localStorage.getItem('paintCapture');
  const data = raw ? safeParse(raw) : null;

  if (!data || !data.dataURL) {
    showEmptyState();
    return;
  }

  // 소스 정보 표시
  const srcEl = document.getElementById('sourceInfo');
  if (srcEl) {
    const sizeMB = Math.round(((data.dataURL.length * 3) / 4 / 1024 / 1024) * 10) / 10;
    srcEl.textContent = `${data.source || 'capture'} · ${data.w}×${data.h} · ${sizeMB}MB`;
  }

  if (typeof Konva === 'undefined') {
    alert('Konva 라이브러리 로드 실패 — 인터넷 연결을 확인해 주세요.');
    return;
  }

  // ---------------------------------------------------------------
  // 2. 색상 팔레트 정의 (Plan §2.5)
  // ---------------------------------------------------------------
  const PALETTE_FULL = [
    { name: '빨강', c: '#E53935' },
    { name: '주황', c: '#FB8C00' },
    { name: '노랑', c: '#FDD835' },
    { name: '초록', c: '#43A047' },
    { name: '파랑', c: '#1E88E5' },
    { name: '남색', c: '#3949AB' },
    { name: '보라', c: '#8E24AA' },
    { name: '검정', c: '#000000' },
    { name: '흰색', c: '#FFFFFF' },
  ];
  // 형광펜용은 무지개 7색만 (검정/흰색 제외)
  const RAINBOW_COUNT = 7;

  // ---------------------------------------------------------------
  // 3. 상태
  // ---------------------------------------------------------------
  const State = {
    tool: 'select',           // select | line | rect | highlight
    color: '#E53935',         // 현재 선택 색상
  };

  // ---------------------------------------------------------------
  // 4. Konva Stage 초기화
  // Design Ref: §2.3 — bg/draw/ui 3-Layer 구조
  // ---------------------------------------------------------------
  const stageEl = document.getElementById('stage');
  stageEl.style.width = data.w + 'px';
  stageEl.style.height = data.h + 'px';

  const stage = new Konva.Stage({
    container: 'stage',
    width: data.w,
    height: data.h,
  });

  const bgLayer = new Konva.Layer({ listening: false });   // 배경 (선택 불가)
  const drawLayer = new Konva.Layer();                      // 사용자 도형
  const uiLayer = new Konva.Layer();                        // Transformer (S3)
  stage.add(bgLayer);
  stage.add(drawLayer);
  stage.add(uiLayer);

  // 배경 이미지 로드
  const bgImg = new Image();
  bgImg.onload = () => {
    const node = new Konva.Image({
      image: bgImg,
      width: data.w,
      height: data.h,
      name: 'background',
      listening: false,
    });
    bgLayer.add(node);
    bgLayer.draw();
    fitStageToWindow();
    toast('이미지 준비 완료');
  };
  bgImg.onerror = () => {
    alert('배경 이미지 로드 실패');
  };
  bgImg.src = data.dataURL;

  // 화면맞춤 — 큰 캡처 이미지를 viewport에 맞게 축소
  function fitStageToWindow() {
    const wrap = document.getElementById('stageWrap');
    if (!wrap) return;
    const padding = 48;
    const availW = wrap.clientWidth - padding;
    const availH = wrap.clientHeight - padding;
    const scaleW = availW / data.w;
    const scaleH = availH / data.h;
    const scale = Math.min(scaleW, scaleH, 1); // 100% 이상 확대 안 함
    if (scale < 1) {
      stageEl.style.transform = `scale(${scale})`;
      stageEl.style.transformOrigin = 'center center';
    } else {
      stageEl.style.transform = '';
    }
  }
  window.addEventListener('resize', () => {
    clearTimeout(fitStageToWindow._t);
    fitStageToWindow._t = setTimeout(fitStageToWindow, 100);
  });

  // ---------------------------------------------------------------
  // 5. 색상 팔레트 렌더링 + 컨텍스트 변경
  // ---------------------------------------------------------------
  const paletteEl = document.getElementById('palette');
  PALETTE_FULL.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'swatch' + (p.c === '#FFFFFF' ? ' is-white' : '');
    btn.style.background = p.c;
    btn.dataset.color = p.c;
    btn.dataset.idx = String(i);
    btn.title = p.name;
    btn.setAttribute('aria-label', p.name);
    if (p.c === State.color) btn.setAttribute('data-active', '');
    btn.addEventListener('click', () => selectColor(p.c));
    paletteEl.appendChild(btn);
  });

  function selectColor(color) {
    State.color = color;
    paletteEl.querySelectorAll('.swatch').forEach(s => {
      if (s.dataset.color === color) s.setAttribute('data-active', '');
      else s.removeAttribute('data-active');
    });
  }

  function refreshPaletteContext() {
    // 형광펜이면 무지개 7색만 노출, 나머지는 9색 모두
    const swatches = paletteEl.querySelectorAll('.swatch');
    swatches.forEach((s, i) => {
      const hideForHighlight = State.tool === 'highlight' && i >= RAINBOW_COUNT;
      s.classList.toggle('hidden', hideForHighlight);
    });
    // 형광펜 활성 상태에서 검정/흰색 선택되어 있던 경우 빨강으로 자동 전환
    if (State.tool === 'highlight') {
      const idx = PALETTE_FULL.findIndex(p => p.c === State.color);
      if (idx >= RAINBOW_COUNT) selectColor(PALETTE_FULL[0].c);
    }
  }

  // ---------------------------------------------------------------
  // 6. 도구 선택 + 상태 표시
  // (실제 핸들러 동작은 S2에서 구현)
  // ---------------------------------------------------------------
  const toolButtons = document.querySelectorAll('[data-tool]');
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  function setTool(name) {
    State.tool = name;
    toolButtons.forEach(b => {
      if (b.dataset.tool === name) b.setAttribute('data-active', '');
      else b.removeAttribute('data-active');
    });
    // 커서 힌트
    const cursor =
      name === 'select' ? 'default' :
      name === 'line' || name === 'rect' || name === 'highlight' ? 'crosshair' :
      'default';
    if (stageEl) stageEl.style.cursor = cursor;
    refreshPaletteContext();
  }
  setTool('select');

  // ---------------------------------------------------------------
  // 7. 닫기 버튼 + Esc 키
  // ---------------------------------------------------------------
  document.getElementById('closeBtn')?.addEventListener('click', () => window.close());
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') { window.close(); return; }
    // 단축키 (S2/S3에서 더 추가)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'v') { e.preventDefault(); setTool('select'); }
      else if (k === 'l') { e.preventDefault(); setTool('line'); }
      else if (k === 'r') { e.preventDefault(); setTool('rect'); }
      else if (k === 'h') { e.preventDefault(); setTool('highlight'); }
    }
  });

  // ---------------------------------------------------------------
  // 8. Stub 핸들러 (S2/S3에서 본격 구현)
  // ---------------------------------------------------------------
  document.querySelectorAll('[data-emoji]').forEach(b => {
    b.addEventListener('click', () => toast('이모지 기능은 다음 세션에서 추가됩니다'));
  });
  document.getElementById('clipBtn')?.addEventListener('click', () => toast('클립보드 — S3 구현 예정'));
  document.getElementById('pngBtn')?.addEventListener('click', () => toast('PNG — S3 구현 예정'));
  document.getElementById('pdfBtn')?.addEventListener('click', () => toast('PDF — S3 구현 예정'));
  document.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      toast(`${act} — S3 구현 예정`);
    });
  });

  // ---------------------------------------------------------------
  // 9. 디버깅용 전역 노출
  // ---------------------------------------------------------------
  window.__paint = { stage, bgLayer, drawLayer, uiLayer, State, setTool, selectColor };

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function safeParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function showEmptyState() {
    document.getElementById('stage')?.style.setProperty('display', 'none');
    document.getElementById('emptyState')?.style.setProperty('display', 'flex');
    // 도구 비활성화
    document.querySelectorAll('.tb, .swatch, .emoji-btn').forEach(el => {
      el.setAttribute('disabled', '');
      el.style.opacity = '0.4';
      el.style.pointerEvents = 'none';
    });
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }
})();
