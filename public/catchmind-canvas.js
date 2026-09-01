'use strict';
// 캐치마인드 공용 캔버스 렌더러 — 0..1 정규화 좌표의 스트로크 배열을 그린다.
// 선 굵기(w)는 가로 800px 기준 px 값.

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = Math.round(width * 0.75); // 4:3
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  return canvas.getContext('2d');
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
