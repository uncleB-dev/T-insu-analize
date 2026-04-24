// =================================================================
// paint-capture.js — 🎨 버튼 핸들러
// 현재 화면을 html2canvas로 캡처 → localStorage 저장 → paint.html 새 탭 열기
// file:// 환경에서도 localStorage는 같은 origin 탭 간 공유됨
// Design Ref: paint-tui.plan.md §3.3
// =================================================================
(function () {
  // 공개 API
  window.openPaintTab = async function openPaintTab() {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas 로드 실패 — 인터넷 연결 확인');
      return;
    }

    if (window.toast) window.toast('캡처 중...');
    document.body.classList.add('paint-capturing');

    // 페이지 + 모든 스크롤 컨테이너를 최상단/최좌측으로
    const savedScroll = [];
    try {
      const origX = window.scrollX;
      const origY = window.scrollY;
      window.scrollTo(0, 0);
      savedScroll.push({ el: window, x: origX, y: origY });

      const scrollables = document.querySelectorAll(
        '.overview-wrap, .coverage-table-wrap, .panel, main'
      );
      scrollables.forEach(el => {
        savedScroll.push({ el, x: el.scrollLeft, y: el.scrollTop });
        el.scrollLeft = 0;
        el.scrollTop = 0;
      });

      // 레이아웃 안정화
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // overview 페이지는 .overview-wrap 만, 나머지는 main 전체
      const target =
        document.querySelector('.overview-wrap') ||
        document.querySelector('main') ||
        document.body;

      const rawW = Math.max(target.scrollWidth, target.offsetWidth, 800);
      const rawH = Math.max(target.scrollHeight, target.offsetHeight, 600);

      // canvas 크기 상한 (브라우저 한계 회피)
      const MAX_PX = 8000;
      let scale = Math.min(window.devicePixelRatio || 1, 1.5);
      if (rawW * scale > MAX_PX) scale = MAX_PX / rawW;
      if (rawH * scale > MAX_PX) scale = Math.min(scale, MAX_PX / rawH);
      scale = Math.max(0.4, scale);

      const cap = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale,
        width: rawW,
        height: rawH,
        windowWidth: rawW,
        windowHeight: rawH,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        logging: false,
      });

      const dataURL = cap.toDataURL('image/png', 0.92);

      const payload = {
        dataURL,
        source: (location.pathname.split('/').pop() || 'page').replace('.html', ''),
        w: cap.width,
        h: cap.height,
        ts: Date.now(),
      };

      // localStorage에 저장 (quota 초과 시 JPEG로 재시도)
      try {
        localStorage.setItem('paintCapture', JSON.stringify(payload));
      } catch (storageErr) {
        console.warn('[paint-capture] localStorage quota exceeded, retrying with JPEG', storageErr);
        const jpeg = cap.toDataURL('image/jpeg', 0.75);
        localStorage.setItem('paintCapture', JSON.stringify({ ...payload, dataURL: jpeg }));
      }

      // 새 탭 열기 (사용자 클릭 컨텍스트 내 호출 — 팝업 차단 우회)
      const tab = window.open('paint.html', '_blank');
      if (!tab) {
        alert('팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단 아이콘을 눌러 허용해주세요.');
      }
    } catch (err) {
      console.error('[paint-capture] error', err);
      alert('캡처 실패: ' + (err?.message || err));
    } finally {
      document.body.classList.remove('paint-capturing');
      // 스크롤 위치 복원
      savedScroll.forEach(s => {
        if (s.el === window) window.scrollTo(s.x, s.y);
        else { s.el.scrollLeft = s.x; s.el.scrollTop = s.y; }
      });
    }
  };

  // 기존 이름 호환 별칭
  window.openPaintOverlay = window.openPaintTab;
  window.capturePageAndOpenPaint = window.openPaintTab;
})();
