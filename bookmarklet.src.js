// 북마클릿 원본 (사람이 읽기 위한 버전)
// 이 파일은 brookmarklet을 생성할 때 참고용입니다. 실제 사용되는 미니파이 버전은 index.html에 내장됨.
(function () {
  const tables = [];

  document.querySelectorAll('table').forEach((tbl, idx) => {
    const rows = [];
    tbl.querySelectorAll('tr').forEach((tr) => {
      const cells = [...tr.children]
        .filter((c) => /^(TD|TH)$/i.test(c.tagName))
        .map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push({ title: 'Table ' + (idx + 1), rows });
  });

  document.querySelectorAll('[role="table"]').forEach((tbl, idx) => {
    const rows = [];
    tbl.querySelectorAll('[role="row"]').forEach((tr) => {
      const cells = [];
      tr.querySelectorAll('[role="cell"],[role="columnheader"],[role="rowheader"]').forEach((td) => {
        if (td.closest('[role="row"]') !== tr) return;
        cells.push(td.textContent.replace(/\s+/g, ' ').trim());
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push({ title: 'RoleTable ' + (idx + 1), rows });
  });

  // 중복 제거
  const seen = new Set();
  const unique = tables.filter((t) => {
    const k = t.rows.map((r) => r.join('|')).join('\n');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const payload = {
    source: location.href,
    extractedAt: new Date().toISOString(),
    tables: unique,
  };
  const json = JSON.stringify(payload);

  const showFallback = () => {
    const w = window.open('', '_blank');
    if (!w) {
      prompt(unique.length + '개 표를 추출했습니다. Ctrl+C 로 복사하세요.', json);
      return;
    }
    w.document.write(
      '<title>복사하세요</title>' +
      '<div style="font-family:sans-serif;padding:12px">' +
      unique.length + '개 표 추출. 아래 JSON 전체를 복사(Ctrl+A → Ctrl+C)해서 편집기에 붙여넣으세요.' +
      '</div>' +
      '<textarea style="width:calc(100% - 24px);height:80vh;margin:12px;font-family:monospace;font-size:12px">' +
      json.replace(/</g, '&lt;') +
      '</textarea>'
    );
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => alert(unique.length + '개 표를 클립보드에 복사했습니다.\n편집기로 돌아가 "📋 클립보드 붙여넣기" 버튼을 누르세요.'),
      showFallback
    );
  } else {
    showFallback();
  }
})();
