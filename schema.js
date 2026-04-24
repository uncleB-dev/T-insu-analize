// Fixed schemas for the coverage viewer — separated for clarity.
// The renderer uses these as the canonical structure; parsed data fills in values.
window.SCHEMA = {
  basic: {
    fields: ['성별', '생년월일', '상령일', '최초 보험연결일', '상담 문의'],
  },
  insurance: {
    // Row labels in fixed order (17 rows). Columns are products (variable N).
    rows: [
      '보험명', '보험사명', '계약일', '계약상태', '갱신 유무',
      '계약자/피보험자', '증권번호', '납입 여부', '납입주기/납입기간',
      '보장만기/만기연령', '납입종료일/종료연령',
      '월납보험료', '기납보험료', '잔여보험료', '총보험료',
      '매니저 의견', '매니저 코멘트',
    ],
  },
  category: {
    // Initial category rows — user can add/move/hide at runtime.
    seeds: [
      ['실비', '질병입원의료비'], ['실비', '질병외래의료비'], ['실비', '질병처방조제료'],
      ['실비', '상해입원의료비'], ['실비', '상해외래의료비'], ['실비', '상해처방조제료'],
      ['3대진단', '일반암진단'], ['3대진단', '소액암(유사암)진단'], ['3대진단', '고액암진단'],
      ['3대진단', '뇌혈관질환진단'], ['3대진단', '뇌졸중질환진단'], ['3대진단', '뇌출혈질환진단'],
      ['3대진단', '허혈성심장질환진단'], ['3대진단', '급성심근경색진단'],
      ['수술비', '질병수술'], ['수술비', '상해수술'], ['수술비', '암수술'],
      ['수술비', '뇌혈관질환수술'], ['수술비', '허혈성심장질환수술'],
      ['입원일당', '질병입원'], ['입원일당', '상해입원'],
      ['사망', '질병사망'], ['사망', '상해사망'],
      ['후유장해', '질병80%이상후유장해'], ['후유장해', '질병80%미만후유장해'],
      ['후유장해', '상해80%이상후유장해'], ['후유장해', '상해80%미만후유장해'],
      ['골절화상', '골절진단'], ['골절화상', '화상진단'],
      ['생활배상책임', '가족생활배상책임담보'], ['생활배상책임', '일상생활배상책임담보'],
      ['운전자', '교통사고처리지원금'], ['운전자', '벌금(대물)'], ['운전자', '벌금(대인)'],
      ['운전자', '변호사선임비용'], ['운전자', '자동차부상치료비'],
      ['화재', '화재벌금'],
      ['치아', '보존치료'], ['치아', '보철치료'],
    ],
  },
  productCoverage: {
    columns: [
      { key: 'contractor', label: '계약자 / 피보험자', width: 130 },
      { key: 'major',      label: '보장 대분류',       width: 110 },
      { key: 'minor',      label: '보장 소분류',       width: 150 },
      { key: 'name',       label: '보장명',           width: 320, flex: true },
      { key: 'amount',     label: '보장 금액',         width: 120, align: 'right' },
      { key: 'term',       label: '납입기간',         width: 90 },
      { key: 'start',      label: '보장시작일',        width: 120 },
      { key: 'end',        label: '보장종료일',        width: 120 },
    ],
  },
  widths: {
    actionCol: 30,      // row action column (single ⋯ button)
    labelCol: 170,      // 가입보험/카테고리 공통 좌측 라벨 컬럼 (보험사명/보장명 등)
    productCol: 170,    // 가입보험/카테고리 공통 상품 컬럼 (세로 정렬을 위해 동일 폭)
    totalCol: 120,      // 카테고리 "보험명(합계)" 컬럼
    amountCol: 120,
    dateCol: 120,
    termCol: 90,
  },
};
