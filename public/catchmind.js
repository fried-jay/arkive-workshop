'use strict';
const canvas = document.getElementById('canvas');
const err = document.getElementById('err');
const nameInput = document.getElementById('name-input');
const wordInput = document.getElementById('word-input');
const submitView = document.getElementById('submit-view');
const doneView = document.getElementById('done-view');

let strokes = [];
let current = null;
let color = '#111827';
let width = 5;

// 이전에 입력한 이름 복원
try { nameInput.value = localStorage.getItem('catchmind:name') || ''; } catch (e) {}

function redraw() {
  renderStrokes(canvas, current ? [...strokes, current] : strokes);
}
function pointOf(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  return [Number(x.toFixed(4)), Number(y.toFixed(4))];
}
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); current = { points: [pointOf(e)], c: color, w: width }; redraw(); });
canvas.addEventListener('pointermove', (e) => {
  if (!current) return;
  if (current.points.length >= 500) { strokes.push(current); current = { points: [current.points.at(-1)], c: color, w: width }; }
  current.points.push(pointOf(e)); redraw();
});
function endStroke() { if (!current) return; strokes.push(current); current = null; redraw(); }
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

for (const btn of document.querySelectorAll('.color')) {
  btn.addEventListener('click', () => { color = btn.dataset.color; document.querySelectorAll('.color').forEach((b) => b.classList.toggle('active', b === btn)); });
}
document.getElementById('size-btn').addEventListener('click', (e) => { width = width === 5 ? 14 : 5; e.target.classList.toggle('active', width === 14); });
document.getElementById('undo-btn').addEventListener('click', () => { strokes.pop(); redraw(); });
document.getElementById('clear-btn').addEventListener('click', () => { if (strokes.length && !confirm('전부 지울까요?')) return; strokes = []; redraw(); });
window.addEventListener('resize', redraw);

document.getElementById('submit-btn').addEventListener('click', async () => {
  err.textContent = '';
  const name = nameInput.value.trim();
  const word = wordInput.value.trim();
  if (!name) { err.textContent = '이름을 입력해주세요.'; return; }
  if (!word) { err.textContent = '정답 단어를 입력해주세요.'; return; }
  if (strokes.length === 0) { err.textContent = '그림을 그려주세요!'; return; }
  if (!confirm(`정답 "${word}" 로 제출할까요?`)) return;
  try {
    const res = await fetch('/api/catchmind/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, strokes, word }) });
    if (!res.ok) {
      const code = (await res.json()).error;
      err.textContent = code === 'WRONG_STATE' ? '지금은 제출을 받지 않아요. (이미 공개 시작됨)' : '제출에 실패했어요.';
      return;
    }
    try { localStorage.setItem('catchmind:name', name); } catch (e) {}
    submitView.classList.add('hidden');
    doneView.classList.remove('hidden');
  } catch { err.textContent = '제출에 실패했어요. 잠시 후 다시 시도해주세요.'; }
});

document.getElementById('again-btn').addEventListener('click', () => {
  strokes = []; current = null; redraw();
  doneView.classList.add('hidden');
  submitView.classList.remove('hidden');
});

redraw();
