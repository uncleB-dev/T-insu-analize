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
    // 선택 중인 도형의 색상도 즉시 반영 (UX 개선)
    const nodes = tr.nodes();
    if (nodes.length > 0) {
      nodes.forEach(n => {
        if (n.getClassName() === 'Text') return; // 이모지는 색상 불변
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
