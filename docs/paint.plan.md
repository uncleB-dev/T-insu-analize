# paint — Plan

- **Feature**: paint
- **Created**: 2026-04-24
- **Phase**: Plan
- **Level**: Starter

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | CRM/전체보험 화면을 고객에게 설명할 때 주요 부분을 강조할 방법이 없어, OS 스크린샷 → 다른 앱에서 편집 → 공유하는 번거로운 공정이 반복됨. |
| **Solution** | 브라우저 내장 그림판. overview/index 상단 🎨 버튼 1번 → 현재 화면 자동 캡처 → paint.html 새 탭에서 도형·텍스트·형광펜·말풍선·링크선으로 즉시 마크업. |
| **Function UX** | fabric.js 기반 편집기. 확장 도구 11종(사각·원·화살표·직선·꺾은선·링크선·텍스트·말풍선·펜·형광펜·스티커) + 색상/두께/폰트 + Undo/Redo + 선택·이동·삭제. |
| **Core Value** | "캡처 → 편집 → 공유" 3번 클릭으로 끝남. 고객에게 설명 직전 주요 담보에 빨간 원·코멘트·화살표 즉석 표시. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | 영업 현장 설명용 이미지를 캡처·마크업·공유하는 공정이 너무 느림 (현재 2-5분) |
| **WHO** | 태블릿·데스크톱을 현장에서 사용하는 보험 컨설턴트 |
| **RISK** | 대용량 캡처 이미지 → sessionStorage 제한, fabric.js CDN 로드 지연, 클립보드 API 브라우저 편차 |
| **SUCCESS** | 🎨 → 3초 내 편집 화면 노출, 확장 도구 11종 작동, PNG/PDF/클립보드 3종 내보내기 모두 동작 |
| **SCOPE** | paint.html/js/css 신규 + CDN 의존(html2canvas·fabric·jsPDF) + overview·index 헤더에 버튼 추가 |

## 1. Requirements

### 1.1 Functional
1. **🎨 그림판 버튼** — overview.html / index.html 상단 헤더에 배치
2. **캡처** — 버튼 클릭 시 `html2canvas(document.body)` → PNG dataURL 생성
3. **전달** — dataURL 을 `sessionStorage['paintCanvas']` 에 저장 후 `paint.html` 새 탭 열기
4. **paint.html** — 캔버스에 dataURL 배경 로드 후 fabric.js 편집기 초기화
5. **도구 바 (11종)**:
   - 선택/이동 (기본 모드)
   - 사각형
   - 원 / 타원
   - 화살표 (머리 1개 / 양방향)
   - 직선
   - 꺾은선 (polyline)
   - 링크선 (2개 요소 연결)
   - 텍스트
   - 말풍선 (네모/둥근 꼭지 포함)
   - 자유 곡선 (펜)
   - 형광펜 (반투명 박스)
   - 스티커 (이모지·체크마크 프리셋)
6. **속성 편집** — 선 색상·굵기 / 채움 색상·투명도 / 폰트 종류·크기·굵기 / 화살표 머리 크기
7. **히스토리** — Undo (Ctrl+Z) · Redo (Ctrl+Shift+Z) · 최소 30 스텝
8. **선택 조작** — 선택 · 이동 · 크기조절 · 회전 · 복제(Ctrl+D) · 삭제(Del)
9. **내보내기 3종**:
   - PNG 다운로드 (`canvas.toBlob`)
   - 클립보드 복사 (`ClipboardItem`)
   - PDF 저장 (jsPDF)
10. **캔버스 클리어 / 원본 복원** 버튼

### 1.2 Non-Functional
- 의존성: CDN 로드 (html2canvas, fabric, jsPDF) — 오프라인 미지원 허용
- 성능: 편집기 초기 로드 3초 이내, 도형 그리기 drag 60fps
- 해상도: 캡처 최대 2400px 폭 제한 (큰 화면 스크롤 캡처 시 용량 제어)
- 브라우저: Chrome/Edge/Safari 최신 기준 (Firefox clipboard API 일부 제약 허용)

## 2. Architecture — Option C (실용적 균형)

### 2.1 선택 이유
| 옵션 | 장점 | 단점 | 채택 |
|---|---|---|---|
| A. 모든 편집을 overview/index 내 오버레이 | 탭 전환 없음 | 편집 공간 좁음, 페이지 스크롤 복잡 | ❌ |
| B. 서버/Electron 독립 앱 | 풀 기능 | 정적 HTML 프로젝트 범위 초과 | ❌ |
| **C. paint.html 전용 탭 + CDN 라이브러리** | 편집 공간 최대, 기존 페이지와 독립 | 새 탭 열림(팝업 차단 가능성) | ✅ |

### 2.2 파일 구조
```
baek/
├── index.html, index.js, index.css    (모바일, 기존)
├── overview.html, overview.js, overview.css (전체 보험, 기존)
├── paint.html      [신규]  편집기 뼈대
├── paint.js        [신규]  fabric.js 툴 바인딩·내보내기
├── paint.css       [신규]  툴바·캔버스 레이아웃
├── paint-capture.js [신규] 버튼 클릭 → html2canvas 캡처 + 새 탭 열기 (overview/index 에서 로드)
└── (기존 공용 파일 재사용: schema.js, parser.js, styles.css)
```

### 2.3 데이터 흐름
```
overview.html / index.html
  ↓ 🎨 버튼 클릭
html2canvas(document.body) → dataURL (PNG)
  ↓ sessionStorage.setItem('paintCanvas', { dataURL, source, w, h })
window.open('paint.html', '_blank')
  ↓
paint.html boot:
  const data = JSON.parse(sessionStorage.getItem('paintCanvas'))
  fabric.Image.fromURL(data.dataURL) → canvas.backgroundImage
  사용자 편집 → canvas.toDataURL() → PNG/PDF/Clipboard
```

### 2.4 CDN 의존성 (로드 순서)
```html
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>  <!-- overview/index 만 -->
<script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js"></script>            <!-- paint -->
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>          <!-- paint -->
```

## 3. Implementation Guide

### 3.1 Module Map
| 모듈 | 파일 | 역할 |
|---|---|---|
| M1 | overview.html, index.html + paint-capture.js | 🎨 버튼 + 캡처 + 새 탭 |
| M2 | paint.html + paint.css | 툴바·캔버스 뼈대 |
| M3 | paint.js (tool bindings) | fabric.js 도구 11종 핸들러 |
| M4 | paint.js (style panel) | 색상·두께·폰트 속성 패널 |
| M5 | paint.js (history + select) | Undo/Redo + 선택 조작 |
| M6 | paint.js (export) | PNG/PDF/Clipboard 내보내기 |

### 3.2 권장 세션 분할
- **Session 1 (M1+M2)**: 🎨 버튼 + 캡처 → 새 탭 → 배경 이미지 로드 (기반 플로 동작)
- **Session 2 (M3+M4)**: fabric.js 도구 11종 + 속성 패널
- **Session 3 (M5+M6)**: Undo/Redo + 3종 내보내기 + 폴리싱

### 3.3 핵심 코드 스케치

**paint-capture.js** (overview/index 에서 로드)
```js
async function capturePageAndOpenPaint() {
  const canvas = await html2canvas(document.body, {
    backgroundColor: '#ffffff',
    scale: window.devicePixelRatio || 1,
    windowWidth: Math.min(document.body.scrollWidth, 2400),
  });
  const dataURL = canvas.toDataURL('image/png', 0.92);
  sessionStorage.setItem('paintCanvas', JSON.stringify({
    dataURL, source: location.pathname, w: canvas.width, h: canvas.height,
    capturedAt: new Date().toISOString(),
  }));
  window.open('paint.html', '_blank');
}
```

**paint.js** boot
```js
const raw = sessionStorage.getItem('paintCanvas');
const data = raw ? JSON.parse(raw) : null;
const canvas = new fabric.Canvas('paintCanvas', { width: data?.w || 1200, height: data?.h || 800 });
if (data?.dataURL) {
  fabric.Image.fromURL(data.dataURL, img => canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas)));
}
```

## 4. Success Criteria
1. [ ] SC-1 overview.html 과 index.html 상단에 🎨 버튼 추가
2. [ ] SC-2 버튼 클릭 시 3초 이내에 paint.html 이 새 탭으로 열리고 배경 이미지 로드
3. [ ] SC-3 확장 도구 11종(사각/원/화살표/직선/꺾은선/링크선/텍스트/말풍선/펜/형광펜/스티커) 정상 작동
4. [ ] SC-4 색상·두께·폰트·투명도 속성 패널 실시간 반영
5. [ ] SC-5 선택·이동·크기조절·회전·복제(Ctrl+D)·삭제(Del)·Undo(Ctrl+Z)·Redo(Ctrl+Shift+Z) 동작
6. [ ] SC-6 PNG 다운로드 버튼 → 파일 저장
7. [ ] SC-7 클립보드 복사 버튼 → Ctrl+V 로 카카오톡 등 붙여넣기 가능
8. [ ] SC-8 PDF 저장 버튼 → 단일 페이지 PDF 다운로드
9. [ ] SC-9 캔버스 클리어 / 원본 복원 버튼 정상 작동

## 5. Risks & Mitigations
| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | 큰 dataURL → sessionStorage 용량 한계 (5-10MB) | `windowWidth: 2400` 제한 + PNG 압축 품질 0.92 적용 |
| R2 | html2canvas 한글 웹폰트 누락 가능 | 인라인 CSS 폰트 패밀리 그대로 사용, 필요 시 data-html2canvas-ignore 로 장식 요소 제외 |
| R3 | fabric.js CDN 로드 실패 (오프라인) | 실패 시 "인터넷 연결 필요" 토스트 표시 |
| R4 | Clipboard API `ClipboardItem` 지원 브라우저 편차 | try/catch → 실패 시 PNG 다운로드로 대체하고 안내 토스트 |
| R5 | 팝업 차단으로 새 탭 안 열림 | 사용자 클릭 이벤트 핸들러 내에서 `window.open` 호출 (차단 우회), 차단 감지 시 alert 안내 |
| R6 | 배경 이미지 편집 덮기 어려움 | `canvas.backgroundImage` 사용 (삭제/이동 불가), 도형만 레이어에 추가 |
| R7 | html2canvas 가 sticky 헤더·스크롤 컨테이너 다중 화면 캡처 누락 | 캡처 전 `scrollTo(0,0)` + `overview-wrap { max-height: none }` 임시 해제 |

## 6. Out of Scope
- 여러 이미지 합치기 / 페이지 스크롤 캡처 이어붙이기
- 이미지 레이어 관리 UI
- 서버 업로드 / 링크 공유
- 실시간 협업 편집
- 이미지 자체 리사이즈 / 크롭 (원본 유지)
- OCR / 자동 하이라이트
