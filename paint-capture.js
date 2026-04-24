// Design Ref: Plan §3.3 — html2canvas 캡처 + 새 탭 + postMessage 전달
// file:// 프로토콜에서는 sessionStorage 공유 불가, child window.location 접근 불가
// → postMessage 로 opener↔child 통신

window.capturePageAndOpenPaint = async function capturePageAndOpenPaint() {
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas 가 로드되지 않았습니다. 인터넷 연결 확인 필요.');
    return;
  }

  // 팝업 차단 우회 — 클릭 핸들러 내에서 먼저 새 탭 열기
  const w = window.open('paint.html', '_blank');
  if (!w) { alert('팝업 차단됨. 브라우저 설정에서 팝업 허용 후 다시 시도해주세요.'); return; }

  try {
    if (window.toast) window.toast('캡처 중...');
    document.body.classList.add('paint-capturing');
    window.scrollTo(0, 0);
    // 레이아웃 재계산 대기
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 정보 영역만 캡처 — main 우선, 없으면 body
    const target = document.querySelector('main') || document.body;

    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      windowWidth: Math.min(target.scrollWidth, 2400),
      useCORS: true,
      logging: false,
    });
    const dataURL = canvas.toDataURL('image/png', 0.92);
    const captureId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const payload = {
      id: captureId,
      dataURL,
      source: location.pathname,
      w: canvas.width,
      h: canvas.height,
      capturedAt: new Date().toISOString(),
    };

    // 이전 캡처 데이터 무효화 (file:// 에서 예기치 않은 sessionStorage 공유 방지)
    try { sessionStorage.removeItem('paintCanvas'); } catch {}
    try { localStorage.removeItem('paintCanvas'); } catch {}

    // child 가 ready 신호 보내면 payload 전송
    const onMsg = (e) => {
      if (e.source === w && e.data && e.data.type === 'paint:ready') {
        w.postMessage({ type: 'paint:data', payload }, '*');
        window.removeEventListener('message', onMsg);
      }
    };
    window.addEventListener('message', onMsg);

    // 안전망 — 최대 6초간 ready 를 기다리다가 강제로 push 시도
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 6) { clearInterval(timer); return; }
      if (w.closed) { clearInterval(timer); return; }
      try { w.postMessage({ type: 'paint:data', payload }, '*'); } catch {}
    }, 1000);
  } catch (err) {
    console.error('capture failed', err);
    alert('캡처 실패: ' + (err.message || err));
    try { if (!w.closed) w.close(); } catch {}
  } finally {
    document.body.classList.remove('paint-capturing');
  }
};
