# toss-ui-redesign — Plan

- **Feature**: toss-ui-redesign
- **Created**: 2026-04-24
- **Phase**: Plan
- **Level**: Starter · Design-only (기능 불변)

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 현재 UI는 기본 시스템 UI 수준으로 일관성·세련도가 낮고, 토스인슈어런스 설계사로서 고객에게 보여주기 어색한 수준. 브랜드 이질감. |
| **Solution** | 토스 디자인 시스템(Toss Product Sans + #3182F6 + 라운드/여백 중심) 전면 적용. 보유한 Toss Product Sans 7종 굵기 + TossInsurance Simple Primary 로고 활용. |
| **Function UX** | 모든 기능(편집·캡처·합산·숨김·paint 등) 그대로, 시각 언어만 tossinsu.com 수준으로 재디자인. 전 페이지 공통 토큰으로 통일. |
| **Core Value** | 고객 앞에서 "토스인슈어런스 소속" 정체성이 즉시 느껴지는 브랜드 일관 UI. 현장 신뢰도·설계사 세련도 동시 상승. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | 토스인슈어런스 설계사 브랜딩에 맞는 고급 상담 화면 필요 |
| **WHO** | 토스인슈어런스 컨설턴트, 고객에게 보여지는 모든 화면 |
| **RISK** | 기능 회귀(CSS가 기존 구조 선택자에 의존해 깨질 위험), 폰트 용량, 색·여백 변경으로 좁은 모바일에서 텍스트 overflow |
| **SUCCESS** | 전 페이지 시각 통일, Toss Product Sans 적용, 모든 인터랙션 동작 100% 유지, 모바일 375px 깨짐 없음 |
| **SCOPE** | CSS 전면 리팩터(기능 코드 불변). font @font-face 선언, 토큰 CSS 변수, 공통 컴포넌트 스타일, 로고 삽입 |

## 1. Requirements

### 1.1 Functional (UI Only)
1. **Toss Product Sans 로컬 로드** — `font/otf/*.otf` 7종 굵기 `@font-face` 선언
2. **로고 삽입** — 모든 페이지 상단 좌측에 TossInsurance Simple Primary 로고 배치 (32-36px 높이)
3. **디자인 토큰 정의** — CSS 변수로 색상·폰트·여백·라운드·그림자 시스템화
4. **컴포넌트 재디자인** — 버튼·카드·입력·탭·배지·모달·토스트 토스 스타일로 재작성
5. **페이지별 레이아웃 조정** — 컨테이너 폭·패딩·섹션 간격을 토스 여백 체계에 맞춤
6. **인터랙션 통일** — 버튼 호버·포커스·탭 active 상태를 토스 스타일(cubic-bezier)로
7. **모바일 최적화 유지** — 기존 375px 대응 그대로, 토스 모바일 스케일(폰트 약간 더 큼) 반영

### 1.2 기능 불변
- state 관리 로직, 이벤트 핸들러, 데이터 파싱, 계산 공식, 북마클릿, 클립보드 → **100% 그대로**
- HTML 구조는 클래스 이름·계층 최대한 유지 (스타일만 교체)

## 2. Toss Design Tokens (Reference)

### 2.1 색상 (Color Scale)
```css
/* Primary — Toss Blue */
--blue-50:  #E8F2FF;
--blue-100: #C9E0FF;
--blue-300: #4E8CF0;
--blue-500: #3182F6;   /* ← main accent */
--blue-600: #1B64DA;
--blue-700: #1548A0;

/* Gray (텍스트·배경 축) */
--gray-900: #191F28;   /* main text */
--gray-800: #333D4B;
--gray-700: #4E5968;   /* sub text */
--gray-600: #6B7684;
--gray-500: #8B95A1;
--gray-400: #B0B8C1;
--gray-300: #D1D6DB;
--gray-200: #E5E8EB;   /* divider */
--gray-100: #F2F4F6;   /* 약한 배경 */
--gray-50:  #F9FAFB;   /* 페이지 배경 */

/* Semantic */
--success:  #17A340;
--warning:  #F59E0B;
--danger:   #F04452;
--info:     #3182F6;
```

### 2.2 Typography
- **Font**: `'Toss Product Sans', -apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif`
- **Weight scale**: 400 / 500 / 600 / 700 / 800 (7종 중 주로 4종 사용)
- **Size scale**:
  - Display: 32/24px (큰 금액, 고객 헤더)
  - Title: 20/18px (섹션 제목)
  - Body: 15/14px (본문)
  - Caption: 13/12px (라벨, 부가 설명)
- **Line-height**: 1.4 (본문) / 1.2 (헤딩) / 1.6 (긴 텍스트)

### 2.3 Spacing (4px grid)
```css
--s-1: 4px;  --s-2: 8px;  --s-3: 12px;  --s-4: 16px;
--s-5: 20px; --s-6: 24px; --s-8: 32px;  --s-10: 40px;
--s-12: 48px; --s-16: 64px;
```

### 2.4 Radius
```css
--r-sm: 6px;   /* 작은 칩·태그 */
--r-md: 10px;  /* 버튼·인풋 */
--r-lg: 14px;  /* 카드 */
--r-xl: 20px;  /* 큰 카드·모달 */
--r-full: 9999px;
```

### 2.5 Shadow
```css
--sh-sm: 0 1px 2px rgba(25,31,40,0.04);
--sh-md: 0 4px 12px rgba(25,31,40,0.06);
--sh-lg: 0 8px 24px rgba(25,31,40,0.08);
--sh-focus: 0 0 0 3px rgba(49,130,246,0.15);
```

### 2.6 Motion
```css
--t-fast: 120ms cubic-bezier(.4,0,.2,1);
--t-base: 200ms cubic-bezier(.4,0,.2,1);
--t-press: 120ms cubic-bezier(.4,0,.2,1);
```

## 3. Architecture — Option C (실용적 균형)

### 3.1 선택 이유
| 옵션 | 장점 | 단점 | 채택 |
|---|---|---|---|
| A. 최소 변경 (색만 바꿈) | 빠름 | 토스 감성 안 남 | ❌ |
| B. 완전 리라이트 (BEM 체계 적용) | 완벽 | 선택자 깨짐, 기능 회귀 위험 | ❌ |
| **C. 토큰 기반 리팩터 (클래스·구조 유지)** | 기능 안전, 토스 감성 달성 | CSS 파일 여러 개 수정 | ✅ |

### 3.2 파일 수정 범위
```
styles.css     — [FULL REWRITE]  토큰 + 공통 컴포넌트 + @font-face
index.css      — [FULL REWRITE]  모바일 상품 뷰 토스화
overview.css   — [FULL REWRITE]  전체 보험 매트릭스 토스화
db.css         — [FULL REWRITE]  DB 뷰 토스화
paint.css      — [부분 수정]     헤더·툴바·속성 패널만 토스 톤
각 HTML        — [부분 수정]     헤더에 로고 <img> 삽입
```

### 3.3 폰트 로드 전략
`styles.css` 상단 @font-face 블록:
```css
@font-face {
  font-family: 'Toss Product Sans';
  src: url('font/otf/TossProductSansOTF-Regular.otf') format('opentype');
  font-weight: 400; font-display: swap;
}
/* 500, 600, 700, 800 각각 */
```
- `font-display: swap` 로 FOIT 방지
- 한글은 Toss Product Sans 가 커버 안 하므로 fallback: Apple SD Gothic Neo / Pretendard / Malgun Gothic

### 3.4 로고 배치 패턴
```html
<header>
  <a class="brand" href="index.html">
    <img src="Logo/TossInsurance/TossInsurance_Logo_Simple/.../*.png" alt="TossInsurance" />
  </a>
  ...
</header>
```

## 4. Implementation Guide

### 4.1 Module Map
| 모듈 | 파일 | 역할 |
|---|---|---|
| M1 | `styles.css` | @font-face + 토큰 변수 + reset + 공통 컴포넌트 (.btn, .card, .chip, .tag, .modal) |
| M2 | 각 HTML | 로고 img 삽입, 클래스 미세 조정 |
| M3 | `index.css` | 모바일 레이아웃 — 상품 블록·요약표·납입현황 카드·담보표 토스화 |
| M4 | `overview.css` | 매트릭스 테이블·합산 컬럼·섹션 헤더 토스화 |
| M5 | `db.css` | DB 3탭·플랫 테이블·피벗·마스터디테일 토스화 |
| M6 | `paint.css` | 그림판 툴바·속성 패널 토스화 |

### 4.2 권장 세션 분할
- **Session 1 (M1+M2)**: 디자인 토큰·폰트·로고 기반 인프라
- **Session 2 (M3+M4)**: 메인 화면 2개 (index, overview)
- **Session 3 (M5+M6)**: 부가 화면 (db, paint)

### 4.3 핵심 스타일 규칙
- **버튼 기본**: radius 10, padding 10-14, font-weight 600, transition 200ms
  - Primary: bg `--blue-500`, text white, hover `--blue-600`
  - Secondary: bg white, border `--gray-200`, text `--gray-900`, hover bg `--gray-100`
  - Ghost: bg transparent, text `--gray-700`, hover bg `--gray-100`
- **카드**: bg white, radius 14, padding 20-24, box-shadow `--sh-sm`
- **입력 (editable·input·select)**: border 없음 / 1px `--gray-200`, radius 8, focus `--sh-focus`
- **테이블**:
  - 헤더 bg `--gray-50`, text `--gray-700`, font 500
  - 행 구분선 `--gray-200`, hover `--gray-50`
  - 셀 padding 14-16
- **탭/칩**: radius-full, padding 6-12, font 500, active bg `--blue-500` + text white
- **배지·태그**: radius 6, padding 2-8, font 500 / 600

### 4.4 페이지별 주요 변경점

**index.html (모바일 상품 뷰)**
- 고객 헤더: 38-40px 제목, 토스블루 이름 강조
- 상품 탭: pill 스타일, active는 진한 파랑 채움
- 요약표: 헤더 gray-50 배경, 셀 간격 14px, 값은 gray-900 Semibold
- 납입현황 카드: white 카드 + subtle shadow, 숫자 28px Bold 파랑
- 담보표: 깔끔한 구분선, NO 회색, 회사담보명 Semibold

**overview.html (전체 보험)**
- Toolbar: 칩 스타일 버튼, 숨김/정리 버튼 ghost
- 테이블: sticky 헤더 gray-50, 합산 열 옅은 파랑 배경, row hover gray-50
- 섹션 헤더 "소분류": 토스 블루 bg + white text
- 고객 헤더: 이름 파랑, 나이·성별 gray-500

**db.html (DB 3탭)**
- 탭 스타일: 상단 underline 토스블루, inactive gray
- 플랫 테이블: 토스 테이블 규칙 그대로
- 피벗 히트맵: 빨강 → 파란 gradient (토스 파란 계열로 변경)
- 마스터-디테일: 좌측 리스트 카드형, 우측 상세 white 카드

**paint.html (그림판)**
- 헤더: 다른 페이지 공통 헤더 규칙 적용
- 툴바: 아이콘 버튼 44×44, radius 12, active 파랑 채움
- 속성 패널: swatch 원형, 슬라이더 토스 스타일

## 5. Success Criteria
1. [ ] SC-1 Toss Product Sans 7종 로컬 로드 → 모든 페이지 폰트 일관 적용
2. [ ] SC-2 모든 페이지 상단 좌측에 TossInsurance Simple Primary 로고
3. [ ] SC-3 디자인 토큰 CSS 변수 전역 정의 + 모든 CSS 파일이 토큰 참조
4. [ ] SC-4 버튼·카드·입력·탭·배지·모달·토스트 토스 스타일 적용
5. [ ] SC-5 모든 기존 기능 100% 동작 (편집·캡처·합산·숨김·paint 등)
6. [ ] SC-6 모바일 375px 뷰포트에서 깨짐 없음
7. [ ] SC-7 Primary accent 색상 #3182F6 일관 적용
8. [ ] SC-8 고객에게 보여줄 때 "토스인슈어런스" 브랜드 느낌이 즉시 전달됨

## 6. Risks & Mitigations
| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | CSS 선택자 변경으로 JS 에서 getElement 하던 것 깨짐 | 클래스 이름 유지, 스타일만 교체 · 작업 중 콘솔 에러 즉시 점검 |
| R2 | Toss Product Sans 한글 미지원 | fallback chain 명시 (Apple SD / Pretendard / Malgun Gothic) |
| R3 | 폰트 7종 로드 용량 (~1MB) | `font-display: swap` + 자주 쓰는 4종만 우선 로드 (Regular/Medium/Semibold/Bold) |
| R4 | 투명도·그림자 변경으로 가독성 저하 | 명도 대비 WCAG AA 기준(4.5:1) 유지 확인 |
| R5 | 토스 파랑이 기존 빨강 강조(금액)와 충돌 | 금액은 여전히 특화색 유지(진한 남색 또는 토스 딥블루) |
| R6 | 로고 파일이 file:// 에서 상대 경로 문제 | src 경로 검증 후 `?`・encoding 필요 시 처리 |
| R7 | overflow·wrap 변동으로 테이블 넓이 깨짐 | table-layout: fixed 유지, 새 폰트에 맞춰 폭 재조정 |

## 7. Out of Scope
- 기능 추가·수정 (이번 PR는 UI 전용)
- 다크 모드 (향후 옵션)
- 애니메이션·마이크로인터랙션 고급화 (기본 transition 만)
- 반응형 프레임워크 도입 (기존 CSS 확장으로 충분)
- 새 페이지 추가
