// ============================================================
// paint-overlay.js — 같은 페이지 위에 뜨는 오버레이 그림판
// file:// 환경에서 크로스 오리진 문제를 완전히 우회
// 의존: html2canvas (로드됨), fabric/jspdf (동적 로드)
// 외부 노출: window.openPaintOverlay()
// ============================================================
(function () {
  let overlay = null;
  let canvas = null;
  let currentTool = 'select';
  let currentStroke = '#ef4444';
  let currentFill = '';
  let currentStrokeWidth = 3;
  let currentFont = "system-ui,'Malgun Gothic',sans-serif";
  let currentFontSize = 18;
  let drawingShape = null;
  let startPt = null;
  let polylinePoints = [];
  let linkStart = null;
  const historyStack = [];
  let historyIdx = -1;
  let historyPaused = false;
  let originalDataURL = null;
  let canvasW = 0, canvasH = 0;
  let currentZoom = 1;
  const ZOOM_MIN = 0.2, ZOOM_MAX = 4, ZOOM_STEP = 1.2;

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------
  window.openPaintOverlay = async function openPaintOverlay() {
    if (typeof html2canvas === 'undefined') { alert('html2canvas 로드 실패'); return; }

    if (window.toast) window.toast('캡처 중...');
    document.body.classList.add('paint-capturing');

    // 페이지 + 모든 스크롤 컨테이너를 최상단/최좌측으로
    window.scrollTo(0, 0);
    const scrollables = document.querySelectorAll('.overview-wrap, .coverage-table-wrap, .panel, main');
    const savedScroll = [];
    scrollables.forEach(el => {
      savedScroll.push({ el, x: el.scrollLeft, y: el.scrollTop });
      el.scrollLeft = 0; el.scrollTop = 0;
    });

    // 레이아웃 안정화 2프레임 대기 (CSS overflow:visible 반영)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 캡처 타겟 — overview는 overview-wrap만, 나머지는 main
    const target =
      document.querySelector('.overview-wrap') ||
      document.querySelector('main') ||
      document.body;

    // 콘텐츠의 실제 크기 계산 (target 내부 기준으로 제한)
    const rawW = Math.max(target.scrollWidth, target.offsetWidth, 800);
    const rawH = Math.max(target.scrollHeight, target.offsetHeight, 600);

    // 브라우저 canvas 한계를 고려해 scale 자동 조정
    // 대부분 브라우저: 최대 픽셀 16384, 안전하게 8000으로 제한
    const MAX_PX = 8000;
    let captureScale = Math.min(window.devicePixelRatio || 1, 1.5);
    if (rawW * captureScale > MAX_PX) captureScale = MAX_PX / rawW;
    if (rawH * captureScale > MAX_PX) captureScale = Math.min(captureScale, MAX_PX / rawH);
    captureScale = Math.max(0.4, captureScale); // 너무 작으면 글자 깨짐

    let capCanvas;
    try {
      capCanvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: captureScale,
        width: rawW,
        height: rawH,
        windowWidth: rawW,
        windowHeight: rawH,
        scrollX: 0,
        scrollY: 0,
        useCORS: true, logging: false,
      });
    } catch (err) {
      document.body.classList.remove('paint-capturing');
      savedScroll.forEach(s => { s.el.scrollLeft = s.x; s.el.scrollTop = s.y; });
      alert('캡처 실패: ' + (err.message || err));
      return;
    }
    document.body.classList.remove('paint-capturing');
    // 스크롤 위치 복원
    savedScroll.forEach(s => { s.el.scrollLeft = s.x; s.el.scrollTop = s.y; });

    const dataURL = capCanvas.toDataURL('image/png', 0.92);
    canvasW = capCanvas.width; canvasH = capCanvas.height;
    originalDataURL = dataURL;

    // fabric / jspdf 없으면 동적 로드
    try {
      if (typeof fabric === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js');
      }
      if (typeof window.jspdf === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      }
    } catch (err) {
      alert('CDN 로드 실패 — 인터넷 연결 확인');
      return;
    }

    buildOverlay();
    initCanvas(dataURL, canvasW, canvasH);
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ------------------------------------------------------------
  // Overlay DOM 생성
  // ------------------------------------------------------------
  function buildOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
    overlay = document.createElement('div');
    overlay.className = 'paint-overlay';
    overlay.innerHTML = `
      <div class="po-header">
        <h2>🎨 그림판</h2>
        <div class="po-spacer"></div>
        <button class="btn" data-po="undo" title="되돌리기 (Ctrl+Z)">↶</button>
        <button class="btn" data-po="redo" title="다시하기">↷</button>
        <button class="btn" data-po="clear">🧹 지우기</button>
        <button class="btn" data-po="restore">↺ 원본</button>
        <div class="po-divider"></div>
        <div class="po-zoom">
          <button class="btn small" data-po="zoomOut" title="축소 (Ctrl+-)">−</button>
          <button class="btn small" data-po="zoom100" title="실제 크기 (Ctrl+0)"><span data-zoom-val>100%</span></button>
          <button class="btn small" data-po="zoomIn" title="확대 (Ctrl++)">+</button>
          <button class="btn small" data-po="zoomFit" title="화면 맞춤">⊡</button>
        </div>
        <div class="po-divider"></div>
        <button class="btn primary" data-po="png">💾 PNG</button>
        <button class="btn" data-po="clip">📋 복사</button>
        <button class="btn" data-po="pdf">📄 PDF</button>
        <button class="btn danger" data-po="close" title="닫기">✕</button>
      </div>
      <div class="po-workspace">
        <aside class="po-toolbox">
          <button class="po-tool" data-tool="select" title="선택">↖</button>
          <button class="po-tool" data-tool="rect" title="사각형">▭</button>
          <button class="po-tool" data-tool="circle" title="원">◯</button>
          <button class="po-tool" data-tool="arrow" title="화살표">➜</button>
          <button class="po-tool" data-tool="line" title="직선">╱</button>
          <button class="po-tool" data-tool="text" title="텍스트">T</button>
          <button class="po-tool" data-tool="bubble" title="말풍선">💬</button>
          <button class="po-tool" data-tool="pen" title="펜">✏</button>
          <button class="po-tool" data-tool="highlight" title="형광펜">🖍</button>
          <div class="po-tool-div"></div>
          <button class="po-tool" data-sticker="✅">✅</button>
          <button class="po-tool" data-sticker="❗">❗</button>
          <button class="po-tool" data-sticker="⭐">⭐</button>
          <button class="po-tool" data-sticker="👉">👉</button>
        </aside>
        <main class="po-canvas-area">
          <div class="po-canvas-wrap"><canvas id="po-canvas"></canvas></div>
        </main>
        <aside class="po-props">
          <div class="po-prop">
            <label>선 색상</label>
            <div class="po-swatches" data-prop="stroke">
              <button class="po-sw" style="background:#ef4444" data-c="#ef4444"></button>
              <button class="po-sw" style="background:#f97316" data-c="#f97316"></button>
              <button class="po-sw" style="background:#eab308" data-c="#eab308"></button>
              <button class="po-sw" style="background:#22c55e" data-c="#22c55e"></button>
              <button class="po-sw" style="background:#3b82f6" data-c="#3b82f6"></button>
              <button class="po-sw" style="background:#a855f7" data-c="#a855f7"></button>
              <button class="po-sw" style="background:#000" data-c="#000000"></button>
              <button class="po-sw" style="background:#fff;border:1px solid #ccc" data-c="#ffffff"></button>
            </div>
          </div>
          <div class="po-prop">
            <label>채움</label>
            <div class="po-swatches" data-prop="fill">
              <button class="po-sw po-none" data-c="">∅</button>
              <button class="po-sw" style="background:rgba(239,68,68,.3)" data-c="rgba(239,68,68,0.3)"></button>
              <button class="po-sw" style="background:rgba(234,179,8,.3)" data-c="rgba(234,179,8,0.3)"></button>
              <button class="po-sw" style="background:rgba(34,197,94,.3)" data-c="rgba(34,197,94,0.3)"></button>
              <button class="po-sw" style="background:rgba(59,130,246,.3)" data-c="rgba(59,130,246,0.3)"></button>
            </div>
          </div>
          <div class="po-prop">
            <label>두께 <span data-sw-val>3</span>px</label>
            <input type="range" id="po-sw" min="1" max="20" value="3" />
          </div>
          <div class="po-prop">
            <label>글자 크기 <span data-fs-val>18</span>px</label>
            <input type="range" id="po-fs" min="10" max="60" value="18" />
          </div>
          <div class="po-prop">
            <label>선택 도형</label>
            <div class="po-sel-actions">
              <button class="btn small" data-po="front" title="맨 앞">⤒</button>
              <button class="btn small" data-po="back" title="맨 뒤">⤓</button>
              <button class="btn small" data-po="dup" title="복제">⧉</button>
              <button class="btn small danger" data-po="del" title="삭제">✕</button>
            </div>
          </div>
        </aside>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    bindOverlayEvents();
  }

  // ------------------------------------------------------------
  // Canvas 초기화
  // ------------------------------------------------------------
  function initCanvas(dataURL, w, h) {
    canvas = new fabric.Canvas('po-canvas', {
      width: w, height: h,
      selection: true, preserveObjectStacking: true,
      backgroundColor: '#ffffff',
    });
    fabric.Image.fromURL(dataURL, img => {
      img.scaleToWidth(w);
      canvas.setBackgroundImage(img, () => {
        canvas.renderAll();
        recordHistory();
        // 배경 준비 완료 후 화면맞춤 (레이아웃 안정 대기)
        requestAnimationFrame(() => requestAnimationFrame(zoomFit));
      });
    });
    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);
    canvas.on('mouse:dblclick', onDblClick);
    canvas.on('object:added', () => { if (!historyPaused) recordHistory(); });
    canvas.on('object:modified', () => { if (!historyPaused) recordHistory(); });
    canvas.on('object:removed', () => { if (!historyPaused) recordHistory(); });
    // Ctrl+휠 확대/축소는 브라우저 전체 줌과 충돌하여 제거됨
    // 줌 조작: 헤더 버튼 (− / 100% / + / ⊡) 또는 키보드 단축키
    setTool('select');
    // 활성 swatch 표시
    highlightSwatch('stroke', currentStroke);
    // 첫 화면맞춤은 배경 이미지 onload 콜백에서 수행됨
  }

  // ------------------------------------------------------------
  // Zoom helpers
  // ------------------------------------------------------------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 단순/안정 줌: viewport는 항상 좌상단 원점 + 순수 스케일
  // 스크롤은 po-canvas-area 가 자연스럽게 제공
  function applyZoom(zoom) {
    if (!canvas) return;
    zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    currentZoom = zoom;
    canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
    canvas.setDimensions({ width: canvasW * zoom, height: canvasH * zoom });
    canvas.calcOffset(); // 마우스 좌표 재계산
    canvas.requestRenderAll();
    updateZoomLabel();
  }

  function zoomIn()    { applyZoom(currentZoom * ZOOM_STEP); }
  function zoomOut()   { applyZoom(currentZoom / ZOOM_STEP); }
  function zoomReset() { applyZoom(1); scrollToTopLeft(); }

  function zoomFit() {
    const area = overlay?.querySelector('.po-canvas-area');
    if (!area || !canvasW || !canvasH) { applyZoom(1); return; }
    const pad = 48;
    const availW = Math.max(200, area.clientWidth - pad);
    const availH = Math.max(200, area.clientHeight - pad);
    const z = clamp(Math.min(availW / canvasW, availH / canvasH), ZOOM_MIN, ZOOM_MAX);
    applyZoom(z);
    scrollToTopLeft();
  }

  function scrollToTopLeft() {
    const area = overlay?.querySelector('.po-canvas-area');
    if (area) { area.scrollLeft = 0; area.scrollTop = 0; }
  }

  function updateZoomLabel() {
    const el = overlay?.querySelector('[data-zoom-val]');
    if (el) el.textContent = Math.round(currentZoom * 100) + '%';
  }

  function bindOverlayEvents() {
    overlay.querySelectorAll('.po-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.sticker) { addSticker(btn.dataset.sticker); return; }
        setTool(btn.dataset.tool);
      });
    });
    overlay.addEventListener('click', e => {
      const el = e.target.closest('[data-po]');
      if (!el) return;
      const act = el.dataset.po;
      if (act === 'close') closeOverlay();
      else if (act === 'undo') undo();
      else if (act === 'redo') redo();
      else if (act === 'clear') clearShapes();
      else if (act === 'restore') restoreOriginal();
      else if (act === 'png') exportPNG();
      else if (act === 'clip') exportClipboard();
      else if (act === 'pdf') exportPDF();
      else if (act === 'front') { canvas.getActiveObjects().forEach(o => canvas.bringToFront(o)); recordHistory(); }
      else if (act === 'back') { canvas.getActiveObjects().forEach(o => canvas.sendToBack(o)); recordHistory(); }
      else if (act === 'dup') duplicateSelected();
      else if (act === 'del') deleteSelected();
      else if (act === 'zoomIn') zoomIn();
      else if (act === 'zoomOut') zoomOut();
      else if (act === 'zoom100') zoomReset();
      else if (act === 'zoomFit') zoomFit();
    });
    overlay.querySelectorAll('[data-prop="stroke"] .po-sw').forEach(sw => {
      sw.addEventListener('click', () => {
        currentStroke = sw.dataset.c || '#000000';
        highlightSwatch('stroke', currentStroke);
        applyPropToSelected({ stroke: currentStroke });
        if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = currentTool === 'highlight' ? withOpacity(currentStroke, 0.35) : currentStroke;
      });
    });
    overlay.querySelectorAll('[data-prop="fill"] .po-sw').forEach(sw => {
      sw.addEventListener('click', () => {
        currentFill = sw.dataset.c;
        highlightSwatch('fill', currentFill);
        applyPropToSelected({ fill: currentFill || 'transparent' });
      });
    });
    const swInput = overlay.querySelector('#po-sw');
    swInput.addEventListener('input', e => {
      currentStrokeWidth = +e.target.value;
      overlay.querySelector('[data-sw-val]').textContent = currentStrokeWidth;
      applyPropToSelected({ strokeWidth: currentStrokeWidth });
      if (canvas.isDrawingMode) {
        canvas.freeDrawingBrush.width = currentTool === 'highlight' ? currentStrokeWidth * 6 : currentStrokeWidth;
      }
    });
    const fsInput = overlay.querySelector('#po-fs');
    fsInput.addEventListener('input', e => {
      currentFontSize = +e.target.value;
      overlay.querySelector('[data-fs-val]').textContent = currentFontSize;
      applyPropToSelected({ fontSize: currentFontSize });
    });
    // 창 크기 변경 시 현재 줌 유지하며 레이아웃 재계산
    overlay._resizeHandler = () => { if (canvas) canvas.calcOffset(); };
    window.addEventListener('resize', overlay._resizeHandler);
    // 키보드
    overlay._keyHandler = (e) => {
      if (!overlay) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (canvas?.getActiveObject()?.isEditing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomIn(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomReset(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '9') { e.preventDefault(); zoomFit(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (canvas.getActiveObjects().length) { e.preventDefault(); deleteSelected(); } }
      else if (e.key === 'Escape') { closeOverlay(); }
    };
    document.addEventListener('keydown', overlay._keyHandler);
  }

  function closeOverlay() {
    if (overlay?._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
    if (overlay?._resizeHandler) window.removeEventListener('resize', overlay._resizeHandler);
    if (overlay) { overlay.remove(); overlay = null; }
    canvas = null;
    currentZoom = 1;
    document.body.style.overflow = '';
    historyStack.length = 0; historyIdx = -1;
  }

  // ------------------------------------------------------------
  // Drawing / tools (paint.js 에서 이식)
  // ------------------------------------------------------------
  function setTool(name) {
    currentTool = name;
    overlay.querySelectorAll('.po-tool').forEach(t => t.classList.toggle('active', t.dataset.tool === name));
    const isSelect = name === 'select';
    canvas.selection = isSelect;
    canvas.forEachObject(o => { o.selectable = isSelect; o.evented = isSelect; });
    canvas.defaultCursor = isSelect ? 'default' : 'crosshair';
    canvas.isDrawingMode = (name === 'pen' || name === 'highlight');
    if (canvas.isDrawingMode) {
      canvas.freeDrawingBrush.color = name === 'highlight' ? withOpacity(currentStroke, 0.35) : currentStroke;
      canvas.freeDrawingBrush.width = name === 'highlight' ? currentStrokeWidth * 6 : currentStrokeWidth;
    }
    if (name !== 'polyline') polylinePoints = [];
    if (name !== 'linkline') linkStart = null;
    canvas.renderAll();
  }
  function onMouseDown(opt) {
    if (canvas.isDrawingMode) return;
    const pt = canvas.getPointer(opt.e); startPt = pt;
    switch (currentTool) {
      case 'rect':
        drawingShape = new fabric.Rect({ left: pt.x, top: pt.y, width: 0, height: 0,
          stroke: currentStroke, strokeWidth: currentStrokeWidth, fill: currentFill || 'transparent' });
        canvas.add(drawingShape); break;
      case 'circle':
        drawingShape = new fabric.Ellipse({ left: pt.x, top: pt.y, rx: 0, ry: 0,
          stroke: currentStroke, strokeWidth: currentStrokeWidth, fill: currentFill || 'transparent',
          originX: 'left', originY: 'top' });
        canvas.add(drawingShape); break;
      case 'line':
        drawingShape = new fabric.Line([pt.x, pt.y, pt.x, pt.y], { stroke: currentStroke, strokeWidth: currentStrokeWidth });
        canvas.add(drawingShape); break;
      case 'arrow':
        drawingShape = makeArrow(pt.x, pt.y, pt.x, pt.y); canvas.add(drawingShape); break;
      case 'text': {
        const t = new fabric.IText('텍스트', { left: pt.x, top: pt.y, fill: currentStroke,
          fontSize: currentFontSize, fontFamily: currentFont });
        historyPaused = true; canvas.add(t).setActiveObject(t); t.enterEditing(); t.selectAll();
        historyPaused = false; setTool('select'); recordHistory();
        break;
      }
      case 'bubble': addBubble(pt.x, pt.y); setTool('select'); break;
    }
  }
  function onMouseMove(opt) {
    if (!drawingShape || !startPt) return;
    const pt = canvas.getPointer(opt.e);
    switch (currentTool) {
      case 'rect':
        drawingShape.set({ left: Math.min(startPt.x, pt.x), top: Math.min(startPt.y, pt.y),
          width: Math.abs(pt.x - startPt.x), height: Math.abs(pt.y - startPt.y) }); break;
      case 'circle':
        drawingShape.set({ left: Math.min(startPt.x, pt.x), top: Math.min(startPt.y, pt.y),
          rx: Math.abs(pt.x - startPt.x) / 2, ry: Math.abs(pt.y - startPt.y) / 2 }); break;
      case 'line': drawingShape.set({ x2: pt.x, y2: pt.y }); break;
      case 'arrow': updateArrow(drawingShape, startPt.x, startPt.y, pt.x, pt.y); break;
    }
    canvas.renderAll();
  }
  function onMouseUp() {
    if (drawingShape) {
      const bbox = drawingShape.getBoundingRect();
      if (bbox.width < 4 && bbox.height < 4) {
        historyPaused = true; canvas.remove(drawingShape); historyPaused = false;
      }
      drawingShape = null; startPt = null;
      if (['rect','circle','line','arrow'].includes(currentTool)) setTool('select');
    }
  }
  function onDblClick() {}
  function makeArrow(x1, y1, x2, y2) {
    const group = new fabric.Group([], { lockScalingFlip: true });
    updateArrow(group, x1, y1, x2, y2); return group;
  }
  function updateArrow(group, x1, y1, x2, y2) {
    const line = new fabric.Line([x1, y1, x2, y2], { stroke: currentStroke, strokeWidth: currentStrokeWidth,
      originX: 'center', originY: 'center' });
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headSize = Math.max(10, currentStrokeWidth * 3);
    const head = new fabric.Triangle({ left: x2, top: y2, width: headSize, height: headSize,
      fill: currentStroke, originX: 'center', originY: 'center', angle: (angle * 180 / Math.PI) + 90 });
    group._objects = [line, head]; group.addWithUpdate(); group.setCoords();
  }
  function addBubble(x, y) {
    const text = new fabric.IText('메모', { fontSize: currentFontSize, fontFamily: currentFont,
      fill: '#111827', originX: 'center', originY: 'center' });
    const rect = new fabric.Rect({ width: 140, height: 60, rx: 10, ry: 10,
      fill: '#fef3c7', stroke: currentStroke, strokeWidth: Math.max(1, currentStrokeWidth - 1),
      originX: 'center', originY: 'center' });
    const group = new fabric.Group([rect, text], { left: x, top: y, originX: 'center', originY: 'center' });
    canvas.add(group).setActiveObject(group);
  }
  function addSticker(emoji) {
    const c = canvas.getCenter();
    const text = new fabric.Text(emoji, { left: c.left, top: c.top, fontSize: 48,
      originX: 'center', originY: 'center' });
    canvas.add(text).setActiveObject(text); setTool('select');
  }

  // ------------------------------------------------------------
  // Properties / History / Export
  // ------------------------------------------------------------
  function highlightSwatch(group, color) {
    overlay.querySelectorAll(`[data-prop="${group}"] .po-sw`).forEach(sw =>
      sw.classList.toggle('active', sw.dataset.c === color));
  }
  function applyPropToSelected(props) {
    const objs = canvas.getActiveObjects(); if (!objs.length) return;
    objs.forEach(o => {
      if (o.type === 'group' && o._objects) o._objects.forEach(sub => sub.set(props));
      else o.set(props);
    });
    canvas.requestRenderAll(); recordHistory();
  }
  function withOpacity(hex, a) {
    if (hex.startsWith('rgba')) return hex;
    const m = hex.match(/^#([0-9a-f]{6})$/i); if (!m) return hex;
    const r = parseInt(m[1].slice(0,2),16), g = parseInt(m[1].slice(2,4),16), b = parseInt(m[1].slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function recordHistory() {
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON(['lockScalingFlip']));
    historyStack.splice(historyIdx + 1);
    historyStack.push(json);
    if (historyStack.length > 30) historyStack.shift();
    historyIdx = historyStack.length - 1;
  }
  function undo() {
    if (historyIdx <= 0) return;
    historyIdx--; loadHistory(historyStack[historyIdx]);
  }
  function redo() {
    if (historyIdx >= historyStack.length - 1) return;
    historyIdx++; loadHistory(historyStack[historyIdx]);
  }
  function loadHistory(json) {
    historyPaused = true;
    canvas.loadFromJSON(json, () => { canvas.renderAll(); historyPaused = false; });
  }
  function deleteSelected() {
    const objs = canvas.getActiveObjects(); if (!objs.length) return;
    objs.forEach(o => canvas.remove(o));
    canvas.discardActiveObject(); canvas.requestRenderAll();
  }
  function duplicateSelected() {
    const objs = canvas.getActiveObjects(); if (!objs.length) return;
    canvas.discardActiveObject();
    objs.forEach(o => { o.clone(c => { c.set({ left: o.left + 20, top: o.top + 20 }); canvas.add(c); canvas.setActiveObject(c); }); });
  }
  function clearShapes() {
    if (!confirm('그려진 도형을 모두 지웁니다.')) return;
    const bg = canvas.backgroundImage;
    canvas.getObjects().slice().forEach(o => canvas.remove(o));
    canvas.backgroundImage = bg; canvas.renderAll(); recordHistory();
  }
  function restoreOriginal() {
    if (!confirm('원본으로 복원하시겠습니까?')) return;
    canvas.getObjects().slice().forEach(o => canvas.remove(o));
    fabric.Image.fromURL(originalDataURL, img => {
      img.scaleToWidth(canvasW);
      canvas.setBackgroundImage(img, () => { canvas.renderAll(); recordHistory(); });
    });
  }
  function renderFullDataURL() {
    canvas.discardActiveObject(); canvas.renderAll();
    return canvas.toDataURL({ format: 'png', quality: 0.95, multiplier: 1 });
  }
  function exportPNG() {
    const dataURL = renderFullDataURL();
    const a = document.createElement('a'); a.href = dataURL;
    a.download = `보장마크업_${new Date().toISOString().slice(0,10)}.png`; a.click();
    if (window.toast) window.toast('PNG 저장됨');
  }
  async function exportClipboard() {
    const dataURL = renderFullDataURL();
    try {
      const blob = await (await fetch(dataURL)).blob();
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        if (window.toast) window.toast('클립보드에 복사됨');
      } else throw new Error('Clipboard API 미지원');
    } catch (err) {
      if (window.toast) window.toast('클립보드 복사 실패 — PNG 다운로드로 대체');
      exportPNG();
    }
  }
  function exportPDF() {
    if (!window.jspdf) { if (window.toast) window.toast('jsPDF 로드 실패'); return; }
    const dataURL = renderFullDataURL();
    const { jsPDF } = window.jspdf;
    const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(); const ph = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pw, h = pw / ratio;
    if (h > ph) { h = ph; w = ph * ratio; }
    const x = (pw - w) / 2, y = (ph - h) / 2;
    pdf.addImage(dataURL, 'PNG', x, y, w, h);
    pdf.save(`보장마크업_${new Date().toISOString().slice(0,10)}.pdf`);
    if (window.toast) window.toast('PDF 저장됨');
  }
})();
