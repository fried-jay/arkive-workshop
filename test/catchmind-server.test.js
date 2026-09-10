const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const STROKES = [{ points: [[0.1, 0.1], [0.5, 0.5]], c: '#111827', w: 5 }];

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-srv-'));
  const { app } = createServer({ dataFile: path.join(dir, 'data.json'), saveDelayMs: 10 });
  const server = app.listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
async function post(base, url, body) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json() };
}
const state = async (base) => (await fetch(base + '/api/catchmind/state')).json();

test('캐치마인드 사전제출 흐름: submit → start → winner → next → finished', async (t) => {
  const { server, base } = startServer();
  t.after(() => server.close());

  // 제출 검증
  let res = await post(base, '/api/catchmind/submit', { name: '가', strokes: STROKES, word: '' });
  assert.equal(res.status, 400); // WORD_REQUIRED

  await post(base, '/api/catchmind/submit', { name: '가', strokes: STROKES, word: '사과' });
  await post(base, '/api/catchmind/submit', { name: '나', strokes: STROKES, word: '바나나' });

  let snap = await state(base);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.total, 2);
  assert.deepEqual(snap.submitters.sort(), ['가', '나']);

  // 공개 시작
  res = await post(base, '/api/catchmind/admin/start');
  assert.equal(res.status, 200);
  snap = await state(base);
  assert.equal(snap.status, 'showing');
  assert.equal(snap.current.word, null); // 공개 전 정답 숨김

  // 현재 그림 스트로크
  const strokesRes = await (await fetch(base + '/api/catchmind/strokes')).json();
  assert.equal(strokesRes.strokes.length, 1);

  // 공개 시작 후 제출 거부
  res = await post(base, '/api/catchmind/submit', { name: '다', strokes: STROKES, word: '포도' });
  assert.equal(res.status, 409);

  // 정답자 지정
  res = await post(base, '/api/catchmind/admin/winner', { name: '심판' });
  assert.equal(res.status, 200);
  snap = await state(base);
  assert.equal(snap.current.winnerName, '심판');
  assert.ok(snap.current.word); // 공개됨
  assert.equal(snap.scores.find((s) => s.name === '심판').score, 100);

  // 다음 → 마지막 다음 → finished
  await post(base, '/api/catchmind/admin/next');
  await post(base, '/api/catchmind/admin/next');
  snap = await state(base);
  assert.equal(snap.status, 'finished');

  // 리셋: 제출물 유지
  await post(base, '/api/catchmind/admin/reset');
  snap = await state(base);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.total, 2);
  assert.equal(snap.scores.length, 0);

  // 전체 삭제
  await post(base, '/api/catchmind/admin/clear');
  snap = await state(base);
  assert.equal(snap.total, 0);
});
