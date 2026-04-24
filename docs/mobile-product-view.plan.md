# mobile-product-view — Plan

- **Feature**: mobile-product-view
- **Created**: 2026-04-24
- **Phase**: Plan
- **Level**: Starter

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 편집기·DB·기존 상품별 뷰 모두 가로 폭이 넓어 모바일 가독성 저하. 영업 현장에서 고객에게 상품 내역을 바로 보여주기 어려움. |
| **Solution** | `index.html`을 모바일 최적화 상품별 뷰로 교체. 상단 고객 요약 + 상품 탭 + 2행 4열 요약표 + 4컬럼 담보 상세 표. 기존 편집기는 `editor.html`로 이동. |
| **Function UX** | 탭 1클릭 전환, 모바일 375px 너비에서 핵심 정보 한 화면 ·담보 상세 세로 스크롤. 편집은 `editor.html`에서 수행, 변경은 `storage` 이벤트로 자동 반영. |
| **Core Value** | 컨설턴트가 스마트폰을 꺼내 고객에게 "당신의 보험"을 즉시 보여주는 상담 자료로 사용. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | 모바일 환경에서 고객 상품 내역을 컴팩트 표로 즉시 조회해야 하는 영업 현장 요구 |
| **WHO** | 이동 중 고객을 만나는 보험 컨설턴트 |
| **RISK** | 긴 상품명/담보명 줄바꿈, 많은 담보 시 스크롤 부담, 기존 북마크 깨짐 |
| **SUCCESS** | 375px 뷰포트에서 상품 요약표 컷 없이 렌더, 담보표 4컬럼 가독성, 편집기 수정 반영 |
| **SCOPE** | `index.html` 교체 (→`editor.html`로 기존 이동), `product.html` 통합, 반응형 CSS |

## 1. Requirements

### 1.1 Functional
1. **파일 재배치**
   - 기존 `index.html` (편집기) → `editor.html` 로 이름 변경
   - 기존 `product.html` → `index.html` 로 승격 (새 기본 진입점)
   - 모든 페이지의 내부 링크 갱신 (`db.html`, `editor.html` 내부 링크)
2. **상단 고객 요약 헤더**
   - `{성별·나이}님의 상품별 가입담보 상세` 형식
   - 우측: 기준일시 + `보장 총 N개` 표시
   - 기존 `state.basic` 필드 활용 (성별·생년월일 → 나이 계산)
3. **탭 바** (기존 유지)
   - `state.insurance.products` 의 visible 항목만 탭 생성
   - 탭 레이블 = 상품명. 좌우 화살표 + 가로 스크롤 + 키보드 방향키
4. **상품 블록 헤더**
   - 1행: 보험사명 (작게)
   - 2행: 상품명 (강조) · 우측 끝 `가입일자 : YYYY-MM-DD`
5. **요약표** (2행 4열 고정)
   - Row 1: `계약자/피보험자` · `어*길/하은희` · `납입주기/납입기간/만기` · `월납/20년/49세만기`
   - Row 2: `보험기간` · `2009-01-16~2029-01-16` · `월납 보험료` · `27,000원`
   - 모바일(≤640px): 2행 4열 → 4행 2열로 자동 전환
   - `보험기간` = `계약일 ~ 보장만기` 조합 (보장만기가 "YYYY-MM-DD / 만기연령" 형식이면 앞부분만)
   - `납입주기/납입기간/만기` = `납입주기/납입기간` + `/` + `보장만기/만기연령`의 연령 부분 조합
6. **담보 상세 표** (4컬럼)
   - 헤더: `NO | 회사 담보명 | 신청원 담보명 | 가입금액`
   - 원본 매핑:
     - 회사 담보명 = `cov.name.split('/')[0]` (슬래시 앞 = 실제 약관 담보명)
     - 신청원 담보명 = `cov.minor` (표준 분류명)
     - 가입금액 = `cov.amount`
     - 빈 minor 는 `-` 표시
   - 모든 행 등장 (현재 상품에 귀속된 `coverages` 전체)
7. **편집 연동**
   - 이 페이지는 읽기 전용
   - `editor.html` 링크 상단 배치
   - `storage` 이벤트로 편집 변경 자동 반영

### 1.2 Non-Functional
- **타깃 해상도**: 모바일 375px 기준 · 태블릿 768px · 데스크톱 1024px+
- **모바일 가독성**:
  - 기본 폰트 12px, 헤더 14-15px, 상품명 16-17px
  - 표 라인 높이 1.4, 셀 패딩 6-8px
  - 표 `table-layout: fixed` + `word-break: break-word` (담보명 2줄 허용)
- **인쇄**: A4 세로 기준 1상품 1페이지 내 출력 (별도 티켓, 이번 범위 아님)
- **의존성**: 추가 없음 (기존 schema.js · parser.js · styles.css 재사용)

## 2. Architecture — Option C (실용적 균형 — 추천)

### 2.1 옵션 비교
| 옵션 | 장점 | 단점 | 채택 |
|---|---|---|---|
| A. product.html을 그대로 index.html로 rename | 최소 변경 | 기존 index.html 로직을 editor.html로 이동해야 함 | ⚠️ 일부 |
| B. 완전히 새로 설계 (뷰 컴포넌트 프레임워크) | 확장성 최고 | 정적 HTML 프로젝트에 과투자 | ❌ |
| **C. rename + 내부 레이아웃 재작성 + 모바일 CSS 분리** | 구조 일관, 점진적 교체 | 파일 이동 + CSS 신규 | ✅ |

### 2.2 파일 구조 (변경 후)
```
baek/
├── index.html    [신규]  (현 product.html을 대체, 새 레이아웃)
├── index.css     [신규]  (모바일 최적화 스타일)
├── index.js      [신규]  (현 product.js 기반, 새 표 렌더)
├── editor.html   [rename] (← index.html)
├── db.html                (기존)
├── db.css/.js             (기존)
├── app.js                 (편집기 로직, editor.html이 로드)
├── schema.js              (공유)
├── parser.js              (공유)
└── styles.css             (공유)

※ product.html / product.js / product.css — 삭제 (기능이 index.* 로 흡수됨)
```

### 2.3 데이터 흐름
```
editor.html (편집) → localStorage['coverageDbState']
                                   ↓
             index.html (모바일 뷰) boot 시 loadSharedState()
                                   ↓
               상단 고객헤더 · 탭 · [상품블록헤더 · 요약표 · 담보표]
                                   ↓
         storage 이벤트 감지 → editor에서 수정 시 자동 재렌더
```

## 3. Implementation Guide

### 3.1 Module Map
| 모듈 | 역할 | 참고 |
|---|---|---|
| M1 | 파일 재배치 (editor.html 생성, index.* 신규) | 링크 업데이트 포함 |
| M2 | 고객 요약 헤더 (성별·나이 · 총보장수) | `state.basic` + `state.products` 사용 |
| M3 | 상품 블록 헤더 (보험사·상품명·가입일) | `state.insurance.products[i]` |
| M4 | 요약표 2×4 → 모바일 4×2 | 반응형 CSS Grid |
| M5 | 담보 상세 4컬럼 표 | `cov.name.split('/')[0]` 파싱 |
| M6 | 모바일 CSS (`index.css`) | 미디어 쿼리 320/640/1024 |

### 3.2 권장 세션 분할
- **Session 1 (M1)**: 파일 rename + 내부 링크 일괄 갱신
- **Session 2 (M2-M5)**: 새 레이아웃 렌더러 작성
- **Session 3 (M6)**: 모바일 반응형 CSS 폴리싱

### 3.3 핵심 매핑 규칙
```js
// 고객 요약 헤더
const title = `${state.basic['성별']} · ${age(state.basic['생년월일'])}세님의 상품별 가입담보 상세`;

// 상품 블록 헤더
const insurer = product['보험사명'];
const productName = product['보험명'];
const joinDate = product['계약일'];

// 요약표 값
const contractor = product['계약자/피보험자'];
const paymentInfo = `${product['납입주기/납입기간']} / ${extractAge(product['보장만기/만기연령'])}`;
const period = `${product['계약일']} ~ ${extractDate(product['보장만기/만기연령'])}`;
const monthly = product['월납보험료'];

// 담보 상세 4컬럼
coverages.map((c, i) => ({
  no: i + 1,
  companyName: (c.name || '').split('/')[0] || '-',
  standardName: c.minor || '-',
  amount: c.amount || '-',
}));
```

## 4. Success Criteria
1. [ ] SC-1: `file://.../index.html` 접속 시 상품별 모바일 뷰 표시
2. [ ] SC-2: `editor.html` 로 편집기 접근 가능, 상호 링크 정상
3. [ ] SC-3: 탭 UI 유지 (기존 product.js 로직 재사용), 상품 전환 1클릭
4. [ ] SC-4: 각 상품 블록 = 블록 헤더 + 2×4 요약표 + 4컬럼 담보표 완비
5. [ ] SC-5: Chrome DevTools 모바일 375px 뷰포트에서 가로 스크롤 없이 요약표 표시, 담보표는 세로 스크롤만
6. [ ] SC-6: DB 뷰(db.html) 및 `editor.html`에서 index.html 진입 링크 정상
7. [ ] SC-7: 편집기에서 값 수정 후 새로고침 없이 모바일 뷰 자동 반영 (storage 이벤트)
8. [ ] SC-8: 탭·요약표·담보표 컬럼 폭이 `table-layout: fixed` 로 고정, 긴 텍스트 적절히 wrap/ellipsis

## 5. Risks & Mitigations
| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | 긴 보험사명/상품명 줄바꿈 | 상품명 `white-space: nowrap + text-overflow: ellipsis` + 호버 툴팁 |
| R2 | 긴 담보명 2줄 초과 | 셀 `max-height: 2.8em` + 세로 ellipsis, 호버 툴팁으로 전체 표시 |
| R3 | `보험기간` 필드가 state 에 없음 | `계약일 ~ 보장만기` 파싱해서 합성, 실패 시 `-` |
| R4 | 기존 북마크/링크가 index.html을 편집기로 알고 있음 | editor.html 생성 + index.html 상단에 "편집기 바로가기" 큰 버튼 배치 |
| R5 | 고객명이 `state.basic`에 없음 (CRM에 없는 필드) | 헤더 제목에 이름 생략, `성별·나이님의` 형식만 사용 |
| R6 | 생년월일로부터 나이 계산 시 만나이/세는나이 혼동 | CRM 원본 표기("보험나이 23세")를 그대로 활용. 없으면 계산 생략. |

## 6. Out of Scope
- 인쇄/PDF 내보내기 (별도 티켓)
- 편집 기능 (editor.html에 일원화)
- "구분" 컬럼 (정액/실손) — 사용자 답변에서 제외
- 복수 고객 비교 (v2)
- 검색/필터 (현재 페이지는 단순 조회 목적)
