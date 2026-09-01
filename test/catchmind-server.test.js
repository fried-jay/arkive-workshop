const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const STROKES = [{ points: [[0.1, 0.2], [0.3, 0.4]], c: '#000000', w: 4 }];

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-srv-'));
  const { app } = createServer({ dataFile: path.join(dir, 'data.json'), saveDelayMs: 10 });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

function stop(server) {
  server.closeAllConnections?.();
  server.close();
}

async function post(base, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

async function state(base) {
  return (await fetch(`${base}/api/catchmind/state`)).json();
}

test('캐치마인드 흐름: join → 링크 발급 → 그림 제출 → 맞추기 → 리셋', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  const ids = {};
  for (const name of ['가', '나']) {
    ids[name] = (await post(base, '/api/catchmind/join', { name })).body.participantId;
  }

  // 링크 발급 (키는 관리자 응답에만)
  let res = await post(base, '/api/catchmind/admin/assign', { participantId: ids['가'] });
  assert.equal(res.status, 200);
  const key = res.body.key;
  assert.ok(key.length > 10);
  let snap = await state(base);
  assert.equal(snap.status, 'waiting');
  assert.equal(snap.drawerName, '가');
  assert.equal(JSON.stringify(snap).includes(key), false);

  // 그리는 사람 확인 (키 기반)
  let getRes = await fetch(`${base}/api/catchmind/draw/${key}`);
  assert.equal(getRes.status, 200);
  assert.equal((await getRes.json()).name, '가');
  assert.equal((await fetch(`${base}/api/catchmind/draw/bad-key`)).status, 404);

  // 제출
  res = await post(base, '/api/catchmind/draw/submit', { key, strokes: STROKES, word: '맥북' });
  assert.equal(res.status, 200);
  snap = await state(base);
  assert.equal(snap.status, 'guessing');
  assert.equal(snap.word, null);

  // 그림 조회
  getRes = await fetch(`${base}/api/catchmind/strokes`);
  assert.deepEqual((await getRes.json()).strokes, STROKES);

  // 출제자 정답 시도 금지, 오답 → 피드, 정답 → 점수
  res = await post(base, '/api/catchmind/guess', { participantId: ids['가'], text: '맥북' });
  assert.equal(res.status, 403);
  res = await post(base, '/api/catchmind/guess', { participantId: ids['나'], text: '아이패드' });
  assert.equal(res.body.correct, false);
  res = await post(base, '/api/catchmind/guess', { participantId: ids['나'], text: '맥 북' });
  assert.equal(res.body.correct, true);
  snap = await state(base);
  assert.equal(snap.status, 'revealed');
  assert.equal(snap.word, '맥북');
  assert.equal(snap.winnerName, '나');
  assert.equal(snap.participants.find((p) => p.name === '나').score, 100);
  assert.equal(snap.participants.find((p) => p.name === '가').score, 50);

  // 리셋
  await post(base, '/api/catchmind/admin/reset');
  snap = await state(base);
  assert.equal(snap.status, 'idle');
  assert.equal(snap.participants.length, 0);
});

test('캐치마인드 SSE + 스킵(정답 공개)', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));
  const res = await fetch(`${base}/api/catchmind/events`);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /^data: /);
  await reader.cancel();

  const ids = {};
  for (const name of ['가', '나']) {
    ids[name] = (await post(base, '/api/catchmind/join', { name })).body.participantId;
  }
  const { body } = await post(base, '/api/catchmind/admin/assign', { participantId: ids['가'] });
  await post(base, '/api/catchmind/draw/submit', { key: body.key, strokes: STROKES, word: '회식' });
  const skipRes = await post(base, '/api/catchmind/admin/reveal');
  assert.equal(skipRes.status, 200);
  const snap = await state(base);
  assert.equal(snap.status, 'revealed');
  assert.equal(snap.word, '회식');
  assert.equal(snap.winnerName, null);
});
