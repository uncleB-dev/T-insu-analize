// =================================================================
// paint.js — TUI Image Editor 기반 재작성
// Design Ref: paint-tui.plan.md §3.3
// 의존: tui-image-editor + tui-color-picker + fabric v4 + jsPDF
// =================================================================
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // 1. 캡처 데이터 로드
  // ---------------------------------------------------------------
  const raw = localStorage.getItem('paintCapture');
  const data = raw ? safeParse(raw) : null;

  if (!data || !data.dataURL) {
    showEmptyState();
    return;
  }

  // 소스 정보 표시
  const srcEl = document.getElementById('sourceInfo');
  if (srcEl && data.source) {
    const sizeMB = Math.round(((data.dataURL.length * 3) / 4 / 1024 / 1024) * 10) / 10;
    srcEl.textContent = `${data.source} · ${data.w}×${data.h} · ${sizeMB}MB`;
  }

  // ---------------------------------------------------------------
  // 2. Toss 테마 정의 (TUI 기본 다크 → Toss 라이트 브랜드)
  // ---------------------------------------------------------------
  const tossTheme = {
    // 로고/헤더 — 저희 헤더를 쓰므로 TUI 로고 숨김
    'common.bi.image': '',
    'common.bisize.width': '0px',
    'common.bisize.height': '0px',
    'common.backgroundImage': 'none',
    'common.backgroundColor': '#F4F6FA',
    'common.border': '0px',

    // 상단(header) 영역 제거 — 우리 Toss 헤더가 대체
    'header.backgroundImage': 'none',
    'header.backgroundColor': 'transparent',
    'header.border': '0px',

    // Load/Download 버튼
    'loadButton.backgroundColor': '#FFFFFF',
    'loadButton.border': '1px solid #3182F6',
    'loadButton.color': '#3182F6',
    'loadButton.fontFamily': "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
    'loadButton.fontSize': '13px',
    'downloadButton.backgroundColor': '#3182F6',
    'downloadButton.border': '1px solid #3182F6',
    'downloadButton.color': '#FFFFFF',
    'downloadButton.fontFamily': "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
    'downloadButton.fontSize': '13px',

    // 메뉴 아이콘
    'menu.normalIcon.color': '#8A94A6',
    'menu.activeIcon.color': '#3182F6',
    'menu.disabledIcon.color': '#CBD1D8',
    'menu.hoverIcon.color': '#3182F6',
    'menu.iconSize.width': '24px',
    'menu.iconSize.height': '24px',
    'menu.backgroundColor': '#FFFFFF',

    // 서브메뉴
    'submenu.backgroundColor': '#FFFFFF',
    'submenu.partition.color': '#E5E8EB',
    'submenu.normalIcon.color': '#8A94A6',
    'submenu.normalIcon.size': '24px',
    'submenu.activeIcon.color': '#3182F6',
    'submenu.activeIcon.size': '24px',
    'submenu.iconSize.width': '24px',
    'submenu.iconSize.height': '24px',
    'submenu.normalLabel.color': '#4E5968',
    'submenu.normalLabel.fontWeight': 'normal',
    'submenu.activeLabel.color': '#3182F6',
    'submenu.activeLabel.fontWeight': 'bold',

    // Range 슬라이더
    'range.pointerColor': '#3182F6',
    'range.bar1Color': '#3182F6',
    'range.bar2Color': '#D1D6DB',
    'range.subbarColor': '#D1D6DB',
    'range.value.color': '#4E5968',
    'range.value.fontWeight': 'normal',
    'range.value.fontSize': '11px',
    'range.value.border': '1px solid #E5E8EB',
    'range.value.backgroundColor': '#FFFFFF',
    'range.title.color': '#4E5968',
    'range.title.fontWeight': 'normal',

    // 컬러피커
    'colorpicker.button.border': '1px solid #E5E8EB',
    'colorpicker.title.color': '#4E5968',

    // 체크박스
    'checkbox.border': '1px solid #8A94A6',
    'checkbox.backgroundColor': '#FFFFFF',
  };

  // ---------------------------------------------------------------
  // 3. TUI Image Editor 초기화
  // ---------------------------------------------------------------
  const rootEl = document.querySelector('#tui-image-editor');
  const editor = new tui.ImageEditor(rootEl, {
    includeUI: {
      loadImage: {
        path: data.dataURL,
        name: data.source || 'Capture',
      },
      theme: tossTheme,
      // 실용적 7개 메뉴만 노출 (Mask/Filter 제외)
      menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text'],
      initMenu: 'draw',
      uiSize: {
        width: '100%',
        height: 'calc(100vh - 56px)',
      },
      menuBarPosition: 'bottom',
    },
    cssMaxWidth: 12000,
    cssMaxHeight: 8000,
    usageStatistics: false,
    selectionStyle: {
      cornerSize: 10,
      rotatingPointOffset: 60,
    },
  });

  // 창 크기 변경 시 자동 리사이즈
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try {
        editor.ui.resizeEditor();
      } catch (e) {
        console.warn('resize error', e);
      }
    }, 100);
  });

  // ---------------------------------------------------------------
  // 4. 커스텀 버튼: 클립보드 / PDF / 닫기
  // ---------------------------------------------------------------
  document.getElementById('clipBtn')?.addEventListener('click', async () => {
    try {
      const dataURL = editor.toDataURL({ format: 'png' });
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = await (await fetch(dataURL)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('클립보드에 복사됨 — Ctrl+V 로 붙여넣기');
      } else {
        throw new Error('Clipboard API 미지원');
      }
    } catch (err) {
      console.warn('clipboard error', err);
      toast('클립보드 복사 실패 — PNG 다운로드로 대체');
      downloadPNG(editor.toDataURL({ format: 'png' }));
    }
  });

  document.getElementById('pdfBtn')?.addEventListener('click', () => {
    try {
      const dataURL = editor.toDataURL({ format: 'png' });
      if (!window.jspdf) {
        toast('jsPDF 로드 실패');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const { jsPDF } = window.jspdf;
        const orientation = img.width > img.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = img.width / img.height;
        let w = pw, h = pw / ratio;
        if (h > ph) { h = ph; w = ph * ratio; }
        const x = (pw - w) / 2, y = (ph - h) / 2;
        pdf.addImage(dataURL, 'PNG', x, y, w, h);
        pdf.save(`보장마크업_${new Date().toISOString().slice(0, 10)}.pdf`);
        toast('PDF 저장됨');
      };
      img.onerror = () => toast('이미지 로드 실패');
      img.src = dataURL;
    } catch (err) {
      console.error('pdf export error', err);
      toast('PDF 저장 실패');
    }
  });

  document.getElementById('closeBtn')?.addEventListener('click', () => {
    window.close();
  });

  // ---------------------------------------------------------------
  // 5. 키보드 단축키
  // ---------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') { window.close(); return; }
    // Ctrl+S 로 다운로드 (TUI 기본 Download 트리거)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      downloadPNG(editor.toDataURL({ format: 'png' }));
    }
  });

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function safeParse(str) {
    try { return JSON.parse(str); }
    catch (e) { return null; }
  }

  function showEmptyState() {
    const editorEl = document.getElementById('tui-image-editor');
    const empty = document.getElementById('emptyState');
    if (editorEl) editorEl.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    // 커스텀 버튼 비활성화
    ['clipBtn', 'pdfBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = true;
    });
  }

  function downloadPNG(dataURL) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `보장마크업_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('PNG 다운로드됨');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // 전역 노출 (디버깅용)
  window.__editor = editor;
})();
