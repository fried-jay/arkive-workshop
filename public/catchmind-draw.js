'use strict';

const key = new URLSearchParams(location.search).get('key');
const canvas = document.getElementById('canvas');
const drawError = document.getElementById('draw-error');

let strokes = [];
let current = null;
let color = '#111827';
let width = 5;
let submitted = false;

function show(id) {
  for (const v of ['invalid-view', 'draw-view', 'done-view']) {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  }
}

function redraw() {
  renderStrokes(canvas, current ? [...strokes, current] : strokes);
}

// --- 그리기 입력 (pointer events, 좌표 0..1 정규화) ---
function pointOf(e) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return [Number(x.toFixed(4)), Number(y.toFixed(4))];
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  current = { points: [pointOf(e)], c: color, w: width };
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!current) return;
  if (current.points.length >= 500) { // 서버 한도 — 획을 끊어서 계속
    strokes.push(current);
    current = { points: [current.points.at(-1)], c: color, w: width };
  }
  current.points.push(pointOf(e));
  redraw();
});
function endStroke() {
  if (!current) return;
  strokes.push(current);
  current = null;
  redraw();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

// --- 도구 ---
for (const btn of document.querySelectorAll('.color')) {
  btn.addEventListener('click', () => {
    color = btn.dataset.color;
    document.querySelectorAll('.color').forEach((b) => b.classList.toggle('active', b === btn));
  });
}
document.getElementById('size-btn').addEventListener('click', (e) => {
  width = width === 5 ? 14 : 5;
  e.target.classList.toggle('active', width === 14);
});
document.getElementById('undo-btn').addEventListener('click', () => {
  strokes.pop();
  redraw();
});
document.getElementById('clear-btn').addEventListener('click', () => {
  if (strokes.length && !confirm('전부 지울까요?')) return;
  strokes = [];
  redraw();
});
window.addEventListener('resize', redraw);

// --- 제출 ---
document.getElementById('submit-btn').addEventListener('click', async () => {
  drawError.textContent = '';
  const word = document.getElementById('word-input').value.trim();
  if (!word) {
    drawError.textContent = '정답 단어를 입력해주세요.';
    return;
  }
  if (strokes.length === 0) {
    drawError.textContent = '그림을 그려주세요!';
    return;
  }
  if (!confirm(`정답 "${word}" 로 제출할까요? 제출하면 모두에게 공개돼요.`)) return;
  const res = await fetch('/api/catchmind/draw/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, strokes, word }),
  });
  if (!res.ok) {
    const code = (await res.json()).error;
    drawError.textContent = code === 'DRAW_KEY_INVALID'
      ? '링크가 만료됐어요. 진행자에게 다시 요청해주세요.'
      : '제출에 실패했어요. 다시 시도해주세요.';
    return;
  }
  submitted = true;
  show('done-view');
  watchGuesses();
});

// --- 제출 후 피드 ---
function renderFeed(snap) {
  const feed = document.getElementById('feed');
  feed.replaceChildren(...snap.guesses.slice().reverse().map((g) => {
    const li = document.createElement('li');
    li.textContent = `${g.name}: ${g.text}`;
    return li;
  }));
  if (snap.status === 'revealed') {
    const result = document.getElementById('result');
    result.classList.remove('hidden');
    result.textContent = snap.winnerName
      ? `🎉 ${snap.winnerName}님 정답! ("${snap.word}")`
      : `아무도 못 맞혔어요… 정답은 "${snap.word}"`;
  }
}

function watchGuesses() {
  const source = new EventSource('/api/catchmind/events');
  source.onmessage = (e) => renderFeed(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(watchGuesses, 2000);
  };
}

// --- 초기화: 키 검증 ---
(async function init() {
  const res = await fetch(`/api/catchmind/draw/${encodeURIComponent(key ?? '')}`);
  if (!res.ok) {
    show('invalid-view');
    return;
  }
  document.getElementById('drawer-name').textContent = (await res.json()).name;
  show('draw-view');
  redraw();
})();
