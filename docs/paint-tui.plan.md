# paint-tui — Plan

- **Feature**: paint-tui
- **Created**: 2026-04-25
- **Phase**: Plan
- **Level**: Starter
- **Supersedes**: `paint.plan.md` (fabric.js 직접 구현)

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 현재 fabric.js 직접 구현 그림판은 (1) overview 대형 테이블 캡처 시 canvas 크기 한계 초과로 배경 로드 실패, (2) 자체 구현한 줌/툴 바인딩이 브라우저별로 깨지는 엣지케이스 반복, (3) 자체 UI 라이프사이클 관리 코드 과다로 유지보수 부담 증가. |
| **Solution** | Chrome 확장 ScreenShot Tool 과 동일한 **TUI Image Editor** (NHN Cloud 오픈소스, MIT, 수백만 사용자 검증) 로 편집기 교체. 자체 구현한 paint-overlay.js/paint.js 의 툴/줌/히스토리/내보내기 로직을 모두 라이브러리 내장 기능으로 치환. |
| **Function UX** | 기존 플로 유지(🎨 버튼 → 캡처 → 편집) + TUI 내장 기능: Crop, Flip, Rotate, Draw(자유곡선·직선), Shape(사각·원·삼각), Icon(화살표·별·말풍선 등 10+), Text, Mask, Filter + 빌트인 Zoom, Undo/Redo, Download. |
| **Core Value** | 자체 코드 1,000+ lines → 200 lines 이하 (80% 감소). 엣지케이스 버그 체감 제로화 — 라이브러리가 이미 해결한 문제를 다시 풀지 않음. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | fabric.js 직접 구현의 반복 에러(줌 깨짐·대형 캡처 실패·브라우저 편차)가 영업 현장 업무 흐름을 방해. 검증된 라이브러리로 교체해 안정성 확보. |
| **WHO** | 태블릿·데스크톱에서 보장표 마크업 후 카카오톡/이메일로 고객에게 공유하는 보험 컨설턴트. |
| **RISK** | TUI UI 테마가 Toss 디자인 시스템과 정확히 일치하지 않음 / 라이브러리 의존 버전 충돌 (fabric v4 vs v5) / 탭 간 대용량 dataURL 전달 방식 (sessionStorage 공유 불가). |
| **SUCCESS** | 🎨 → 3초 내 TUI 편집기 노출, overview 50+ 상품 캡처 시에도 배경 이미지 정상 표시, 줌/도구/Undo/Download 모두 라이브러리 기본 동작으로 에러 없음. |
| **SCOPE** | paint.html/js/css 전면 재작성 + paint-overlay.js/css 제거 + paint-capture.js 유지(캡처 로직만) + overview/index 의 🎨 핸들러를 "새 탭 열기" 방식으로 되돌림. |

## 1. Requirements

### 1.1 Functional

**유지되는 기존 기능**
1. **🎨 그림판 버튼** — overview.html / index.html 상단 헤더에 배치 (이미 존재)
2. **자동 캡처** — `html2canvas` 로 현재 화면 PNG dataURL 생성 (이미 존재)
3. **전달 메커니즘** — localStorage 로 dataURL + 메타 저장 후 `window.open('paint.html')`
4. **Undo/Redo, 도형 그리기, 텍스트, 아이콘, 내보내기** — 전부 TUI 내장 기능 사용

**TUI Image Editor 내장으로 확보되는 기능**
5. **Crop** (영역 자르기) — 기존 자체 구현에 없던 기능 추가
6. **Flip / Rotate** — 기존 자체 구현에 없던 기능 추가
7. **빌트인 Zoom** — 마우스 휠은 브라우저 스크롤 유지(충돌 없음), 하단 UI로 줌 조작
8. **도형** — Rectangle / Circle / Triangle
9. **아이콘** — Arrow, Heart, Star, Location, Polygon, Bubble 등 10+ 프리셋
10. **Text** — 폰트·크기·색상·정렬·스타일(굵게/기울임)
11. **Draw** — Free / Straight line
12. **Filter** — Grayscale, Invert, Sepia, Blur, Sharpen 등 (선택적 노출)
13. **Mask** — 필요 시 노출, 기본 숨김 가능
14. **Copy / Download** — 버튼 1개로 PNG 저장, Clipboard API 는 별도 버튼으로 추가

**추가 맞춤 버튼 (TUI 위에 얹는 얇은 래퍼)**
15. **📋 클립보드 복사** — TUI 기본 메뉴에 없으므로 `instance.toDataURL()` → `ClipboardItem` 으로 처리
16. **📄 PDF 저장** — jsPDF 로 한 페이지 PDF 생성 (선택적, 요구 시)
17. **← 돌아가기** — 창 닫기

### 1.2 Non-Functional
- 의존성: TUI Image Editor CSS/JS + tui-color-picker + tui-code-snippet + fabric v4.2.0 (TUI 번들 포함 버전 사용 권장)
- 성능: 편집기 초기 로드 3초 이내, 도형 조작 60fps
- 해상도: 캡처는 `scale` 자동 조정 로직 유지 (canvas 8000px 상한)
- 브라우저: Chrome/Edge/Safari 최신

### 1.3 제거되는 파일
- `paint-overlay.js` — 자체 오버레이 DOM + 툴 바인딩 (전체)
- `paint-overlay.css` — 자체 오버레이 스타일 (전체)
- 기존 `paint.js` — 자체 fabric 직접 구현 (전면 재작성)
- 기존 `paint.css` — 자체 UI 스타일 (TUI 테마 커스텀으로 대체)

## 2. Architecture — 3 Options

| 옵션 | 설명 | 장점 | 단점 | 채택 |
|---|---|---|---|---|
| **A. 오버레이 유지 + TUI 내장** | 현재 overlay 구조 안에 TUI 에디터를 iframe/div로 삽입 | 기존 UX(새 탭 없음) 유지 | TUI DOM 이 overlay 안에 갇혀 리사이즈 이벤트 충돌 가능, 3-way 이벤트 전파 복잡 | ❌ |
| **B. TUI 기본 UI 100% 사용, paint.html 단순 래퍼** | 기존 paint.html 을 TUI 표준 container 하나만 두고 최소 wrapping | 코드 최소, 버그 가능성 최소, 라이브러리 업그레이드 자유 | Toss 디자인과 시각적 거리감 | ⭐ **추천** |
| **C. TUI + 얇은 커스텀 헤더** | TUI 에디터 위에 상단에 Toss 스타일 헤더(로고/닫기/클립보드/PDF)만 추가 | 디자인 일관성 + 기능 보강 | 약간의 CSS 오버라이드 필요 | ✅ **채택** |

**선택 이유 (Option C)**: 기존 Toss UI 재정비를 완료한 만큼 그림판만 튀지 않도록 상단 얇은 헤더는 유지. 그 아래는 TUI 표준 UI 그대로 — 검증된 영역은 건드리지 않는다.

### 2.1 파일 구조 (변경 후)
```
baek/
├── index.html, overview.html           (기존, 🎨 핸들러만 "새 탭 열기" 로 복귀)
├── paint.html   [재작성]  TUI 에디터 래퍼 + 상단 Toss 헤더
├── paint.js     [재작성]  TUI 초기화 + localStorage 로드 + 클립보드/PDF 버튼 바인딩
├── paint.css    [재작성]  상단 헤더 + TUI 테마 오버라이드 (최소 CSS)
├── paint-capture.js [유지]  🎨 버튼 → html2canvas → localStorage → window.open
├── paint-overlay.js [삭제]
└── paint-overlay.css [삭제]
```

### 2.2 데이터 흐름
```
overview.html / index.html
  ↓ 🎨 버튼 클릭 (paint-capture.js)
html2canvas(target, { scale: 자동조정 }) → PNG dataURL
  ↓ localStorage.setItem('paintCapture', { dataURL, source, w, h, ts })
window.open('paint.html', '_blank')
  ↓
paint.html boot (paint.js):
  const data = JSON.parse(localStorage.getItem('paintCapture') || '{}')
  const editor = new tui.ImageEditor('#tui-image-editor', { ...options })
  await editor.loadImageFromURL(data.dataURL, data.source)
  editor.ui.resizeEditor()
  ↓ 사용자 편집 (TUI 내장)
  ↓ Download (TUI 기본) / Copy (커스텀) / PDF (커스텀)
```

### 2.3 CDN 의존성
```html
<link rel="stylesheet" href="https://uicdn.toast.com/tui-color-picker/latest/tui-color-picker.css">
<link rel="stylesheet" href="https://uicdn.toast.com/tui-image-editor/latest/tui-image-editor.css">

<script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/4.2.0/fabric.min.js"></script>
<script src="https://uicdn.toast.com/tui.code-snippet/v1.5.0/tui-code-snippet.min.js"></script>
<script src="https://uicdn.toast.com/tui-color-picker/latest/tui-color-picker.js"></script>
<script src="https://uicdn.toast.com/tui-image-editor/latest/tui-image-editor.js"></script>
<!-- 선택: PDF 내보내기 -->
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
```

## 3. Implementation Guide

### 3.1 Module Map
| 모듈 | 파일 | 역할 |
|---|---|---|
| M1 | paint-capture.js (수정) | 기존 `window.openPaintOverlay` 를 다시 "새 탭 열기" 버전으로 복구 |
| M2 | paint.html (재작성) | TUI 에디터 div + 상단 Toss 헤더 |
| M3 | paint.js (재작성) | TUI 인스턴스 생성 + 이미지 로드 + 커스텀 버튼 바인딩 |
| M4 | paint.css (재작성) | 상단 헤더 + TUI 테마 변수 오버라이드 |
| M5 | overview/index.html | 🎨 핸들러 변경 (openPaintOverlay → openPaintTab) |
| M6 | Cleanup | paint-overlay.js/css 삭제 |

### 3.2 권장 세션 분할
- **Session 1 (M1+M6)**: 기존 overlay 제거 + capture → new tab 복구
- **Session 2 (M2+M3+M4)**: TUI 에디터 통합 + 이미지 로드 + 커스텀 헤더
- **Session 3**: 클립보드/PDF 버튼 + 폴리싱 + 캡처 크기 검증

### 3.3 핵심 코드 스케치

**paint-capture.js (window.openPaintTab)**
```js
window.openPaintTab = async function () {
  if (typeof html2canvas === 'undefined') { alert('html2canvas 로드 실패'); return; }
  if (window.toast) window.toast('캡처 중...');
  document.body.classList.add('paint-capturing');
  window.scrollTo(0, 0);
  // 스크롤 초기화 로직은 기존과 동일
  const scrollables = document.querySelectorAll('.overview-wrap, .coverage-table-wrap, .panel, main');
  scrollables.forEach(el => { el.scrollLeft = 0; el.scrollTop = 0; });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const target = document.querySelector('.overview-wrap') || document.querySelector('main') || document.body;
  const rawW = Math.max(target.scrollWidth, 800);
  const rawH = Math.max(target.scrollHeight, 600);
  const MAX_PX = 8000;
  let scale = Math.min(window.devicePixelRatio || 1, 1.5);
  if (rawW * scale > MAX_PX) scale = MAX_PX / rawW;
  if (rawH * scale > MAX_PX) scale = Math.min(scale, MAX_PX / rawH);
  scale = Math.max(0.4, scale);

  const cap = await html2canvas(target, { scale, width: rawW, height: rawH, windowWidth: rawW, windowHeight: rawH, backgroundColor: '#fff' });
  document.body.classList.remove('paint-capturing');

  const dataURL = cap.toDataURL('image/png', 0.92);
  localStorage.setItem('paintCapture', JSON.stringify({
    dataURL, source: location.pathname, w: cap.width, h: cap.height, ts: Date.now(),
  }));
  window.open('paint.html', '_blank');
};
```

**paint.html**
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>🎨 그림판 — 보장 마크업</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="https://uicdn.toast.com/tui-color-picker/latest/tui-color-picker.css">
  <link rel="stylesheet" href="https://uicdn.toast.com/tui-image-editor/latest/tui-image-editor.css">
  <link rel="stylesheet" href="paint.css" />
</head>
<body>
  <header class="paint-header">
    <a class="brand" href="index.html"><img src="Logo/.../TossInsurance_Logo_Simple_Primary.png" /></a>
    <h1>그림판</h1>
    <div class="spacer"></div>
    <button class="btn" id="clipBtn">📋 클립보드</button>
    <button class="btn" id="pdfBtn">📄 PDF</button>
    <button class="btn danger" id="closeBtn" onclick="window.close()">✕</button>
  </header>
  <div id="tui-image-editor"></div>
  <div class="toast" id="toast"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/4.2.0/fabric.min.js"></script>
  <script src="https://uicdn.toast.com/tui.code-snippet/v1.5.0/tui-code-snippet.min.js"></script>
  <script src="https://uicdn.toast.com/tui-color-picker/latest/tui-color-picker.js"></script>
  <script src="https://uicdn.toast.com/tui-image-editor/latest/tui-image-editor.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="paint.js"></script>
</body>
</html>
```

**paint.js**
```js
(function () {
  const raw = localStorage.getItem('paintCapture');
  const data = raw ? JSON.parse(raw) : null;
  const sourceName = data?.source || 'Capture';

  const editor = new tui.ImageEditor('#tui-image-editor', {
    includeUI: {
      loadImage: data ? { path: data.dataURL, name: sourceName } : undefined,
      theme: tossTheme, // 하단 정의
      menu: ['crop','flip','rotate','draw','shape','icon','text','mask','filter'],
      initMenu: 'draw',
      uiSize: { width: '100%', height: 'calc(100vh - 56px)' },
      menuBarPosition: 'bottom',
    },
    cssMaxWidth: 12000,
    cssMaxHeight: 8000,
    selectionStyle: { cornerSize: 10, rotatingPointOffset: 60 },
  });

  // 창 크기 변경 시 TUI 자동 리사이즈
  window.addEventListener('resize', () => editor.ui.resizeEditor());

  // 클립보드 복사
  document.getElementById('clipBtn').addEventListener('click', async () => {
    try {
      const dataURL = editor.toDataURL();
      const blob = await (await fetch(dataURL)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('클립보드 복사됨');
    } catch (e) { toast('복사 실패 — 다운로드로 대체'); triggerDownload(editor.toDataURL()); }
  });

  // PDF 저장
  document.getElementById('pdfBtn').addEventListener('click', () => {
    const dataURL = editor.toDataURL();
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.onload = () => {
      const orientation = img.width > img.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = img.width / img.height;
      let w = pw, h = pw / ratio;
      if (h > ph) { h = ph; w = ph * ratio; }
      pdf.addImage(dataURL, 'PNG', (pw-w)/2, (ph-h)/2, w, h);
      pdf.save(`보장마크업_${new Date().toISOString().slice(0,10)}.pdf`);
      toast('PDF 저장됨');
    };
    img.src = dataURL;
  });

  function triggerDownload(dataURL) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `보장마크업_${new Date().toISOString().slice(0,10)}.png`;
    a.click();
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  // Toss 테마 (최소 오버라이드)
  const tossTheme = {
    'common.bi.image': '', // 로고 숨김
    'common.bisize.width': '0px',
    'common.bisize.height': '0px',
    'common.backgroundImage': 'none',
    'common.backgroundColor': '#f4f6fa',
    'header.backgroundColor': 'transparent',
    'loadButton.backgroundColor': '#ffffff',
    'loadButton.border': '1px solid #3182F6',
    'loadButton.color': '#3182F6',
    'downloadButton.backgroundColor': '#3182F6',
    'downloadButton.border': '1px solid #3182F6',
    'downloadButton.color': '#ffffff',
    'menu.normalIcon.color': '#8a94a6',
    'menu.activeIcon.color': '#3182F6',
    'menu.disabledIcon.color': '#cbd1d8',
    'menu.hoverIcon.color': '#3182F6',
    'submenu.backgroundColor': '#ffffff',
    'submenu.partition.color': '#e5e8eb',
    'submenu.normalLabel.color': '#4e5968',
    'submenu.activeLabel.color': '#3182F6',
    'submenu.normalIcon.color': '#8a94a6',
    'submenu.activeIcon.color': '#3182F6',
    'range.pointerColor': '#3182F6',
    'range.bar1Color': '#3182F6',
    'range.bar2Color': '#d1d6db',
    'colorpicker.button.border': '1px solid #e5e8eb',
    'colorpicker.title.color': '#4e5968',
  };
})();
```

**paint.css** (최소)
```css
body { margin: 0; background: #f4f6fa; font-family: var(--font-sans); }
.paint-header {
  height: 56px;
  display: flex; align-items: center; gap: 12px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid var(--gray-100);
  position: sticky; top: 0; z-index: 10;
}
.paint-header h1 { font-size: 15px; font-weight: 700; margin: 0; }
.paint-header .brand img { height: 28px; }
.paint-header .spacer { flex: 1; }
#tui-image-editor {
  width: 100%;
  height: calc(100vh - 56px);
}
.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  background: rgba(15,23,42,.88); color: #fff;
  padding: 8px 14px; border-radius: 8px;
  font-size: 13px; opacity: 0;
  transition: opacity .2s;
  pointer-events: none;
}
.toast.show { opacity: 1; }
```

**overview.html / index.html 수정**
```html
<!-- 변경 전 -->
<script>document.getElementById('paintBtn')?.addEventListener('click', window.openPaintOverlay);</script>

<!-- 변경 후 -->
<script>document.getElementById('paintBtn')?.addEventListener('click', window.openPaintTab);</script>
```

## 4. Success Criteria

1. [ ] **SC-1** overview 50+ 상품 / 긴 테이블에서도 🎨 클릭 시 **배경 이미지 완전 로드** (깨진 아이콘 없음)
2. [ ] **SC-2** 새 탭으로 paint.html 열림 (3초 이내)
3. [ ] **SC-3** TUI 내장 도구 전체 동작: Crop, Flip, Rotate, Draw, Shape, Icon, Text (7개 메뉴)
4. [ ] **SC-4** TUI 내장 Undo / Redo 정상
5. [ ] **SC-5** TUI 내장 Download 버튼으로 PNG 저장
6. [ ] **SC-6** 커스텀 📋 클립보드 버튼 → Ctrl+V 로 카카오톡 붙여넣기 가능
7. [ ] **SC-7** 커스텀 📄 PDF 버튼 → A4 페이지 저장
8. [ ] **SC-8** 창 크기 변경 / 모바일 가로세로 회전 시 editor 자동 리사이즈
9. [ ] **SC-9** **자체 줌 구현 제거** — 브라우저 줌/스크롤과 충돌 없음 (TUI 내장 사용)
10. [ ] **SC-10** paint-overlay.js / paint-overlay.css 완전 제거, 관련 참조 없음

## 5. Risks & Mitigations

| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | fabric.js v4(TUI 요구) vs v5 (현재 overlay) 버전 충돌 | paint.html 은 v4 로드, overview/index 는 fabric 불필요(캡처만) |
| R2 | TUI UI가 기본 다크 테마라 Toss와 이질감 | `tossTheme` 객체로 핵심 토큰만 오버라이드 (브랜드 컬러 #3182F6) |
| R3 | 대용량 dataURL localStorage 5-10MB 한계 | 캡처 scale 자동 조정 (canvas 8000px 상한) + PNG quality 0.92 이미 적용 |
| R4 | TUI CDN 로드 실패 (오프라인) | `window.tui?.ImageEditor` 체크 후 에러 토스트, 수동 재시도 유도 |
| R5 | 새 탭 팝업 차단 | `window.open` 을 클릭 이벤트 핸들러 내 직접 호출 (이미 현재도 적용) |
| R6 | file:// 환경에서 localStorage 공유 | 동일 origin(file://baek/*) 내 sessionStorage는 공유 안 되지만 **localStorage는 공유됨** |
| R7 | TUI 라이선스 | MIT — 상용/재배포 자유 |

## 6. Out of Scope

- OCR / 자동 영역 감지
- 멀티 페이지 스크롤 캡처 이어붙이기
- 서버 업로드 / 링크 공유
- 실시간 협업
- 라이브러리 포크 / 자체 빌드

## 7. Rollback Plan

배포 후 이슈 발생 시:
1. overview.html / index.html 의 `openPaintTab` → `openPaintOverlay` 복원 (1 line)
2. paint-overlay.js/css 복원 (git revert)
3. paint.html/js/css 는 재작성되므로 이전 버전 리더는 git tag 로 보존 (`git tag pre-tui`)

---

## 구현 시작 전 확인 질문 (Checkpoint)

대표님, 아래 질문 3가지만 확인하고 바로 구현 들어가겠습니다:

**Q1. TUI 상단 로고 영역**
TUI 기본 UI에 큰 로고가 박혀 있습니다(48px 아이콘). `tossTheme` 에서 숨기고 저희가 만든 `.paint-header` 로 대체할 예정입니다 — 맞으시죠?

**Q2. 메뉴 범위**
TUI는 Crop, Flip, Rotate, Draw, Shape, Icon, Text, Mask, Filter 9개 메뉴를 제공합니다.
- **A) 전부 노출** (Mask/Filter 포함)
- **B) 실용적 7개만** (Mask/Filter 제외 — 보장표 마크업엔 불필요)
→ 기본 권장은 **B**입니다.

**Q3. 기존 paint.js / paint.css 처리**
git 히스토리에는 남기되 현재 파일은 전면 덮어쓰기 예정입니다 (기존 자체 구현 100% 대체). 문제없으신가요?

---

답변 주시면 바로 구현 착수하겠습니다. 현재 Plan은 `docs/paint-tui.plan.md` 에 저장되었습니다.
