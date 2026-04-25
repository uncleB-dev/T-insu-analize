// =================================================================
// paint.js — Konva.js 기반 미니멀 그림판 (완성)
// Design Ref: paint-minimal.plan.md
// Modules: M3(boot) + M4(tools) + M5(emoji) + M6(select) + M7(history) + M8(export)
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
  // 2. 색상 팔레트 (Plan §2.5)
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
  const RAINBOW_COUNT = 7; // 형광펜은 무지개 7색만

  // 도구별 두께 (Plan SC-3, SC-4 — 사용자 조정 불가)
  const STROKE = { line: 3, rect: 3, highlight: 22 };
  const HIGHLIGHT_OPACITY = 0.4;
  const EMOJI_FONT_SIZE = 64;

  // ---------------------------------------------------------------
  // 3. 상태
  // ---------------------------------------------------------------
  const State = {
    tool: 'select',
    color: '#E53935',
  };

  // ---------------------------------------------------------------
  // 4. Konva Stage 초기화 (3-Layer)
  // Design Ref: §2.3
  // ---------------------------------------------------------------
  const stageEl = document.getElementById('stage');
  stageEl.style.width = data.w + 'px';
  stageEl.style.height = data.h + 'px';

  const stage = new Konva.Stage({
    container: 'stage',
    width: data.w,
    height: data.h,
  });

  const bgLayer = new Konva.Layer({ listening: false });
  const drawLayer = new Konva.Layer();
  const uiLayer = new Konva.Layer();
  stage.add(bgLayer);
  stage.add(drawLayer);
  stage.add(uiLayer);

  // 배경 이미지
  const bgImg = new Image();
  bgImg.onload = () => {
    const node = new Konva.Image({
      image: bgImg, width: data.w, height: data.h,
      name: 'background', listening: false,
    });
    bgLayer.add(node);
    bgLayer.draw();
    fitStageToWindow();
    pushHistory(); // 초기 빈 상태를 히스토리 0번으로
  };
  bgImg.onerror = () => alert('배경 이미지 로드 실패');
  bgImg.src = data.dataURL;

  // ---------------------------------------------------------------
  // 5. 화면맞춤 — Konva native scaling (CSS transform 사용 X)
  // 포인터 좌표는 stage 내부 (data.w × data.h) 기준 유지
  // ---------------------------------------------------------------
  function fitStageToWindow() {
    const wrap = document.getElementById('stageWrap');
    if (!wrap) return;
    const padding = 48;
    const availW = Math.max(200, wrap.clientWidth - padding);
    const availH = Math.max(200, wrap.clientHeight - padding);
    const scaleW = availW / data.w;
    const scaleH = availH / data.h;
    const scale = Math.min(scaleW, scaleH, 1); // 100% 이상 확대 안 함
    stage.scale({ x: scale, y: scale });
    stage.width(data.w * scale);
    stage.height(data.h * scale);
    stageEl.style.width = (data.w * scale) + 'px';
    stageEl.style.height = (data.h * scale) + 'px';
    stage.batchDraw();
  }
  window.addEventListener('resize', () => {
    clearTimeout(fitStageToWindow._t);
    fitStageToWindow._t = setTimeout(fitStageToWindow, 100);
  });

  // 포인터 위치를 stage 내부 좌표로 (스케일 보정)
  function getPointer() {
    const p = stage.getPointerPosition();
    if (!p) return null;
    const s = stage.scaleX() || 1;
    return { x: p.x / s, y: p.y / s };
  }

  // ---------------------------------------------------------------
  // 6. 색상 팔레트 + 컨텍스트 적응
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
    // 선택 중인 도형의 색상 즉시 반영 (도형 종류별 처리)
    const nodes = tr.nodes();
    if (nodes.length > 0) {
      nodes.forEach(n => {
        // 도장(Group with _stampType): 자식 Rect.stroke + Text.fill 모두 변경
        if (n.attrs?._stampType === 'stamp') {
          n.getChildren().forEach(c => {
            const ccls = c.getClassName();
            if (ccls === 'Rect') c.stroke(color);
            else if (ccls === 'Text') c.fill(color);
          });
          return;
        }
        const cls = n.getClassName();
        // 텍스트/이모지(Text): fill 변경
        if (cls === 'Text') {
          n.fill(color);
          return;
        }
        // 일반 도형(Rect/Line): stroke 변경
        n.stroke(color);
      });
      drawLayer.batchDraw();
      pushHistory();
    }
  }

  function refreshPaletteContext() {
    paletteEl.querySelectorAll('.swatch').forEach((s, i) => {
      const hideForHighlight = State.tool === 'highlight' && i >= RAINBOW_COUNT;
      s.classList.toggle('hidden', hideForHighlight);
    });
    if (State.tool === 'highlight') {
      const idx = PALETTE_FULL.findIndex(p => p.c === State.color);
      if (idx >= RAINBOW_COUNT) selectColor(PALETTE_FULL[0].c);
    }
  }

  // ---------------------------------------------------------------
  // 7. Transformer (Plan SC-6 — L3 풀편집)
  // Design Ref: §2.3 uiLayer 위에 위치
  // ---------------------------------------------------------------
  const tr = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    enabledAnchors: [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ],
    anchorSize: 10,
    anchorStroke: '#3182F6',
    anchorFill: '#FFFFFF',
    anchorCornerRadius: 4,
    borderStroke: '#3182F6',
    borderDash: [4, 4],
    rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
  });
  uiLayer.add(tr);

  // ---------------------------------------------------------------
  // 8. 도구 선택
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
    const cursor =
      name === 'select' ? 'default' :
      'crosshair';
    stageEl.style.cursor = cursor;
    refreshPaletteContext();

    // 도구 모드일 때는 기존 도형의 listening 비활성화 (덧그리기 가능)
    const isSelect = name === 'select';
    drawLayer.getChildren().forEach(child => {
      child.listening(isSelect);
    });
    if (!isSelect) tr.nodes([]);
    drawLayer.batchDraw();
    uiLayer.batchDraw();
  }
  setTool('select');

  // ---------------------------------------------------------------
  // 9. 도구 핸들러 — 직선/사각형/형광펜 (Plan SC-3, SC-4)
  // ---------------------------------------------------------------
  let drawing = null;
  let startPoint = null;

  stage.on('mousedown touchstart', (e) => {
    // 선택 모드
    if (State.tool === 'select') {
      const target = e.target;
      // ⚠️ 핵심: Transformer 핸들/테두리(uiLayer) 클릭은 stage가 가로채면 안 됨
      // Konva의 Transformer 자체 핸들러가 처리하도록 그냥 통과
      if (target.getLayer && target.getLayer() === uiLayer) return;
      // stage 자체 또는 background 이미지를 클릭 → 선택 해제
      if (target === stage || (target.attrs && target.attrs.name === 'background')) {
        tr.detach();
        tr.nodes([]);
        uiLayer.draw();
        return;
      }
      // drawLayer 의 도형 클릭 → 선택
      if (target.getLayer && target.getLayer() === drawLayer) {
        tr.nodes([target]);
        uiLayer.draw();
      }
      return;
    }

    const p = getPointer();
    if (!p) return;
    startPoint = p;

    if (State.tool === 'line') {
      drawing = new Konva.Line({
        points: [p.x, p.y, p.x, p.y],
        stroke: State.color,
        strokeWidth: STROKE.line,
        lineCap: 'round',
        lineJoin: 'round',
        // ⚠️ transform 시 stroke 두께 유지 (Line 스케일링 시 두께 일정)
        strokeScaleEnabled: false,
        // 얇은 직선도 클릭 잘 되도록 히트 영역 확장
        hitStrokeWidth: 20,
        draggable: false,
      });
    } else if (State.tool === 'rect') {
      drawing = new Konva.Rect({
        x: p.x, y: p.y, width: 0, height: 0,
        stroke: State.color,
        strokeWidth: STROKE.rect,
        fill: 'transparent',
        // ⚠️ transform 시 stroke 두께 유지
        strokeScaleEnabled: false,
        // 외곽선만 있는 사각형도 안쪽 클릭 가능하게 (선택 편의)
        hitStrokeWidth: 12,
        draggable: false,
      });
    } else if (State.tool === 'highlight') {
      drawing = new Konva.Line({
        points: [p.x, p.y],
        stroke: State.color,
        strokeWidth: STROKE.highlight,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: HIGHLIGHT_OPACITY,
        tension: 0.2,
        // 형광펜은 두께가 의미 있으므로 stroke 스케일 허용
        strokeScaleEnabled: true,
        hitStrokeWidth: 30,
        draggable: false,
        globalCompositeOperation: 'multiply',
      });
    }
    if (drawing) {
      drawing.listening(false); // 그리는 동안은 선택 불가
      drawLayer.add(drawing);
    }
  });

  stage.on('mousemove touchmove', () => {
    if (!drawing || !startPoint) return;
    const p = getPointer();
    if (!p) return;
    if (State.tool === 'line') {
      drawing.points([startPoint.x, startPoint.y, p.x, p.y]);
    } else if (State.tool === 'rect') {
      drawing.x(Math.min(startPoint.x, p.x));
      drawing.y(Math.min(startPoint.y, p.y));
      drawing.width(Math.abs(p.x - startPoint.x));
      drawing.height(Math.abs(p.y - startPoint.y));
    } else if (State.tool === 'highlight') {
      const pts = drawing.points();
      pts.push(p.x, p.y);
      drawing.points(pts);
    }
    drawLayer.batchDraw();
  });

  stage.on('mouseup touchend', () => {
    if (!drawing) return;
    // 너무 작은 도형은 제거 (오클릭 방지)
    const bbox = drawing.getClientRect({ skipTransform: false });
    if (bbox.width < 4 && bbox.height < 4) {
      drawing.destroy();
    } else {
      registerShape(drawing); // shapes 배열 추가 + 이벤트 + draggable
      pushHistory();
    }
    drawing = null;
    startPoint = null;
    drawLayer.batchDraw();
  });

  // ---------------------------------------------------------------
  // 9b. 텍스트 추가 (모달 입력 — 200자, 4단계 크기, 7색)
  // ---------------------------------------------------------------
  const TEXT_FONT = "'Toss Product Sans', 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif";
  const TEXT_SIZES = [24, 36, 56, 80];
  const TextState = {
    size: 36,
    color: '#E53935',
  };

  // 모달 색상 swatch 7색 (무지개) 채우기 — 한 번만
  function ensureTextModalColors() {
    const cg = document.getElementById('tmColors');
    if (!cg || cg.children.length > 0) return;
    PALETTE_FULL.slice(0, RAINBOW_COUNT).forEach(p => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'tm-swatch';
      sw.style.background = p.c;
      sw.dataset.color = p.c;
      sw.title = p.name;
      sw.setAttribute('aria-label', p.name);
      if (p.c === TextState.color) sw.setAttribute('data-active', '');
      sw.addEventListener('click', () => {
        TextState.color = p.c;
        cg.querySelectorAll('.tm-swatch').forEach(s => {
          if (s.dataset.color === p.c) s.setAttribute('data-active', '');
          else s.removeAttribute('data-active');
        });
      });
      cg.appendChild(sw);
    });
  }

  function openTextModal() {
    const modal = document.getElementById('textModal');
    const input = document.getElementById('tmInput');
    const counter = document.getElementById('tmCount');
    if (!modal || !input) return;

    ensureTextModalColors();
    input.value = '';
    if (counter) counter.textContent = '0';
    counter?.classList.remove('warn');

    // 사이즈 버튼 활성 상태 동기화
    modal.querySelectorAll('.tm-size').forEach(b => {
      const sz = parseInt(b.dataset.size, 10);
      if (sz === TextState.size) b.setAttribute('data-active', '');
      else b.removeAttribute('data-active');
    });
    // 색상 활성 상태 동기화
    modal.querySelectorAll('.tm-swatch').forEach(s => {
      if (s.dataset.color === TextState.color) s.setAttribute('data-active', '');
      else s.removeAttribute('data-active');
    });

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 30);
  }

  function closeTextModal() {
    const modal = document.getElementById('textModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // 모달 닫기 트리거
  document.querySelectorAll('[data-tm-close]').forEach(el => {
    el.addEventListener('click', closeTextModal);
  });

  // 사이즈 버튼
  document.querySelectorAll('#tmSizeGroup .tm-size').forEach(btn => {
    btn.addEventListener('click', () => {
      TextState.size = parseInt(btn.dataset.size, 10);
      document.querySelectorAll('#tmSizeGroup .tm-size').forEach(b => b.removeAttribute('data-active'));
      btn.setAttribute('data-active', '');
    });
  });

  // 글자수 카운터
  const tmInputEl = document.getElementById('tmInput');
  const tmCountEl = document.getElementById('tmCount');
  tmInputEl?.addEventListener('input', () => {
    const n = tmInputEl.value.length;
    if (tmCountEl) {
      tmCountEl.textContent = String(n);
      tmCountEl.parentElement?.classList.toggle('warn', n >= 180);
    }
  });

  // 추가 버튼
  document.getElementById('tmAddBtn')?.addEventListener('click', () => {
    const text = (tmInputEl?.value || '').trim();
    if (!text) {
      toast('텍스트를 입력해 주세요');
      tmInputEl?.focus();
      return;
    }
    addTextNode(text, TextState.size, TextState.color);
    closeTextModal();
  });

  // textarea 키보드: Ctrl/Cmd+Enter = 추가, Esc = 닫기
  tmInputEl?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('tmAddBtn')?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeTextModal();
    }
  });

  // T 버튼 클릭 → 모달 열기
  document.querySelector('[data-action="text"]')?.addEventListener('click', openTextModal);

  function addTextNode(text, size, color) {
    // 폭 제한: 캔버스 가로의 70% 또는 size×12 중 작은 값
    const maxWidth = Math.min(data.w * 0.7, size * 12);
    const node = new Konva.Text({
      text: text,
      fontSize: size,
      fontFamily: TEXT_FONT,
      fontStyle: '500',
      fill: color,
      align: 'center',
      lineHeight: 1.3,
      width: maxWidth,
      // 텍스트 외곽 약간 흰색 stroke로 가독성 보강 (선택사항 — 끄려면 strokeWidth: 0)
      // stroke: 'rgba(255,255,255,0.6)', strokeWidth: 0,
    });
    // 캔버스 중앙에 배치
    node.x((data.w - node.width()) / 2);
    node.y((data.h - node.height()) / 2);
    drawLayer.add(node);
    registerShape(node);
    drawLayer.draw();
    setTool('select');
    tr.nodes([node]);
    uiLayer.draw();
    pushHistory();
    toast('텍스트 추가됨 — 드래그로 이동, 모서리로 크기조절');
  }

  // ---------------------------------------------------------------
  // 9c. 도장(스탬프) — Konva.Label (Tag + Text) 동적 생성
  // 향후 stamps.json 분리로 확장 가능 (현재는 8개 고정)
  // ---------------------------------------------------------------
  const STAMPS = [
    { id: 'renew',     text: '갱신',   defaultColor: '#43A047' }, // 초록
    { id: 'no-renew',  text: '비갱신', defaultColor: '#E53935' }, // 빨강
    { id: 'real-fee',  text: '실비',   defaultColor: '#1E88E5' }, // 파랑
    { id: 'driver',    text: '운전자', defaultColor: '#FB8C00' }, // 주황
    { id: 'saving',    text: '저축형', defaultColor: '#3949AB' }, // 남색
    { id: 'pension',   text: '연금',   defaultColor: '#8E24AA' }, // 보라
    { id: 'cancel',    text: '해지',   defaultColor: '#E53935' }, // 빨강
    { id: 'keep',      text: '유지',   defaultColor: '#1E88E5' }, // 파랑
  ];

  const STAMP_FONT = "'Toss Product Sans', 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif";
  const STAMP_FONT_SIZE = 28;
  const STAMP_PAD_X = 18;
  const STAMP_PAD_Y = 10;
  const STAMP_STROKE = 4;
  const STAMP_TILT = -5; // degrees

  // Group + 명시적 Rect + Text — 측정 후 정확히 매칭
  // (Konva.Label 의 auto-sizing 은 폰트 로드 타이밍에 어긋날 수 있어 회피)
  function createStampNode(text, color) {
    // 1) 폰트 적용된 상태로 텍스트 너비 측정
    const measure = new Konva.Text({
      text: text,
      fontFamily: STAMP_FONT,
      fontSize: STAMP_FONT_SIZE,
      fontStyle: '700',
    });
    const tw = measure.width();
    const th = measure.height();
    measure.destroy();

    const w = tw + STAMP_PAD_X * 2;
    const h = th + STAMP_PAD_Y * 2;

    // 2) Group — 회전 중심을 도장 중앙으로 (offsetX/Y)
    const group = new Konva.Group({
      rotation: STAMP_TILT,
      offsetX: w / 2,
      offsetY: h / 2,
      _stampType: 'stamp',
    });

    // 3) 외곽 사각형 — 내부 투명, 테두리만 색상
    const rect = new Konva.Rect({
      x: 0, y: 0,
      width: w, height: h,
      cornerRadius: 4,
      stroke: color,
      strokeWidth: STAMP_STROKE,
      fill: null, // 완전 투명 (배경 보임)
      strokeScaleEnabled: false,
    });

    // 4) 텍스트 — 사각형 내부 padding 위치
    const txt = new Konva.Text({
      x: STAMP_PAD_X,
      y: STAMP_PAD_Y,
      text: text,
      fontFamily: STAMP_FONT,
      fontSize: STAMP_FONT_SIZE,
      fontStyle: '700',
      fill: color,
      // listening false 로 클릭 시 group이 잡히도록
      listening: false,
    });

    group.add(rect);
    group.add(txt);
    return group;
  }

  // 폰트 로딩 보장 (idempotent — 이미 로드된 경우 즉시 resolve)
  let stampFontPromise = null;
  function ensureStampFontLoaded() {
    if (stampFontPromise) return stampFontPromise;
    if (!document.fonts || !document.fonts.load) {
      stampFontPromise = Promise.resolve();
      return stampFontPromise;
    }
    stampFontPromise = document.fonts
      .load(`700 ${STAMP_FONT_SIZE}px "Toss Product Sans"`)
      .catch(() => { /* 로드 실패해도 fallback 폰트로 진행 */ });
    return stampFontPromise;
  }
  // 페이지 시작 시 미리 워밍업 (사용자가 처음 도장 누를 때 즉시 로드 완료 상태)
  ensureStampFontLoaded();

  async function addStamp(stampDef) {
    await ensureStampFontLoaded();
    const color = stampDef.defaultColor;
    const node = createStampNode(stampDef.text, color);

    // offsetX/Y 가 이미 적용되어 있으므로 x/y 가 곧 시각적 중앙
    node.x(data.w / 2);
    node.y(data.h / 2);

    drawLayer.add(node);
    registerShape(node);
    drawLayer.draw();
    setTool('select');
    tr.nodes([node]);
    uiLayer.draw();
    pushHistory();
    toast(`${stampDef.text} 도장 추가됨`);
  }

  // 드롭다운 8개 미리보기 버튼 렌더링
  function renderStampDropdown() {
    const grid = document.getElementById('stampGrid');
    if (!grid || grid.children.length > 0) return;
    STAMPS.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stamp-btn';
      btn.dataset.stampId = s.id;
      btn.style.color = s.defaultColor; // border + text via currentColor
      btn.textContent = s.text;
      btn.title = `${s.text} (${s.defaultColor})`;
      btn.addEventListener('click', () => {
        addStamp(s);
        closeStampDropdown();
      });
      grid.appendChild(btn);
    });
  }

  // 드롭다운 토글
  function positionStampDropdown() {
    const dd = document.getElementById('stampDropdown');
    const trigger = document.getElementById('stampBtn');
    if (!dd || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    // 일단 트리거 가운데 정렬 + 8px 아래로
    dd.style.top = (rect.bottom + 8) + 'px';
    dd.style.left = (rect.left + rect.width / 2) + 'px';
    dd.style.transform = 'translateX(-50%)';
    // 다음 프레임에 바운딩 측정 → 화면 밖으로 넘어가면 보정
    requestAnimationFrame(() => {
      const ddRect = dd.getBoundingClientRect();
      const margin = 8;
      // 우측 넘침 — 우측 정렬
      if (ddRect.right > window.innerWidth - margin) {
        dd.style.left = (window.innerWidth - margin) + 'px';
        dd.style.transform = 'translateX(-100%)';
      }
      // 좌측 넘침 — 좌측 정렬
      else if (ddRect.left < margin) {
        dd.style.left = margin + 'px';
        dd.style.transform = 'none';
      }
      // 하단 넘침 — 트리거 위로 띄우기
      if (ddRect.bottom > window.innerHeight - margin) {
        dd.style.top = (rect.top - ddRect.height - 8) + 'px';
      }
    });
  }

  function openStampDropdown() {
    renderStampDropdown();
    const dd = document.getElementById('stampDropdown');
    const trigger = document.getElementById('stampBtn');
    if (!dd || !trigger) return;
    dd.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionStampDropdown();
  }
  function closeStampDropdown() {
    const dd = document.getElementById('stampDropdown');
    const trigger = document.getElementById('stampBtn');
    if (!dd || !trigger) return;
    dd.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function toggleStampDropdown() {
    const dd = document.getElementById('stampDropdown');
    if (!dd) return;
    if (dd.hidden) openStampDropdown();
    else closeStampDropdown();
  }

  // 창 크기 변경 / 헤더 스크롤 시 드롭다운 위치 재계산
  window.addEventListener('resize', () => {
    const dd = document.getElementById('stampDropdown');
    if (dd && !dd.hidden) positionStampDropdown();
  });
  document.getElementById('scrollZone')?.addEventListener('scroll', () => {
    const dd = document.getElementById('stampDropdown');
    if (dd && !dd.hidden) positionStampDropdown();
  }, { passive: true });

  document.getElementById('stampBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStampDropdown();
  });

  // 바깥 클릭 시 닫기
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('stampDropdown');
    if (!dd || dd.hidden) return;
    const trigger = document.getElementById('stampBtn');
    if (dd.contains(e.target) || trigger?.contains(e.target)) return;
    closeStampDropdown();
  });

  // ---------------------------------------------------------------
  // 10. 이모지 (Plan SC-5)
  // ---------------------------------------------------------------
  document.querySelectorAll('[data-emoji]').forEach(b => {
    b.addEventListener('click', () => addEmoji(b.dataset.emoji));
  });

  function addEmoji(emoji) {
    const cx = data.w / 2 - EMOJI_FONT_SIZE / 2;
    const cy = data.h / 2 - EMOJI_FONT_SIZE / 2;
    const text = new Konva.Text({
      x: cx, y: cy,
      text: emoji,
      fontSize: EMOJI_FONT_SIZE,
      fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif",
      fill: '#000000',
    });
    drawLayer.add(text);
    registerShape(text);
    drawLayer.draw();
    setTool('select');
    tr.nodes([text]);
    uiLayer.draw();
    pushHistory();
  }

  // ---------------------------------------------------------------
  // 11. Undo/Redo (Plan SC-7) — shape attrs 배열 기반 30 스텝
  // (toJSON 직렬화는 일부 환경에서 children 복원 실패 사례 있어 단순 attrs로 전환)
  // ---------------------------------------------------------------
  const shapes = []; // 현재 drawLayer 내 사용자 도형 (배경 제외)
  const history = []; // 각 스냅샷 = [{ className, attrs }, ...]
  let hIdx = -1;
  let historyPaused = false;

  // 도형 노드의 공통 등록 (히스토리 이벤트 + draggable + 추적)
  function registerShape(node) {
    if (!shapes.includes(node)) shapes.push(node);
    node.draggable(true);
    node.listening(true);
    node.off('dragend.history transformend.history');
    node.on('dragend.history transformend.history', pushHistory);
  }

  function unregisterShape(node) {
    const i = shapes.indexOf(node);
    if (i >= 0) shapes.splice(i, 1);
  }

  // 현재 drawLayer 상태를 plain object 배열로 직렬화
  function takeSnapshot() {
    return shapes.map(n => ({
      className: n.getClassName(),
      attrs: JSON.parse(JSON.stringify(n.getAttrs())),
    }));
  }

  // 스냅샷을 drawLayer에 적용 (기존 도형 모두 제거 후 재생성)
  function applySnapshot(snap) {
    historyPaused = true;
    try {
      tr.detach();
      tr.nodes([]);
      // 기존 모두 제거
      shapes.slice().forEach(n => { try { n.destroy(); } catch (e) {} });
      shapes.length = 0;
      // 스냅샷에서 재생성
      (snap || []).forEach(({ className, attrs }) => {
        const Cls = Konva[className];
        if (!Cls) {
          console.warn('[paint] unknown class', className);
          return;
        }
        try {
          const node = new Cls(attrs);
          drawLayer.add(node);
          registerShape(node);
        } catch (e) {
          console.warn('[paint] restore shape failed', e);
        }
      });
      drawLayer.draw();
      uiLayer.draw();
    } finally {
      historyPaused = false;
    }
  }

  function pushHistory() {
    if (historyPaused) return;
    history.splice(hIdx + 1);
    history.push(takeSnapshot());
    if (history.length > 30) history.shift();
    hIdx = history.length - 1;
    refreshHistoryButtons();
  }

  function undo() {
    if (hIdx <= 0) return;
    hIdx--;
    applySnapshot(history[hIdx]);
    refreshHistoryButtons();
  }

  function redo() {
    if (hIdx >= history.length - 1) return;
    hIdx++;
    applySnapshot(history[hIdx]);
    refreshHistoryButtons();
  }

  function refreshHistoryButtons() {
    const undoBtn = document.querySelector('[data-act="undo"]');
    const redoBtn = document.querySelector('[data-act="redo"]');
    if (undoBtn) undoBtn.disabled = hIdx <= 0;
    if (redoBtn) redoBtn.disabled = hIdx >= history.length - 1;
  }

  // ---------------------------------------------------------------
  // 12. 삭제 / 모두 지우기 (Plan SC-8)
  // ---------------------------------------------------------------
  function deleteSelected() {
    const nodes = tr.nodes();
    if (nodes.length === 0) {
      toast('선택된 도형이 없습니다');
      return;
    }
    tr.detach();
    tr.nodes([]);
    nodes.forEach(n => {
      unregisterShape(n);
      n.destroy();
    });
    drawLayer.draw();
    uiLayer.draw();
    pushHistory();
  }

  function clearAll() {
    if (shapes.length === 0) {
      toast('지울 도형이 없습니다');
      return;
    }
    if (!confirm('그려진 도형을 모두 지웁니다. 계속하시겠습니까?')) return;
    tr.detach();
    tr.nodes([]);
    shapes.slice().forEach(n => n.destroy());
    shapes.length = 0;
    drawLayer.draw();
    uiLayer.draw();
    pushHistory();
    toast('모두 지웠습니다');
  }

  // ---------------------------------------------------------------
  // 13. 헤더 액션 버튼 바인딩
  // ---------------------------------------------------------------
  document.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'delete') deleteSelected();
      else if (act === 'clear') clearAll();
    });
  });

  // ---------------------------------------------------------------
  // 14. 키보드 단축키
  // ---------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    // 모달 열려 있으면 우선 닫기
    const textModal = document.getElementById('textModal');
    if (textModal?.classList.contains('is-open')) {
      if (e.key === 'Escape') { e.preventDefault(); closeTextModal(); }
      return;
    }
    // 드롭다운 열려 있으면 Esc로 닫기 우선
    const dd = document.getElementById('stampDropdown');
    if (dd && !dd.hidden && e.key === 'Escape') {
      e.preventDefault();
      closeStampDropdown();
      return;
    }
    // Esc — 닫기 또는 선택 해제
    if (e.key === 'Escape') {
      if (tr.nodes().length > 0) {
        tr.nodes([]); uiLayer.batchDraw();
      } else {
        window.close();
      }
      return;
    }
    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); redo(); return;
    }
    // Ctrl+S — PNG 다운로드
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); exportPNG(); return;
    }
    // Del / Backspace — 선택 삭제
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (tr.nodes().length > 0) {
        e.preventDefault(); deleteSelected();
      }
      return;
    }
    // 도구 단축키
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'v') { e.preventDefault(); setTool('select'); }
      else if (k === 'l') { e.preventDefault(); setTool('line'); }
      else if (k === 'r') { e.preventDefault(); setTool('rect'); }
      else if (k === 'h') { e.preventDefault(); setTool('highlight'); }
      else if (k === 't') { e.preventDefault(); openTextModal(); }
      else if (k === 's') { e.preventDefault(); toggleStampDropdown(); }
    }
  });

  // ---------------------------------------------------------------
  // 15. Export — PNG / Clipboard / PDF (Plan SC-9)
  // 원본 해상도(data.w × data.h)로 출력 — pixelRatio 자동 보정
  // ---------------------------------------------------------------
  function getExportDataURL() {
    // 선택 상태 해제 후 export (transformer 핸들 미포함)
    const prevNodes = tr.nodes();
    tr.nodes([]);
    uiLayer.batchDraw();

    // Konva의 stage scale 보정
    const scale = stage.scaleX() || 1;
    const dataURL = stage.toDataURL({
      mimeType: 'image/png',
      pixelRatio: 1 / scale, // 원본 해상도로 출력
      x: 0, y: 0,
      width: data.w * scale,
      height: data.h * scale,
    });

    // Transformer 복원
    if (prevNodes.length > 0) {
      tr.nodes(prevNodes);
      uiLayer.batchDraw();
    }
    return dataURL;
  }

  function exportPNG() {
    try {
      const url = getExportDataURL();
      const a = document.createElement('a');
      a.href = url;
      a.download = `보장마크업_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('PNG 저장됨');
    } catch (err) {
      console.error('PNG export error', err);
      toast('PNG 저장 실패');
    }
  }

  async function exportClipboard() {
    try {
      const url = getExportDataURL();
      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error('Clipboard API 미지원');
      }
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('클립보드 복사됨 — Ctrl+V 로 붙여넣기');
    } catch (err) {
      console.warn('clipboard error', err);
      toast('클립보드 복사 실패 — PNG 다운로드로 대체');
      exportPNG();
    }
  }

  function exportPDF() {
    try {
      if (!window.jspdf) { toast('jsPDF 로드 실패'); return; }
      const url = getExportDataURL();
      const img = new Image();
      img.onload = () => {
        const { jsPDF } = window.jspdf;
        const orientation = img.width > img.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = img.width / img.height;
        let w = pw, h = pw / ratio;
        if (h > ph) { h = ph; w = ph * ratio; }
        pdf.addImage(url, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
        pdf.save(`보장마크업_${new Date().toISOString().slice(0, 10)}.pdf`);
        toast('PDF 저장됨');
      };
      img.onerror = () => toast('이미지 로드 실패');
      img.src = url;
    } catch (err) {
      console.error('PDF export error', err);
      toast('PDF 저장 실패');
    }
  }

  document.getElementById('clipBtn')?.addEventListener('click', exportClipboard);
  document.getElementById('pngBtn')?.addEventListener('click', exportPNG);
  document.getElementById('pdfBtn')?.addEventListener('click', exportPDF);
  document.getElementById('closeBtn')?.addEventListener('click', () => window.close());

  // ---------------------------------------------------------------
  // 16. 디버깅용 전역 노출
  // ---------------------------------------------------------------
  window.__paint = {
    stage, bgLayer, drawLayer, uiLayer, tr,
    State, setTool, selectColor,
    undo, redo, history, exportPNG, exportClipboard, exportPDF,
  };

  refreshHistoryButtons();

  // ---------------------------------------------------------------
  // 17. 헤더 가로 스크롤 — 휠 → 가로 변환 + 좌우 화살표 자동 노출
  // ---------------------------------------------------------------
  (function setupHeaderScroll() {
    const zone = document.getElementById('scrollZone');
    const leftBtn = document.getElementById('scrollLeftBtn');
    const rightBtn = document.getElementById('scrollRightBtn');
    if (!zone || !leftBtn || !rightBtn) return;

    // 휠 → 가로 스크롤 변환 (마우스 사용자 편의)
    zone.addEventListener('wheel', (e) => {
      if (zone.scrollWidth <= zone.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        zone.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    // 화살표 클릭 시 200px 이동
    leftBtn.addEventListener('click', () => {
      zone.scrollBy({ left: -200, behavior: 'smooth' });
    });
    rightBtn.addEventListener('click', () => {
      zone.scrollBy({ left: 200, behavior: 'smooth' });
    });

    // 화살표 표시 여부 갱신 — 스크롤 필요 + 끝 도달 여부
    function refreshArrows() {
      const overflow = zone.scrollWidth > zone.clientWidth + 1;
      const atStart = zone.scrollLeft <= 1;
      const atEnd = zone.scrollLeft + zone.clientWidth >= zone.scrollWidth - 1;
      leftBtn.classList.toggle('visible', overflow && !atStart);
      rightBtn.classList.toggle('visible', overflow && !atEnd);
    }
    refreshArrows();
    zone.addEventListener('scroll', refreshArrows, { passive: true });
    window.addEventListener('resize', () => {
      clearTimeout(refreshArrows._t);
      refreshArrows._t = setTimeout(refreshArrows, 100);
    });
    // 초기 layout 안정 후 두 번 더 호출 (이미지 로드 등 비동기 대비)
    setTimeout(refreshArrows, 200);
    setTimeout(refreshArrows, 500);
  })();

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function safeParse(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  function showEmptyState() {
    document.getElementById('stage')?.style.setProperty('display', 'none');
    document.getElementById('emptyState')?.style.setProperty('display', 'flex');
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
