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
      // 모든 메뉴를 상단으로
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
  document.querySelectorAll('.tui-image-editor-menu > .tui-image-editor-item').forEach(el => {
    el.addEventListener('click', () => {
      if (highlighterActive) {
        highlighterActive = false;
        hiBtn?.classList.remove('active');
      }
    });
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
