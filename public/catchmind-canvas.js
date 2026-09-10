'use strict';
// 캐치마인드 공용 캔버스 렌더러 — 0..1 정규화 좌표의 스트로크 배열을 그린다.
// 선 굵기(w)는 가로 800px 기준 px 값.

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || Math.round(canvas.getBoundingClientRect().width) || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const height = Math.round(width * 0.75); // 4:3
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  return canvas.getContext('2d');
}

// 스트로크를 그려진 순서대로 애니메이션 재생한다(영상처럼). 취소 함수를 반환.
function replayStrokes(canvas, strokes, opts = {}) {
  const pointsPerFrame = opts.pointsPerFrame || 6;
  const ctx = setupCanvas(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let si = 0, pi = 0, raf = 0, cancelled = false;

  function step() {
    if (cancelled) return;
    for (let k = 0; k < pointsPerFrame; k++) {
      if (si >= strokes.length) { if (opts.onDone) opts.onDone(); return; }
      const s = strokes[si];
      ctx.strokeStyle = s.c;
      ctx.lineWidth = (s.w / 800) * canvas.width;
      if (s.points.length === 1) {
        const [x, y] = s.points[0];
        ctx.beginPath();
        ctx.moveTo(x * canvas.width, y * canvas.height);
        ctx.lineTo(x * canvas.width + 0.01, y * canvas.height);
        ctx.stroke();
        si++; pi = 0;
      } else if (pi > 0) {
        const [x0, y0] = s.points[pi - 1];
        const [x1, y1] = s.points[pi];
        ctx.beginPath();
        ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
        ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
        ctx.stroke();
        pi++;
        if (pi >= s.points.length) { si++; pi = 0; }
      } else {
        pi = 1; // 첫 점은 시작점, 세그먼트는 다음부터
      }
    }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return function cancel() { cancelled = true; cancelAnimationFrame(raf); };
}

function renderStrokes(canvas, strokes) {
  const ctx = setupCanvas(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = (s.w / 800) * canvas.width;
    ctx.beginPath();
    s.points.forEach(([x, y], i) => {
      const px = x * canvas.width;
      const py = y * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (s.points.length === 1) {
      const [[x, y]] = s.points;
      ctx.lineTo(x * canvas.width + 0.01, y * canvas.height);
    }
    ctx.stroke();
  }
}
