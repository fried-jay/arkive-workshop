const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const ITEMS = Array.from({ length: 25 }, (_, i) => `항목${i + 1}`);

function startServer() {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-srv-')), 'data.json');
  const { app } = createServer({ dataFile });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

async function post(base, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

test('전체 흐름: items 설정 → join → mark → state', async (t) => {
  const { server, base } = startServer();
  t.after(() => server.close());

  // items 설정 전 join 거부
  let res = await post(base, '/api/join', { name: '원' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'ITEMS_NOT_SET');

  // 항목 검증
  res = await post(base, '/api/admin/items', { items: ['하나'] });
  assert.equal(res.status, 400);
  res = await post(base, '/api/admin/items', { items: ITEMS });
  assert.equal(res.status, 200);

  // join
  res = await post(base, '/api/join', { name: '원' });
  assert.equal(res.status, 200);
  const { participantId, cells, marked } = res.body;
  assert.equal(cells.length, 25);
  assert.equal(marked.every((m) => m === false), true);

  // 빈 이름 거부
  res = await post(base, '/api/join', { name: '  ' });
  assert.equal(res.status, 400);

  // 시작 전에는 칠할 수 없음
  res = await post(base, '/api/mark', { participantId, cellIndex: 0, on: true });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'NOT_STARTED');

  // 다시 섞기 + 레디
  res = await post(base, '/api/shuffle', { participantId });
  assert.equal(res.status, 200);
  assert.equal(res.body.cells.length, 25);
  res = await post(base, '/api/ready', { participantId, ready: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.ready, true);
  // 레디 상태에서는 다시 섞기 거부
  res = await post(base, '/api/shuffle', { participantId });
  assert.equal(res.status, 409);

  // 진행자 시작
  res = await post(base, '/api/admin/start');
  assert.equal(res.status, 200);

  // mark (시작 후)
  res = await post(base, '/api/mark', { participantId, cellIndex: 0, on: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.marked[0], true);
  assert.equal(res.body.started, true);

  res = await post(base, '/api/mark', { participantId: 'nope', cellIndex: 0, on: true });
  assert.equal(res.status, 404);
  res = await post(base, '/api/mark', { participantId, cellIndex: 99, on: true });
  assert.equal(res.status, 400);

  // me 복원
  let getRes = await fetch(`${base}/api/me/${participantId}`);
  assert.equal(getRes.status, 200);
  assert.equal((await getRes.json()).marked[0], true);
  getRes = await fetch(`${base}/api/me/nope`);
  assert.equal(getRes.status, 404);

  // state 스냅샷
  getRes = await fetch(`${base}/api/state`);
  const snap = await getRes.json();
  assert.equal(snap.itemsSet, true);
  assert.equal(snap.started, true);
  assert.deepEqual(snap.participants[0], { name: '원', ready: true, markedCount: 1, bingoLines: 0 });

  // 진행 리셋: 참가자 유지, 판 초기화
  res = await post(base, '/api/admin/reset');
  assert.equal(res.status, 200);
  getRes = await fetch(`${base}/api/state`);
  let snap2 = await getRes.json();
  assert.equal(snap2.participants.length, 1);
  assert.equal(snap2.started, false);

  // 참가자 리셋: 참가자만 제거
  res = await post(base, '/api/admin/clear-participants');
  assert.equal(res.status, 200);
  snap2 = await (await fetch(`${base}/api/state`)).json();
  assert.equal(snap2.participants.length, 0);
});

test('SSE: 연결 즉시 스냅샷 push', async (t) => {
  const { server, base } = startServer();
  t.after(() => server.close());
  await post(base, '/api/admin/items', { items: ITEMS });

  const res = await fetch(`${base}/api/events`);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /^data: /);
  const snap = JSON.parse(text.replace(/^data: /, '').trim());
  assert.equal(snap.itemsSet, true);
  await reader.cancel();
});

test('영속화: 저장된 상태를 재시작 시 로드', async (t) => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-srv-')), 'data.json');
  const first = createServer({ dataFile, saveDelayMs: 10 });
  const server1 = first.app.listen(0);
  const base1 = `http://127.0.0.1:${server1.address().port}`;
  await post(base1, '/api/admin/items', { items: ITEMS });
  const joinRes = await post(base1, '/api/join', { name: '원' });
  await new Promise((r) => setTimeout(r, 100)); // 디바운스 저장 대기
  server1.close();

  const second = createServer({ dataFile });
  const server2 = second.app.listen(0);
  t.after(() => server2.close());
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const meRes = await fetch(`${base2}/api/me/${joinRes.body.participantId}`);
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).name, '원');
});
