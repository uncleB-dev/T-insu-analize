# product-tabs — Plan

- **Feature**: product-tabs
- **Created**: 2026-04-24
- **Phase**: Plan
- **Level**: Starter (static HTML/CSS/JS)

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 편집기·DB 뷰는 전체 상품을 한 화면에 보여줘 특정 상품에 집중하기 어려움. 고객 상담 시 "이 보험 하나만" 집어보기 불편. |
| **Solution** | 상단 가로 탭으로 상품을 분리, 탭 선택 시 그 상품의 계약·납입·보장 정보만 집약해서 표시. |
| **Function UX** | `product.html` 신규 페이지. 상품명 탭 클릭 → 3섹션 단일 상품 뷰 (읽기 전용). 편집기·DB와 localStorage 공유. |
| **Core Value** | "이 고객이 이 상품에 무엇을 가졌나"를 1클릭에. 컨설턴트가 고객별·상품별 설명 자료로 바로 사용 가능. |

## Context Anchor

| 축 | 내용 |
|---|---|
| **WHY** | 편집기·DB는 전체 비교에 최적이지만, 상품 단위 설명·확인용 집중 뷰가 없음. |
| **WHO** | 보험 컨설턴트 — 단일 고객의 상품별 설명 시 사용. |
| **RISK** | 긴 상품명 / 상품 수가 많을 때 탭 오버플로, 편집기 수정값 반영 지연. |
| **SUCCESS** | 탭 전환 1클릭, 3섹션 모두 누락 없이 표시, 편집기 데이터 자동 복원, 숨김 상품 제외. |
| **SCOPE** | 신규 3파일(product.html/css/js). 기존 schema.js·parser.js·styles.css 재사용. 읽기 전용. |

## 1. Requirements

### 1.1 Functional
1. `product.html` 신규 — 편집기(index.html)·DB(db.html)에 이어 3번째 페이지.
2. 상단 헤더: 제목·편집기/DB 복귀 링크·HTML 불러오기·클립보드 붙여넣기·북마클릿 (편집기와 동등).
3. 상단 가로 스크롤 **탭 바** — `state.insurance.products` 기준, 숨김 상품 제외. 탭 라벨은 상품 `보험명`.
4. 탭 패널 3섹션:
   - **기본 계약 정보**: 보험사명 · 계약일 · 계약상태(태그) · 갱신 유무(태그) · 계약자/피보험자 · 증권번호.
   - **납입/보험료 정보**: 납입 여부(태그) · 납입주기/납입기간 · 보장만기/만기연령 · 납입종료일/종료연령 · 월납/기납/잔여/총 보험료(4개 요약 카드).
   - **이 상품의 보장 목록**: `state.products[idx].coverages` 를 `SCHEMA.productCoverage.columns` 8컬럼으로 테이블 렌더.
5. 클립보드/HTML 드롭 로딩 로직은 편집기와 동일 (`parseHtml()` 공유).
6. 편집기·DB 헤더에 `📇 상품별 뷰 ▸` 링크 추가.

### 1.2 Non-Functional
- 읽기 전용 (편집은 편집기에서 수행, 이 페이지는 조회 전용).
- `table-layout: fixed` 적용, 기존 스타일 토큰(`styles.css`) 재사용.
- 탭 키보드 내비게이션 (← → 방향키).
- 페이지 크기 데스크톱 우선, 최소 너비 1024px.

## 2. Architecture — Option C (실용적 균형)

### 2.1 선택 이유
| 옵션 | 장점 | 단점 | 채택 |
|---|---|---|---|
| A. db.html에 D탭 추가 | 1파일 수정, 최소 변경 | 사용자가 "새 페이지" 요청 | ❌ |
| B. 전용 라우터 구조 | 확장성 최고 | 정적 HTML에 과투자 | ❌ |
| **C. 새 HTML + 로직/스타일 공유** | 기존 구조 일관, 책임 분리 | 파일 3개 추가 | ✅ |

### 2.2 파일 구조
```
baek/
├── index.html, app.js              (편집기, 기존)
├── db.html, db.js, db.css          (DB 3탭, 기존)
├── product.html   [신규]
├── product.js     [신규]
├── product.css    [신규]
├── schema.js      (공유, 기존)
├── parser.js      (공유, 기존)
└── styles.css     (공유, 기존)
```

### 2.3 데이터 흐름
```
편집기/DB → localStorage['coverageDbState'] → product.html 부팅 시 loadSharedState()
                                                    ↓
                                            state = { insurance.products, products, ... }
                                                    ↓
                                         탭 렌더 (visible 상품만)
                                                    ↓
                                    탭 클릭 → renderPanel(productIdx)
                                                    ↓
                          섹션 A (계약) / 섹션 B (납입) / 섹션 C (보장)
```

## 3. Implementation Guide

### 3.1 Module Map
| 모듈 | 역할 |
|---|---|
| M1. HTML 뼈대 | 헤더·탭바·패널 루트 |
| M2. 상태 로드 | `loadSharedState()` + storage 이벤트 리스너 (편집기 수정 감지) |
| M3. 탭 렌더 | 상품 배열 → 탭 버튼, 활성 탭 추적(`activeIdx`) |
| M4. 섹션 A 렌더 | 기본 계약 정보 (6필드 key-value 그리드) |
| M5. 섹션 B 렌더 | 납입 요약 카드 4개 + 상세 필드 |
| M6. 섹션 C 렌더 | 보장 목록 테이블 (공유 `SCHEMA.productCoverage.columns`) |
| M7. CSS | 탭바·섹션 레이아웃·카드·responsive |

### 3.2 권장 세션 분할
- **Session 1 (M1+M2+M3)**: 뼈대 + 탭 UI 완성, 임시 패널 렌더
- **Session 2 (M4+M5+M6)**: 3섹션 데이터 바인딩
- **Session 3 (M7)**: 스타일 폴리싱

### 3.3 Code Reference Comments
```js
// Plan SC-4: 3섹션 모두 누락 없이 렌더
function renderPanel(idx) { ... }
// Plan SC-5: 숨김 상품은 탭에서 제외
const visible = state.insurance.products.filter(p => !p.hidden);
```

## 4. Success Criteria
1. [ ] `product.html` 파일 생성, `file://` 프로토콜에서 직접 열림
2. [ ] 편집기에서 HTML 로드 후 이 페이지 열면 자동 복원됨
3. [ ] 상품 수만큼 탭 생성, 탭 클릭 시 해당 상품 정보로 전환
4. [ ] 섹션 A/B/C 모두 정상 렌더, 값 누락 없음
5. [ ] 숨김 상품은 탭에서 제외됨
6. [ ] 편집기·DB 헤더에 진입 링크 추가, 상호 이동 가능
7. [ ] 편집기에서 값 수정 → 이 페이지로 돌아와 새로고침 시 반영

## 5. Risks & Mitigations
| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | 긴 상품명 → 탭 오버플로 | 탭 `max-width: 220px` + `text-overflow: ellipsis`, 호버 툴팁 전체 표시 |
| R2 | 상품 ≥ 10개 시 탭바 난잡 | 가로 스크롤 + 좌우 화살표 버튼 + 방향키 내비 |
| R3 | 편집기 수정 반영 지연 | `window.addEventListener('storage')` 로 자동 갱신 |
| R4 | `header` 텍스트 ("교보생명 교보상해케어보험23.11(무배당) 정상") 포맷 다양 | 정규식으로 보험사명·상품명·상태 분리 파싱, 실패 시 원문 그대로 표시 |
| R5 | `state.products`와 `state.insurance.products`의 상품 수 불일치 (CRM 데이터 누락 시) | 매칭 가능한 것만 탭 생성, 매칭 실패는 하단 "미매칭 상품" 영역에 따로 표시 |

## 6. Out of Scope
- 편집 기능 (이 페이지는 읽기 전용)
- 카테고리 매트릭스 요약 (사용자 답변에서 제외)
- 여러 고객 비교 (v2)
- 인쇄/PDF 내보내기 (필요 시 별도 티켓)
