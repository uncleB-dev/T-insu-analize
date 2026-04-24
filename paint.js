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
  // 2. TUI Image Editor 초기화
  // 테마 객체는 키 검증이 까다로워(icon은 path/name만 허용 등) 에러 유발 →
  // 시각 커스터마이즈는 paint.css 의 CSS 오버라이드로 처리.
  // ---------------------------------------------------------------
  if (typeof tui === 'undefined' || !tui.ImageEditor) {
    console.error('[paint] TUI Image Editor 로드 실패');
    alert('그림판 라이브러리 로드 실패 — 인터넷 연결을 확인해 주세요.');
    return;
  }

  const rootEl = document.querySelector('#tui-image-editor');
  const editor = new tui.ImageEditor(rootEl, {
    includeUI: {
      loadImage: {
        path: data.dataURL,
        name: data.source || 'Capture',
      },
      // 실용적 7개 메뉴 (Mask/Filter 제외)
      menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text'],
      initMenu: 'draw',
      uiSize: {
        width: '100%',
        height: 'calc(100vh - 56px)',
      },
      menuBarPosition: 'top',
    },
    cssMaxWidth: 12000,
    cssMaxHeight: 8000,
    usageStatistics: false,
    selectionStyle: {
      cornerSize: 10,
      rotatingPointOffset: 60,
    },
  });

  // ---------------------------------------------------------------
  // 3a. TUI 메뉴바 + 헬프 메뉴를 Toss 헤더로 DOM 이동
  //     + Lucide 아이콘으로 일괄 교체 (일관성)
  // ---------------------------------------------------------------
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const tuiControls = document.querySelector('.tui-image-editor-controls');
      const tuiMenu = tuiControls?.querySelector('.tui-image-editor-menu');
      const tossHeader = document.querySelector('.paint-header');
      const anchor = document.getElementById('sourceInfo');

      // 메인 메뉴 이동
      if (tuiMenu && tossHeader && anchor) {
        tuiMenu.classList.add('in-toss-header');
        anchor.after(tuiMenu);
        if (tuiControls) tuiControls.classList.add('relocated');
      }

      // 헬프 메뉴(Zoom/Hand/History/Undo/Redo/Reset/Delete/DeleteAll) 이동
      const helpMenus = document.querySelectorAll('.tui-image-editor-help-menu');
      helpMenus.forEach((hm, i) => {
        hm.classList.add('in-toss-header');
        // 메인 메뉴 바로 앞(또는 뒤)에 배치 — 여기서는 앞쪽
        if (tuiMenu && tuiMenu.parentNode) {
          tuiMenu.parentNode.insertBefore(hm, tuiMenu);
        }
      });

      // Lucide 아이콘 교체 — 12개 일관 디자인
      applyLucideIcons();

      // 메인 컨테이너 top 오프셋: 헤더 56px + 서브메뉴 행 56px = 112px
      const mainContainer = document.querySelector('.tui-image-editor-main-container');
      if (mainContainer) {
        mainContainer.style.top = '112px';
        mainContainer.style.bottom = '0';
      }
    } catch (e) {
      console.warn('[paint] menu relocation failed', e);
    }
  }));

  // ---------------------------------------------------------------
  // Lucide (MIT) 아이콘 — 12개 공통 디자인
  // viewBox=24, stroke=2, round caps, currentColor로 상태별 색상 상속
  // ---------------------------------------------------------------
  const LUCIDE = {
    // 편집 도구
    'tie-btn-crop':     '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    'tie-btn-flip':     '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
    'tie-btn-rotate':   '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    'tie-btn-draw':     '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    'tie-btn-shape':    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/>',
    'tie-btn-icon':     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'tie-btn-text':     '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    // 헬프 메뉴
    'tie-btn-undo':     '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    'tie-btn-redo':     '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    'tie-btn-reset':    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'tie-btn-delete':   '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'tie-btn-deleteAll':'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    'tie-btn-zoomIn':   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
    'tie-btn-zoomOut':  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
    'tie-btn-hand':     '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    'tie-btn-history':  '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  };

  function applyLucideIcons() {
    Object.keys(LUCIDE).forEach(cls => {
      document.querySelectorAll('.' + cls).forEach(li => {
        const oldSvg = li.querySelector('svg');
        if (!oldSvg) return;
        const wrap = document.createElement('div');
        wrap.innerHTML =
          '<svg class="lucide" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" ' +
          'aria-hidden="true">' + LUCIDE[cls] + '</svg>';
        oldSvg.replaceWith(wrap.firstChild);
      });
    });
  }

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
  // 4a. 형광펜 — TUI 내장 없음. startDrawingMode('FREE_DRAWING') 로 구현
  //     두꺼운 노랑 반투명 브러시, 토글 동작
  // ---------------------------------------------------------------
  let highlighterActive = false;
  const hiBtn = document.getElementById('hiBtn');
  const HIGHLIGHTER_OPTS = {
    width: 22,
    color: 'rgba(255, 235, 59, 0.5)', // 연한 노랑 반투명
  };

  function toggleHighlighter() {
    if (!editor) return;
    try {
      if (highlighterActive) {
        editor.stopDrawingMode();
        highlighterActive = false;
        hiBtn?.classList.remove('active');
        toast('형광펜 OFF');
      } else {
        editor.stopDrawingMode();
        editor.startDrawingMode('FREE_DRAWING', HIGHLIGHTER_OPTS);
        highlighterActive = true;
        hiBtn?.classList.add('active');
        toast('형광펜 ON — 드래그로 칠하기');
      }
    } catch (e) {
      console.warn('highlighter error', e);
    }
  }
  hiBtn?.addEventListener('click', toggleHighlighter);

  // TUI 메뉴를 클릭하면 내부 drawing mode가 바뀌므로 형광펜 UI 상태 초기화
  // (document 델리게이션으로 이동 후에도 동작)
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.tui-image-editor-menu > .tui-image-editor-item');
    if (item && highlighterActive) {
      highlighterActive = false;
      hiBtn?.classList.remove('active');
    }
  });

  // ---------------------------------------------------------------
  // 4b. 이모지 스티커 — addText() 로 현재 캔버스 중앙에 삽입
  // ---------------------------------------------------------------
  document.querySelectorAll('[data-emoji]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (!emoji || !editor) return;
      try {
        // 캔버스 중앙에 배치
        const size = editor.getCanvasSize ? editor.getCanvasSize() : { width: 800, height: 600 };
        editor.addText(emoji, {
          styles: {
            fontSize: 64,
            fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
            fill: '#000000',
          },
          position: {
            x: Math.max(40, (size.width || 800) / 2 - 32),
            y: Math.max(40, (size.height || 600) / 2 - 32),
          },
        }).catch(err => console.warn('addText error', err));
      } catch (e) {
        console.warn('emoji insert error', e);
      }
    });
  });

  // ---------------------------------------------------------------
  // 5. 커스텀 버튼: 클립보드 / PDF / 닫기
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
  // 6. 키보드 단축키
  // ---------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      if (highlighterActive) { toggleHighlighter(); return; }
      window.close();
      return;
    }
    // H 키로 형광펜 토글
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      toggleHighlighter();
    }
    // Ctrl+S 로 다운로드
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
