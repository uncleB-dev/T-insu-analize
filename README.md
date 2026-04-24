# T-insu Analyze

토스인슈어런스 설계사용 보장 분석 · 상담 자료 편집 웹 도구.

CRM의 보장분석 HTML을 불러와 상품별·매트릭스 형태로 재구성하고,
납입 현황 자동 계산·그림판 마크업·이미지/PDF 내보내기 기능을 제공합니다.

## 페이지 구성

| 페이지 | 용도 |
|---|---|
| `index.html` | **상품별 상세 뷰** — 보험 상품을 탭으로 전환하며 계약·납입·담보 정보 확인 (모바일 최적화) |
| `overview.html` | **전체 보험 한눈에 보기** — 상품을 컬럼으로, 보험 정보·소분류 매트릭스를 행으로 배치 |
| `db.html` | **DB 뷰** — Flat / Pivot / Master-Detail 3탭으로 데이터 탐색 |
| `paint.html` | **그림판** — 현재 화면 캡처 후 도형·텍스트·말풍선 마크업 |
| `editor.html` | (레거시) 편집기 |

## 데이터 입력 방법

### 1. 북마클릿 (권장)
1. `index.html` 상단 **🔖 북마클릿** 클릭
2. 모달의 **📎 보장표 추출** 버튼을 브라우저 북마크바로 드래그
3. 로그인된 Toss CRM 페이지에서 저장한 북마크 클릭 (HTML 스냅샷이 클립보드에 복사됨)
4. `index.html` 로 돌아와 **📋 붙여넣기** → Ctrl+V → **가져오기**

### 2. HTML 파일 드롭
- `editor.html` 에서 보장분석 HTML 파일 드롭

## 주요 기능

- **모든 셀 편집**: 인라인 contentEditable · 날짜/드롭다운/단위 고정 입력
- **납입 현황 자동 계산**: 월납 × 경과/남은 개월 기반 실시간 기납/잔여/총 산출
- **보험 상품 숨기기**: overview 컬럼 헤더 🙈 버튼 / index 블록 우상단
- **합산 열**: 숨김 제외하고 월납·기납/잔여/총 및 소분류별 합계
- **그림판 캡처 마크업**: html2canvas + fabric.js + jsPDF (PNG/클립보드/PDF 3종 저장)
- **Toss UI**: Toss Product Sans 폰트 + Toss Blue(#3182F6) + TossInsurance 로고

## 기술 스택

- 순수 HTML/CSS/JavaScript (프레임워크 없음)
- `file://` 프로토콜로 직접 실행 가능 (서버 불필요)
- 데이터는 `localStorage` 로 페이지 간 공유

**CDN 의존성** (`paint.html` 만):
- html2canvas 1.4.1
- fabric 5.3.0
- jspdf 2.5.1

## 폰트·로고

- 폰트: `font/otf/TossProductSans*` (Toss Product Sans 7종 굵기)
- 로고: `Logo/TossInsurance/TossInsurance_Logo_Simple_Primary/`

## 로컬 실행

```
# 파일을 브라우저에서 바로 열면 됨
C:\uncleBstudio\workspace_ex\baek\index.html
```

## 배포 / 공유

현재 정적 파일 기반이므로 GitHub Pages·Vercel·Netlify 등 어디든 정적 호스팅 가능.

## 라이선스

내부 용도 (Toss Insurance 설계사 업무용).
