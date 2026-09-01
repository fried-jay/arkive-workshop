const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-srv-'));
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

test('예언 흐름: 제출 → 봉인 → 공개 → 판정', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  let res = await post(base, '/api/prophecy/submit', { name: '가', text: ' ' });
  assert.equal(res.status, 400);
  res = await post(base, '/api/prophecy/submit', { name: '가', text: '누군가 커피를 쏟는다' });
  assert.equal(res.status, 200);
  const p1 = res.body.participantId;
  await post(base, '/api/prophecy/submit', { name: '나', text: '퀴즈 1등은 다다' });

  // 봉인 전엔 이름만 노출
  let snap = await (await fetch(`${base}/api/prophecy/state`)).json();
  assert.equal(snap.participantCount, 2);
  assert.equal(JSON.stringify(snap).includes('커피'), false);

  await post(base, '/api/prophecy/admin/seal');
  res = await post(base, '/api/prophecy/submit', { name: '다', text: '늦은 예언' });
  assert.equal(res.status, 409);

  // 내 예언은 me로 복원 가능
  const me = await (await fetch(`${base}/api/prophecy/me/${p1}`)).json();
  assert.equal(me.text, '누군가 커피를 쏟는다');

  await post(base, '/api/prophecy/admin/reveal');
  res = await post(base, '/api/prophecy/admin/mark', { name: '가', hit: true });
  assert.equal(res.status, 200);
  snap = await (await fetch(`${base}/api/prophecy/state`)).json();
  assert.equal(snap.status, 'revealed');
  const first = snap.prophecies.find((p) => p.name === '가');
  assert.equal(first.hit, true);
  assert.equal(first.score, 100);

  await post(base, '/api/prophecy/admin/reset');
  snap = await (await fetch(`${base}/api/prophecy/state`)).json();
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.participantCount, 0);
});
