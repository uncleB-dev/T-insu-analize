# paint-minimal — Plan

- **Feature**: paint-minimal
- **Created**: 2026-04-25
- **Phase**: Plan
- **Level**: Starter
- **Supersedes**: `paint-tui.plan.md`, `paint.plan.md`

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | TUI Image Editor 기반 그림판은 (1) 9개 메뉴 중 4개만 필요해 오버킬, (2) 자체 UI/Theme 시스템과 우리 Toss 디자인 충돌로 반복 버그, (3) 모듈 비대(2.5MB+)로 file:// 환경 안정성 흔들림. |
| **Solution** | TUI 완전 폐기. **Konva.js (152KB, MIT)** 위에서 영업 현장에 꼭 필요한 4개 도구(직선·사각형·형광펜·이모지)만 직접 구현. UI 100% Toss 디자인 자체 제작. |
| **Function UX** | Toss 헤더 1행에 [도구 4개] + [색상 팔레트] + [Undo/Redo/Delete] + [📋📄✕]. 선택→이동→크기조절→삭제(L3) 풀 편집. 이모지 5종 64px 기본 삽입 후 자유 변형. |
| **Core Value** | 라이브러리 의존도 70% 감소 (2.5MB → 0.15MB). 코드 1,000+ → 500 lines 이하. 영업 현장에서 5초 안에 강조 마크업 완료. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | 보장표 마크업은 "빨간 사각형으로 강조 / 형광펜으로 칠하기 / ⭐ 표시" 4가지 액션이 95%. TUI의 다양한 기능은 오히려 방해 요소이고 반복 버그 원인. |
| **WHO** | 보장표 캡처 후 카카오톡/이메일로 공유하는 보험 컨설턴트. 마크업은 30초 안에 끝나야 함. |
| **RISK** | Konva 학습 곡선 (저희 팀 첫 사용) / Hit detection 회전 시 좌표 변환 버그 / 캡처 dataURL 8000px 한계는 기존 로직 그대로 유지 |
| **SUCCESS** | 4개 도구만 노출 / 7가지 색상 팔레트 / 선택→이동/크기조절/삭제 동작 / Undo/Redo / 캡처 → 편집 → 클립보드 한 번에 30초 이내 |
| **SCOPE** | paint.html/js/css 완전 재작성 + Konva CDN 추가 + TUI/fabric/jsPDF CDN 제거 검토 + paint-capture.js 유지 |

## 1. Requirements

### 1.1 Functional

#### F1. 도구 4종
| ID | 도구 | 색상 | 두께 | 동작 |
|----|------|------|------|------|
| T1 | **직선** | 9색 (7무지개 + 검정 + 흰색) | 3px (고정) | 드래그 시작점 → 끝점 |
| T2 | **사각형** | 9색 | 3px (고정, 외곽선만) | 드래그 영역 그리기 |
| T3 | **형광펜** | 7무지개 색 | 22px (고정), opacity 0.4 | 드래그로 자유곡선 |
| T4 | **이모지** | - | 64px (기본) | 클릭 시 캔버스 중앙 삽입, 이후 자유 변형 |

#### F2. 색상 팔레트
- **무지개 7색**: 🔴 `#E53935` 🟠 `#FB8C00` 🟡 `#FDD835` 🟢 `#43A047` 🔵 `#1E88E5` 🟣 `#3949AB` 💜 `#8E24AA`
- **확장 2색**: ⚫ `#000000` ⚪ `#FFFFFF`
- 직선/사각형은 9색 모두, 형광펜은 7색만

#### F3. 이모지 5종
✅ ❗ ⭐ 👉 📌

#### F4. 객체 편집 (L3 — Full)
- **선택**: 빈 영역 클릭 시 해제, 도형 클릭 시 선택
- **이동**: 드래그
- **크기조절**: 모서리 8개 핸들 + 회전 핸들
- **삭제**: Del / Backspace 키 또는 🗑 버튼
- **다중 선택**: Shift+클릭 (옵션, 1차 출시 후 결정)

#### F5. 히스토리
- **Undo**: Ctrl+Z (최소 30 스텝)
- **Redo**: Ctrl+Shift+Z / Ctrl+Y
- **Clear**: 🧹 버튼 (확인 다이얼로그)

#### F6. 내보내기
- **PNG 다운로드**: 💾 PNG 또는 Ctrl+S
- **클립보드 복사**: 📋 (ClipboardItem API)
- **PDF 저장**: 📄 (jsPDF 유지 — 1페이지)

#### F7. 캡처 입력
- 기존 `paint-capture.js` (`window.openPaintTab`) 그대로 사용
- localStorage `paintCapture` 키에서 dataURL 읽어 Konva.Image 배경으로 로드

### 1.2 Non-Functional
- **번들 크기**: 추가 CDN ≤ 200KB (Konva 152KB)
- **성능**: 도형 추가/이동 60fps 유지, 객체 100개 이내
- **호환성**: Chrome/Edge/Safari 최신, file:// 동작
- **유지보수**: 코드 500 lines 이하 / 단일 IIFE

### 1.3 제거되는 의존성
- ❌ `tui-image-editor` CDN (CSS+JS)
- ❌ `tui-color-picker` CDN
- ❌ `tui-code-snippet` CDN
- ❌ `fabric.js` CDN (TUI 의존이므로 함께 제거)
- ✅ 유지: `html2canvas` (캡처), `jsPDF` (PDF)
- ✅ 추가: `konva.js` (152KB, MIT)

## 2. Architecture — Selected: Konva.js (Option A)

### 2.1 비교 결과
사용자 결정 (요구사항 단계):
- **Option A — Konva.js raw** ✅ 선택됨
- 이유: 152KB / API 깔끔 / Scene Graph + Hit Detection + Transformer 내장 / GitHub ⭐10k+

### 2.2 파일 구조
```
baek/
├── paint.html      [재작성]  Toss 헤더 + Konva Stage div + 색상/도구 팔레트
├── paint.js        [재작성]  Konva 통합 + 4개 도구 핸들러 + Undo/Redo + Export
├── paint.css       [재작성]  Toss UI (헤더 + 도구 그룹 + 색 swatch)
├── paint-capture.js [유지]  기존 캡처 → localStorage → 새 탭 로직
└── (제거: tui-image-editor 관련 모든 CDN/CSS)
```

### 2.3 Konva 구조 설계
```
Konva.Stage (전체 캔버스)
├── Layer "background" — 캡처 이미지 (Konva.Image, listening=false)
├── Layer "draw" — 사용자가 그린 도형 (Rect/Line/Path/Text)
└── Layer "ui" — Transformer (선택 핸들, 항상 최상단)
```

### 2.4 데이터 흐름
```
overview.html / index.html
  ↓ 🎨 클릭 (paint-capture.js — 기존)
html2canvas → dataURL → localStorage["paintCapture"]
  ↓ window.open('paint.html')
paint.html boot:
  ↓ Konva.Stage 생성 (캡처 크기와 동일)
  ↓ Konva.Image(dataURL) → background layer
  ↓ Toss 헤더 도구 바인딩 (선택/직선/사각형/형광펜/이모지)
  사용자 편집 ↻ Undo/Redo 스택 (각 add/modify/remove 마다 스냅샷)
  ↓ Export: stage.toDataURL({pixelRatio:1}) → PNG/PDF/Clipboard
```

### 2.5 색상 팔레트 도메인
```js
const PALETTE_FULL = [   // 직선/사각형용 9색
  { name: '빨강',   c: '#E53935' },
  { name: '주황',   c: '#FB8C00' },
  { name: '노랑',   c: '#FDD835' },
  { name: '초록',   c: '#43A047' },
  { name: '파랑',   c: '#1E88E5' },
  { name: '남색',   c: '#3949AB' },
  { name: '보라',   c: '#8E24AA' },
  { name: '검정',   c: '#000000' },
  { name: '흰색',   c: '#FFFFFF' },
];
const PALETTE_RAINBOW = PALETTE_FULL.slice(0, 7);  // 형광펜용 7색
```

## 3. UI Layout (Toss 디자인 유지)

```
┌─ Toss 헤더 (56px, 단일 행) ──────────────────────────────────────────────────┐
│ [Logo][그림판][src] │ ↶ ↷ │ 🗑Sel 🗑All │ ⬚ 직선 ▭사각형 🖍형광펜 │ ●●●●●●●●●  │
│                                                                              │
│                                  도구 그룹    팔레트(컨텍스트)               │
│                                                                              │
│                                                     │ ✅❗⭐👉📌 │ 📋 📄 ✕ │
└──────────────────────────────────────────────────────────────────────────────┘
                            ↓ 도구 클릭 시
┌─ 컨텍스트 팔레트 행 (40px, 도구 따라 변경) ─────────────────────────────────┐
│  현재 도구: 사각형  │  색상: 🔴 🟠 🟡 🟢 🔵 🟣 💜 ⚫ ⚪                       │
└──────────────────────────────────────────────────────────────────────────────┘
                            ↓
┌─ Konva Stage (캡처 이미지 배경 + 도형 레이어) ──────────────────────────────┐
│                                                                              │
│              [편집 영역]                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Note**: 색상 팔레트는 컨텍스트 적응형 — 도구 따라 9색 또는 7색 노출. 형광펜은 7색만.

## 4. Implementation Guide

### 4.1 Module Map
| 모듈 | 파일 | 역할 | LOC 예상 |
|------|------|------|---------|
| M1 | paint.html | DOM 뼈대 (헤더 + 팔레트 행 + Stage div) | 100 |
| M2 | paint.css | Toss 헤더 + 도구/팔레트 + 토스트 | 200 |
| M3 | paint.js — boot | localStorage 로드, Konva Stage 초기화, 배경 | 80 |
| M4 | paint.js — tools | 직선/사각형/형광펜 도구 마우스 핸들러 | 120 |
| M5 | paint.js — emoji | 이모지 5종 클릭 → 텍스트 노드 추가 | 30 |
| M6 | paint.js — select | Transformer + 선택/삭제/단축키 | 80 |
| M7 | paint.js — history | Undo/Redo (snapshot 기반 30 스텝) | 50 |
| M8 | paint.js — export | PNG/Clipboard/PDF | 60 |

### 4.2 권장 세션 분할
- **Session 1 (M1~M3)**: HTML/CSS 뼈대 + Konva 부팅 + 배경 이미지 (가장 먼저 동작 확인)
- **Session 2 (M4+M5)**: 도구 4종 + 이모지
- **Session 3 (M6~M8)**: 선택/Transformer + Undo/Redo + Export 마감

### 4.3 핵심 코드 스케치

#### paint.html
```html
<header class="paint-header">
  <a class="brand" href="index.html"><img .../></a>
  <h1>그림판</h1>
  <span id="sourceInfo"></span>

  <div class="tg history">
    <button data-act="undo" title="되돌리기 (Ctrl+Z)">↶</button>
    <button data-act="redo" title="다시하기 (Ctrl+Y)">↷</button>
  </div>
  <div class="tg destructive">
    <button data-act="delete" title="선택삭제 (Del)">🗑</button>
    <button data-act="clear" title="모두지우기">🧹</button>
  </div>

  <div class="tg tools">
    <button data-tool="select"     class="active">↖</button>
    <button data-tool="line">⃫</button>
    <button data-tool="rect">▭</button>
    <button data-tool="highlight">🖍</button>
  </div>

  <div class="tg palette" id="palette"><!-- JS가 채움 --></div>

  <div class="tg emojis">
    <button data-emoji="✅">✅</button>
    <button data-emoji="❗">❗</button>
    <button data-emoji="⭐">⭐</button>
    <button data-emoji="👉">👉</button>
    <button data-emoji="📌">📌</button>
  </div>

  <div class="spacer"></div>
  <button id="clipBtn">📋</button>
  <button id="pdfBtn">📄</button>
  <button id="closeBtn" class="danger">✕</button>
</header>
<div id="stage-wrap"><div id="stage"></div></div>

<script src="https://cdn.jsdelivr.net/npm/konva@9.3.6/konva.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<script src="paint.js"></script>
```

#### paint.js (요약)
```js
(function () {
  const data = JSON.parse(localStorage.getItem('paintCapture') || 'null');
  if (!data) { showEmpty(); return; }

  // ----- Stage -----
  const stage = new Konva.Stage({
    container: 'stage', width: data.w, height: data.h,
  });
  const bgLayer = new Konva.Layer({ listening: false });
  const drawLayer = new Konva.Layer();
  const uiLayer = new Konva.Layer();
  stage.add(bgLayer, drawLayer, uiLayer);

  // 배경
  const img = new Image();
  img.onload = () => {
    const k = new Konva.Image({ image: img, width: data.w, height: data.h });
    bgLayer.add(k); bgLayer.draw();
    fitStageToWindow(); // 자동 화면 맞춤
  };
  img.src = data.dataURL;

  // ----- Transformer (선택 핸들) -----
  const tr = new Konva.Transformer({
    rotateEnabled: true, anchorSize: 10,
    anchorStroke: '#3182F6', anchorFill: '#fff', anchorCornerRadius: 4,
    borderStroke: '#3182F6', borderDash: [4, 4],
  });
  uiLayer.add(tr);

  // ----- 상태 -----
  let tool = 'select';
  let color = '#E53935';
  let drawing = null; // 그리는 중인 임시 도형

  // ----- 도구 핸들러 -----
  stage.on('mousedown touchstart', (e) => {
    if (tool === 'select') {
      const clickedOnEmpty = e.target === stage || e.target.attrs?.name === 'background-image';
      if (clickedOnEmpty) tr.nodes([]);
      else tr.nodes([e.target]);
      return;
    }
    const p = stage.getPointerPosition();
    if (tool === 'line') {
      drawing = new Konva.Line({ points: [p.x, p.y, p.x, p.y], stroke: color, strokeWidth: 3, lineCap: 'round', draggable: false });
    } else if (tool === 'rect') {
      drawing = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: color, strokeWidth: 3, fill: 'transparent', draggable: false });
    } else if (tool === 'highlight') {
      drawing = new Konva.Line({ points: [p.x, p.y], stroke: color, strokeWidth: 22, lineCap: 'round', lineJoin: 'round', opacity: 0.4, tension: 0.2, draggable: false });
    }
    if (drawing) drawLayer.add(drawing);
  });
  stage.on('mousemove touchmove', () => {
    if (!drawing) return;
    const p = stage.getPointerPosition();
    if (tool === 'line') drawing.points([drawing.points()[0], drawing.points()[1], p.x, p.y]);
    else if (tool === 'rect') drawing.size({ width: p.x - drawing.x(), height: p.y - drawing.y() });
    else if (tool === 'highlight') drawing.points([...drawing.points(), p.x, p.y]);
    drawLayer.batchDraw();
  });
  stage.on('mouseup touchend', () => {
    if (!drawing) return;
    drawing.draggable(true);
    pushHistory();
    drawing = null;
    setTool('select'); // 한 번 그리면 선택 모드로 자동 복귀
  });

  // ----- 이모지 -----
  document.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => {
    const t = new Konva.Text({
      x: stage.width()/2 - 32, y: stage.height()/2 - 32,
      text: b.dataset.emoji, fontSize: 64, fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
      draggable: true,
    });
    drawLayer.add(t); pushHistory();
    setTool('select'); tr.nodes([t]);
  });

  // ----- Undo/Redo (JSON snapshot) -----
  const history = []; let hIdx = -1;
  function pushHistory() {
    history.splice(hIdx + 1);
    history.push(drawLayer.toJSON());
    if (history.length > 30) history.shift();
    hIdx = history.length - 1;
  }
  function undo() { if (hIdx <= 0) return; hIdx--; loadSnap(history[hIdx]); }
  function redo() { if (hIdx >= history.length - 1) return; hIdx++; loadSnap(history[hIdx]); }
  function loadSnap(json) {
    drawLayer.destroyChildren();
    Konva.Node.create(json, drawLayer); // 신중: drawLayer를 다시 만들면 stage 참조 깨짐
    drawLayer.draw(); tr.nodes([]);
  }
  // (실제 구현은 stage.toJSON 기반으로 더 안전하게 — 상세는 Do 단계에서)

  // ----- 키보드 -----
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y') { e.preventDefault(); redo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const nodes = tr.nodes();
      if (nodes.length) { e.preventDefault(); nodes.forEach(n => n.destroy()); tr.nodes([]); pushHistory(); drawLayer.draw(); }
    }
  });

  // ----- Export -----
  document.getElementById('clipBtn').onclick = async () => {
    tr.nodes([]); drawLayer.draw();
    const blob = await stageToBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('클립보드 복사됨');
  };
  // ... PNG, PDF 동일 패턴

  // ----- 도구 선택 / 색상 팔레트 / Toss UI 바인딩 -----
  // (Do 단계에서 상세 구현)
})();
```

### 4.4 Konva 학습 포인트
1. **Layer 분리**: bg/draw/ui 3-layer로 성능과 z-index 보장
2. **Transformer**: 선택 시 `tr.nodes([target])` 한 줄
3. **toJSON / Konva.Node.create**: Undo/Redo의 핵심
4. **opacity / tension**: 형광펜 효과는 Line + opacity:0.4 + tension:0.2 (부드러운 곡선)
5. **stage.scale + draggable**: 줌/팬은 1차 출시에서 보류 (필요시 추가)

## 5. Success Criteria

1. [ ] **SC-1** 4개 도구만 노출 (직선/사각형/형광펜/이모지) — Crop/Flip/Rotate 등 흔적 없음
2. [ ] **SC-2** 색상 팔레트: 직선/사각형 9색, 형광펜 7색 (도구 따라 컨텍스트 변경)
3. [ ] **SC-3** 직선·사각형 두께 3px **고정** (UI에 두께 슬라이더 없음)
4. [ ] **SC-4** 형광펜 두께 22px + opacity 0.4
5. [ ] **SC-5** 이모지 5종 (✅❗⭐👉📌) 클릭 시 64px 캔버스 중앙 삽입
6. [ ] **SC-6** 모든 객체 선택 → 이동 → 크기조절 → 회전 → 삭제 (Transformer)
7. [ ] **SC-7** Undo/Redo (Ctrl+Z / Ctrl+Y) 30 스텝
8. [ ] **SC-8** Del/Backspace로 선택 객체 삭제
9. [ ] **SC-9** 📋 클립보드 / 💾 PNG / 📄 PDF 3종 내보내기
10. [ ] **SC-10** TUI/fabric 의존성 0 — `tui-image-editor`, `fabric.js`, `tui-color-picker`, `tui-code-snippet` CDN 없음
11. [ ] **SC-11** Konva CDN 1개만 추가 (152KB), 총 추가 의존성 ≤200KB
12. [ ] **SC-12** 코드 라인 수 ≤500 lines (paint.js 기준)

## 6. Risks & Mitigations

| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | Konva 처음 사용 — 학습 곡선 | 공식 docs 의 5-min tutorial 따라가기. Stage/Layer/Node/Transformer 4개 개념만 익히면 충분 |
| R2 | 큰 캡처 이미지 (8000px) Konva.Image 메모리 | 기존 캡처 scale 자동 조정 로직 유지 (paint-capture.js 변경 없음) |
| R3 | Undo/Redo의 toJSON 직렬화/역직렬화 시 이미지 노드 손상 | drawLayer만 직렬화하고 bgLayer는 건드리지 않음. 직렬화 검증 테스트 |
| R4 | 형광펜 선이 끊어짐 (단순 line 연결 한계) | `lineCap: round` + `lineJoin: round` + `tension: 0.2` 로 부드러운 곡선 |
| R5 | Transformer rotation 후 좌표계 꼬임 | Konva 내장 처리 — 직접 좌표 계산 안 함 |
| R6 | 클립보드 API 미지원 브라우저 | try/catch → PNG 다운로드 폴백 (기존 동일) |
| R7 | konva CDN 다운 | jsdelivr/cdnjs 두 곳 fallback (`<script>` 동적 onerror 재시도) |
| R8 | 색상 팔레트 도구 따라 변경 시 깜빡임 | 9색 영역 항상 렌더하고 형광펜일 땐 마지막 2개 `display:none` 처리 (DOM 안정성) |

## 7. Out of Scope

- 줌/팬 (1차 출시 후 추가 검토)
- 다중 선택 (Shift+클릭)
- 도형 두께 사용자 조정
- 텍스트(글자) 도구 — 이모지로 충분
- 도형 채우기 색상 (사각형은 외곽선만)
- 이미지 크롭/회전/플립 (TUI에 있던 기능 — 영업용 마크업엔 불필요)
- 레이어 관리 UI
- 로컬 파일 저장(Save File API)
- 협업 편집

## 8. Migration Plan (이전 코드 정리)

### 8.1 제거되는 파일/코드
- `paint.html` — 전면 재작성
- `paint.js` — 전면 재작성 (TUI 의존 0)
- `paint.css` — 전면 재작성

### 8.2 제거되는 CDN
```html
<!-- 모두 삭제 -->
<link href=".../tui-color-picker.css">
<link href=".../tui-image-editor.css">
<script src=".../fabric@4.2.0/fabric.min.js"></script>
<script src=".../tui-code-snippet@v1.5.2/...js"></script>
<script src=".../tui-color-picker@v2.2.8/...js"></script>
<script src=".../tui-image-editor@v3.15.2/...js"></script>
```

### 8.3 추가되는 CDN
```html
<script src="https://cdn.jsdelivr.net/npm/konva@9.3.6/konva.min.js"></script>
<!-- jsPDF는 PDF 저장용으로 유지 -->
```

### 8.4 유지되는 파일
- `paint-capture.js` — 캡처 로직 (변경 0)
- `index.html`, `overview.html` — `openPaintTab` 핸들러 그대로

## 9. Rollback Plan

문제 발생 시:
- `git revert {commit}` 또는 직전 태그로 되돌리기
- 이전 fabric/TUI 구현 복구하지 않음 — 우리 결론은 "TUI는 영구 제거"

---

## 다음 단계

대표님 확인 후 **`/pdca design paint-minimal`** 으로 Design 단계 들어가거나, 단순한 구조라 Design 생략하고 바로 **`/pdca do paint-minimal`** 진행 가능합니다.

**제 추천**: 이 정도 단순한 기능이면 Design 생략하고 바로 Do 단계 들어가서 Session 1 (HTML+CSS+부팅)부터 구현 시작 → 동작 확인 후 Session 2/3 진행. 시간 절약됩니다.
