// Design Ref: Plan §3 M3-M6 — fabric.js 기반 도구·속성·히스토리·내보내기
// 의존: fabric.js 5.x, jsPDF (UMD)

let canvas = null;
let currentTool = 'select';
let currentStroke = '#ef4444';
let currentFill = '';       // '' = no fill
let currentStrokeWidth = 3;
let currentFont = "system-ui,'Malgun Gothic',sans-serif";
let currentFontSize = 18;

// Drawing state
let drawingShape = null;
let startPt = null;
let polylinePoints = [];
let linkStart = null;

// History
const historyStack = [];
let historyIdx = -1;
let historyPaused = false;

const toastEl = document.getElementById('toast');
function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1500); }
window.toast = toast;

// ============================================================
// Boot — 이중 채널로 payload 수신
// 채널 A (메인): localStorage 폴링 — file:// 에서도 동작하는 경우가 많음
// 채널 B (백업): postMessage — cross-origin 이어도 브라우저별 동작
// ============================================================
(function boot() {
  const emptyEl = document.getElementById('emptyState');
  emptyEl.style.display = '';
  emptyEl.textContent = '이미지 전송 대기 중…';

  console.log('[paint] boot start. opener:', !!window.opener, 'fabric:', typeof fabric, 'jspdf:', typeof window.jspdf);

  let payloadReceived = false;

  const consume = (payload, source) => {
    if (canvas || payloadReceived) return;
    payloadReceived = true;
    emptyEl.textContent = '이미지 처리 중…';
    console.log('[paint] payload received via', source, ':', payload.w, 'x', payload.h, 'id:', payload.id);
    // 사용 후 스토리지 정리 — 다음 캡처에서 stale 방지
    try { localStorage.removeItem('paintCanvas'); } catch {}
    try { sessionStorage.removeItem('paintCanvas'); } catch {}
    initCanvas(payload);
  };

  // --- 채널 A: localStorage/sessionStorage 폴링 (200ms × 80 = 16초) ---
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (canvas || payloadReceived || pollAttempts > 80) { clearInterval(pollTimer); return; }
    try {
      const raw = localStorage.getItem('paintCanvas') || sessionStorage.getItem('paintCanvas');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.dataURL) {
          clearInterval(pollTimer);
          consume(data, 'localStorage');
        }
      }
    } catch (err) { /* ignore */ }
  }, 200);

  // --- 채널 B: postMessage 수신 ---
  window.addEventListener('message', e => {
    if (canvas || payloadReceived) return;
    if (e.data?.type === 'paint:data' && e.data.payload) {
      consume(e.data.payload, 'postMessage');
    }
  });

  // opener 에게 ready 신호 반복 전송
  let readyAttempts = 0;
  const sendReady = () => {
    readyAttempts++;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'paint:ready' }, '*');
      }
    } catch (err) { console.warn('[paint] sendReady failed', err); }
  };
  sendReady();
  const readyTimer = setInterval(() => {
    if (canvas || payloadReceived || readyAttempts > 15) { clearInterval(readyTimer); return; }
    sendReady();
  }, 1000);

  // 상태 메시지 업데이트
  setTimeout(() => {
    if (canvas || payloadReceived) return;
    if (!window.opener || window.opener.closed) {
      emptyEl.innerHTML = '<b>overview</b> 또는 <b>index</b> 페이지에서<br><b>🎨 그림판</b> 버튼으로 열어주세요.';
    } else {
      emptyEl.textContent = '이미지 전송 지연 중… 잠시 기다려주세요.';
    }
  }, 3000);
  setTimeout(() => {
    if (canvas || payloadReceived) return;
    emptyEl.innerHTML = '⏳ 이미지 수신 중… <small>(대용량은 10~15초 소요)</small>';
  }, 8000);
  setTimeout(() => {
    if (canvas || payloadReceived) return;
    const openerOk = window.opener && !window.opener.closed;
    emptyEl.innerHTML = '❌ 이미지 전송 실패<br>' +
      '<small>opener: ' + (openerOk ? '연결됨' : '끊김') + '</small><br>' +
      '<small>localStorage·postMessage 모두 차단된 환경으로 보입니다.</small><br>' +
      '<small style="color:var(--blue-500)">💡 <b>로컬 서버 실행</b>을 권장합니다:<br>' +
      '<code>cd [폴더] && python -m http.server 8000</code><br>' +
      '후 <b>http://localhost:8000/</b> 로 접속</small>';
  }, 18000);
})();

function initCanvas(payload) {
  const emptyEl = document.getElementById('emptyState');
  try {
    if (typeof fabric === 'undefined') {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '⚠️ <b>fabric.js</b> 가 로드되지 않았습니다.<br>인터넷 연결 확인 후 페이지를 새로고침 해주세요.<br>(CDN: cdn.jsdelivr.net)';
      console.error('[paint] fabric is undefined');
      return;
    }
    emptyEl.style.display = 'none';
    const sourceInfo = document.getElementById('sourceInfo');
    if (sourceInfo) sourceInfo.textContent = `${payload.source} · ${new Date(payload.capturedAt).toLocaleString('ko-KR')}`;

    canvas = new fabric.Canvas('paintCanvas', {
      width: payload.w, height: payload.h,
      selection: true, preserveObjectStacking: true,
      backgroundColor: '#ffffff',
    });
    console.log('[paint] canvas initialized', payload.w, 'x', payload.h);

    fabric.Image.fromURL(payload.dataURL, img => {
      img.scaleToWidth(payload.w);
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
      recordHistory();
    });

    bindTools();
    bindProperties();
    bindHistoryAndSelect();
    bindExports();
    setTool('select');
  } catch (err) {
    console.error('[paint] initCanvas failed', err);
    emptyEl.style.display = '';
    emptyEl.innerHTML = '⚠️ 초기화 실패<br><small>' + (err.message || err) + '</small><br><small>콘솔(F12) 에러 메시지를 확인하세요</small>';
    canvas = null;
  }
}

// ============================================================
// M3: 도구 바인딩
// ============================================================
function bindTools() {
  document.querySelectorAll('.toolbox .tool').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sticker) {
        addSticker(btn.dataset.sticker);
        return;
      }
      setTool(btn.dataset.tool);
    });
  });

  // Canvas mouse events for drawing
  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);
  canvas.on('mouse:dblclick', onDblClick);

  // 객체 변경 시 히스토리
  canvas.on('object:added', () => { if (!historyPaused) recordHistory(); });
  canvas.on('object:modified', () => { if (!historyPaused) recordHistory(); });
  canvas.on('object:removed', () => { if (!historyPaused) recordHistory(); });
}

function setTool(name) {
  currentTool = name;
  document.querySelectorAll('.toolbox .tool').forEach(t => {
    t.classList.toggle('active', t.dataset.tool === name);
  });
  // 선택 모드 아닐 땐 모든 객체 선택 불가
  const isSelect = name === 'select';
  canvas.selection = isSelect;
  canvas.forEachObject(o => { o.selectable = isSelect; o.evented = isSelect; });
  canvas.defaultCursor = isSelect ? 'default' : 'crosshair';

  // Freehand pen 전용 모드
  canvas.isDrawingMode = (name === 'pen' || name === 'highlight');
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush.color = name === 'highlight' ? withOpacity(currentStroke, 0.35) : currentStroke;
    canvas.freeDrawingBrush.width = name === 'highlight' ? currentStrokeWidth * 6 : currentStrokeWidth;
  }

  // polyline 시작 시 포인트 배열 초기화
  if (name !== 'polyline') polylinePoints = [];
  if (name !== 'linkline') linkStart = null;

  canvas.renderAll();
}

function onMouseDown(opt) {
  if (canvas.isDrawingMode) return;  // pen/highlight 는 fabric 기본 처리
  const pt = canvas.getPointer(opt.e);
  startPt = pt;

  switch (currentTool) {
    case 'rect':
      drawingShape = new fabric.Rect({
        left: pt.x, top: pt.y, width: 0, height: 0,
        stroke: currentStroke, strokeWidth: currentStrokeWidth,
        fill: currentFill || 'transparent',
      });
      canvas.add(drawingShape);
      break;
    case 'circle':
      drawingShape = new fabric.Ellipse({
        left: pt.x, top: pt.y, rx: 0, ry: 0,
        stroke: currentStroke, strokeWidth: currentStrokeWidth,
        fill: currentFill || 'transparent', originX: 'left', originY: 'top',
      });
      canvas.add(drawingShape);
      break;
    case 'line':
      drawingShape = new fabric.Line([pt.x, pt.y, pt.x, pt.y], {
        stroke: currentStroke, strokeWidth: currentStrokeWidth,
      });
      canvas.add(drawingShape);
      break;
    case 'arrow':
      drawingShape = makeArrow(pt.x, pt.y, pt.x, pt.y);
      canvas.add(drawingShape);
      break;
    case 'highlight-box': // legacy, unused (highlight uses freeDraw)
      drawingShape = new fabric.Rect({
        left: pt.x, top: pt.y, width: 0, height: 0,
        fill: withOpacity(currentStroke, 0.3), stroke: '',
      });
      canvas.add(drawingShape);
      break;
    case 'text':
      {
        const t = new fabric.IText('텍스트', {
          left: pt.x, top: pt.y, fill: currentStroke, fontSize: currentFontSize,
          fontFamily: currentFont,
        });
        historyPaused = true;
        canvas.add(t).setActiveObject(t);
        t.enterEditing(); t.selectAll();
        historyPaused = false;
        setTool('select');
        recordHistory();
      }
      break;
    case 'bubble':
      addBubble(pt.x, pt.y);
      setTool('select');
      break;
    case 'polyline':
      polylinePoints.push({ x: pt.x, y: pt.y });
      if (polylinePoints.length >= 2) drawPolylinePreview();
      break;
    case 'linkline':
      // 첫 클릭: 시작점, 두 번째 클릭: 끝점 → 화살표 링크선
      if (!linkStart) { linkStart = { x: pt.x, y: pt.y }; toast('끝점 클릭'); }
      else {
        const line = makeArrow(linkStart.x, linkStart.y, pt.x, pt.y);
        canvas.add(line);
        linkStart = null;
        setTool('select');
      }
      break;
  }
}

function onMouseMove(opt) {
  if (!drawingShape || !startPt) return;
  const pt = canvas.getPointer(opt.e);
  switch (currentTool) {
    case 'rect':
      drawingShape.set({
        left: Math.min(startPt.x, pt.x), top: Math.min(startPt.y, pt.y),
        width: Math.abs(pt.x - startPt.x), height: Math.abs(pt.y - startPt.y),
      });
      break;
    case 'circle':
      drawingShape.set({
        left: Math.min(startPt.x, pt.x), top: Math.min(startPt.y, pt.y),
        rx: Math.abs(pt.x - startPt.x) / 2, ry: Math.abs(pt.y - startPt.y) / 2,
      });
      break;
    case 'line':
      drawingShape.set({ x2: pt.x, y2: pt.y });
      break;
    case 'arrow':
      updateArrow(drawingShape, startPt.x, startPt.y, pt.x, pt.y);
      break;
  }
  canvas.renderAll();
}
function onMouseUp() {
  if (drawingShape) {
    // 너무 작게 그린 도형 제거
    const bbox = drawingShape.getBoundingRect();
    if (bbox.width < 4 && bbox.height < 4) {
      historyPaused = true;
      canvas.remove(drawingShape);
      historyPaused = false;
    }
    drawingShape = null; startPt = null;
    if (['rect','circle','line','arrow'].includes(currentTool)) setTool('select');
  }
}
function onDblClick() {
  if (currentTool === 'polyline' && polylinePoints.length >= 2) {
    finalizePolyline();
  }
}

// ===== 화살표 (line + triangle head) =====
function makeArrow(x1, y1, x2, y2) {
  const group = new fabric.Group([], { lockScalingFlip: true });
  updateArrow(group, x1, y1, x2, y2);
  return group;
}
function updateArrow(group, x1, y1, x2, y2) {
  const line = new fabric.Line([x1, y1, x2, y2], {
    stroke: currentStroke, strokeWidth: currentStrokeWidth,
    originX: 'center', originY: 'center',
  });
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headSize = Math.max(10, currentStrokeWidth * 3);
  const head = new fabric.Triangle({
    left: x2, top: y2, width: headSize, height: headSize,
    fill: currentStroke, originX: 'center', originY: 'center',
    angle: (angle * 180 / Math.PI) + 90,
  });
  group._objects = [line, head];
  group.addWithUpdate();
  group.setCoords();
}

// ===== 말풍선 =====
function addBubble(x, y) {
  const text = new fabric.IText('메모', {
    fontSize: currentFontSize, fontFamily: currentFont, fill: '#111827',
    originX: 'center', originY: 'center',
  });
  const rect = new fabric.Rect({
    width: 140, height: 60, rx: 10, ry: 10,
    fill: '#fef3c7', stroke: currentStroke, strokeWidth: Math.max(1, currentStrokeWidth - 1),
    originX: 'center', originY: 'center',
  });
  const group = new fabric.Group([rect, text], {
    left: x, top: y, originX: 'center', originY: 'center',
  });
  canvas.add(group).setActiveObject(group);
}

// ===== 꺾은선 (polyline) =====
function drawPolylinePreview() {
  if (drawingShape) {
    historyPaused = true;
    canvas.remove(drawingShape);
    historyPaused = false;
  }
  drawingShape = new fabric.Polyline(polylinePoints, {
    stroke: currentStroke, strokeWidth: currentStrokeWidth, fill: '', selectable: false,
  });
  historyPaused = true;
  canvas.add(drawingShape);
  historyPaused = false;
  canvas.renderAll();
}
function finalizePolyline() {
  if (drawingShape) {
    drawingShape.selectable = true; drawingShape.evented = true;
    drawingShape = null;
  }
  polylinePoints = [];
  setTool('select');
  recordHistory();
}

// ===== 스티커 =====
function addSticker(emoji) {
  const center = canvas.getCenter();
  const text = new fabric.Text(emoji, {
    left: center.left, top: center.top, fontSize: 48,
    originX: 'center', originY: 'center',
  });
  canvas.add(text).setActiveObject(text);
  setTool('select');
}

// ============================================================
// M4: 속성 패널
// ============================================================
function bindProperties() {
  // 색상 swatches
  document.querySelectorAll('.color-swatches[data-prop="stroke"] .swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const c = sw.dataset.color || '#000000';
      currentStroke = c;
      document.getElementById('strokeColor').value = c.startsWith('#') ? c : '#000000';
      highlightSwatch('stroke', c);
      applyPropToSelected({ stroke: c });
      if (canvas.isDrawingMode) canvas.freeDrawingBrush.color = currentTool === 'highlight' ? withOpacity(c, 0.35) : c;
    });
  });
  document.querySelectorAll('.color-swatches[data-prop="fill"] .swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const c = sw.dataset.color;
      currentFill = c;
      highlightSwatch('fill', c);
      applyPropToSelected({ fill: c || 'transparent' });
    });
  });
  document.getElementById('strokeColor').addEventListener('input', e => {
    currentStroke = e.target.value;
    applyPropToSelected({ stroke: currentStroke });
  });
  document.getElementById('fillColor').addEventListener('input', e => {
    currentFill = e.target.value;
    applyPropToSelected({ fill: currentFill });
  });
  document.getElementById('strokeWidth').addEventListener('input', e => {
    currentStrokeWidth = +e.target.value;
    document.getElementById('strokeWidthVal').textContent = currentStrokeWidth;
    applyPropToSelected({ strokeWidth: currentStrokeWidth });
    if (canvas.isDrawingMode) {
      canvas.freeDrawingBrush.width = currentTool === 'highlight' ? currentStrokeWidth * 6 : currentStrokeWidth;
    }
  });
  document.getElementById('fontFamily').addEventListener('change', e => {
    currentFont = e.target.value;
    applyPropToSelected({ fontFamily: currentFont });
  });
  document.getElementById('fontSize').addEventListener('input', e => {
    currentFontSize = +e.target.value;
    document.getElementById('fontSizeVal').textContent = currentFontSize;
    applyPropToSelected({ fontSize: currentFontSize });
  });

  highlightSwatch('stroke', currentStroke);
}
function highlightSwatch(group, color) {
  document.querySelectorAll(`.color-swatches[data-prop="${group}"] .swatch`).forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === color);
  });
}
function applyPropToSelected(props) {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  objs.forEach(o => {
    if (o.type === 'group' && o._objects) {
      o._objects.forEach(sub => sub.set(props));
    } else {
      o.set(props);
    }
  });
  canvas.requestRenderAll();
  recordHistory();
}
function withOpacity(hex, a) {
  if (hex.startsWith('rgba')) return hex;
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ============================================================
// M5: 히스토리·선택 조작
// ============================================================
function bindHistoryAndSelect() {
  document.getElementById('undoBtn').onclick = undo;
  document.getElementById('redoBtn').onclick = redo;
  document.getElementById('clearBtn').onclick = clearShapes;
  document.getElementById('restoreBtn').onclick = restoreOriginal;
  document.getElementById('delBtn').onclick = deleteSelected;
  document.getElementById('dupBtn').onclick = duplicateSelected;
  document.getElementById('bringFrontBtn').onclick = () => { canvas.getActiveObjects().forEach(o => canvas.bringToFront(o)); recordHistory(); };
  document.getElementById('sendBackBtn').onclick = () => { canvas.getActiveObjects().forEach(o => canvas.sendToBack(o)); recordHistory(); };

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (canvas.getActiveObject()?.isEditing) return; // IText 편집 중
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); duplicateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (canvas.getActiveObjects().length) { e.preventDefault(); deleteSelected(); }
    } else if (e.key === 'Escape') {
      canvas.discardActiveObject(); canvas.renderAll(); setTool('select');
    } else {
      // Hotkeys
      const keyMap = { v:'select', r:'rect', c:'circle', a:'arrow', l:'line', t:'text', p:'pen', h:'highlight' };
      const t = keyMap[e.key.toLowerCase()];
      if (t) setTool(t);
    }
  });
}

function recordHistory() {
  if (!canvas) return;
  const json = JSON.stringify(canvas.toJSON(['lockScalingFlip']));
  // history 는 future를 자르고 이어감
  historyStack.splice(historyIdx + 1);
  historyStack.push(json);
  if (historyStack.length > 30) historyStack.shift();
  historyIdx = historyStack.length - 1;
}
function undo() {
  if (historyIdx <= 0) { toast('되돌릴 수 없음'); return; }
  historyIdx--; loadHistory(historyStack[historyIdx]);
}
function redo() {
  if (historyIdx >= historyStack.length - 1) { toast('다시 할 수 없음'); return; }
  historyIdx++; loadHistory(historyStack[historyIdx]);
}
function loadHistory(json) {
  historyPaused = true;
  canvas.loadFromJSON(json, () => {
    canvas.renderAll();
    historyPaused = false;
  });
}
function deleteSelected() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  objs.forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
}
function duplicateSelected() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  canvas.discardActiveObject();
  objs.forEach(o => {
    o.clone(c => {
      c.set({ left: o.left + 20, top: o.top + 20 });
      canvas.add(c);
      canvas.setActiveObject(c);
    });
  });
}
function clearShapes() {
  if (!confirm('그려진 도형을 모두 지웁니다. (배경은 유지)')) return;
  const bg = canvas.backgroundImage;
  canvas.getObjects().slice().forEach(o => canvas.remove(o));
  canvas.backgroundImage = bg;
  canvas.renderAll();
  recordHistory();
  toast('도형 지움');
}
function restoreOriginal() {
  if (!confirm('원본 캡처로 복원하시겠습니까? (현재 도형 모두 삭제)')) return;
  const payload = JSON.parse(sessionStorage.getItem('paintCanvas') || 'null');
  if (!payload) { toast('원본 없음'); return; }
  canvas.getObjects().slice().forEach(o => canvas.remove(o));
  fabric.Image.fromURL(payload.dataURL, img => {
    img.scaleToWidth(payload.w);
    canvas.setBackgroundImage(img, () => { canvas.renderAll(); recordHistory(); toast('원본 복원됨'); });
  });
}

// ============================================================
// M6: 내보내기 (PNG / Clipboard / PDF)
// ============================================================
function bindExports() {
  document.getElementById('exportPngBtn').onclick = exportPNG;
  document.getElementById('exportClipBtn').onclick = exportClipboard;
  document.getElementById('exportPdfBtn').onclick = exportPDF;
}
function renderFullDataURL() {
  canvas.discardActiveObject();
  canvas.renderAll();
  return canvas.toDataURL({ format: 'png', quality: 0.95, multiplier: 1 });
}
function exportPNG() {
  const dataURL = renderFullDataURL();
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `보장마크업_${new Date().toISOString().slice(0,10)}.png`;
  a.click();
  toast('PNG 저장됨');
}
async function exportClipboard() {
  const dataURL = renderFullDataURL();
  try {
    const blob = await (await fetch(dataURL)).blob();
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('클립보드에 복사됨 — Ctrl+V 로 붙여넣기');
    } else { throw new Error('Clipboard API 미지원'); }
  } catch (err) {
    console.error(err);
    toast('클립보드 복사 실패 — PNG 다운로드로 대체');
    exportPNG();
  }
}
function exportPDF() {
  if (!window.jspdf) { toast('jsPDF 로드 실패'); return; }
  const dataURL = renderFullDataURL();
  const { jsPDF } = window.jspdf;
  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
  // A4: 210×297mm. 이미지 비율에 맞춰 스케일
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  let w = pw, h = pw / ratio;
  if (h > ph) { h = ph; w = ph * ratio; }
  const x = (pw - w) / 2, y = (ph - h) / 2;
  pdf.addImage(dataURL, 'PNG', x, y, w, h);
  pdf.save(`보장마크업_${new Date().toISOString().slice(0,10)}.pdf`);
  toast('PDF 저장됨');
}
