const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-srv-'));
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

async function state(base, url) {
  return (await fetch(base + url)).json();
}

test('마니또 흐름: join → start(사이클) → guess → reveal', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  await post(base, '/api/manito/admin/note', { text: '몰래 칭찬 한 번!' });
  const ids = {};
  for (const name of ['가', '나', '다']) {
    ids[name] = (await post(base, '/api/manito/join', { name })).body.participantId;
  }
  let res = await post(base, '/api/manito/admin/start');
  assert.equal(res.status, 200);
  res = await post(base, '/api/manito/join', { name: '늦은사람' });
  assert.equal(res.status, 409);

  // 내 대상 확인, 스냅샷엔 배정 비공개
  const me = await (await fetch(`${base}/api/manito/me/${ids['가']}`)).json();
  assert.ok(['나', '다'].includes(me.targetName));
  let snap = await state(base, '/api/manito/state');
  assert.equal(snap.note, '몰래 칭찬 한 번!');
  assert.equal('pairs' in snap, false);

  // '가'의 마니또(가를 챙기는 사람) 계산해서 정답 추측
  const targets = {};
  for (const name of ['가', '나', '다']) {
    targets[name] = (await (await fetch(`${base}/api/manito/me/${ids[name]}`)).json()).targetName;
  }
  const myGuardian = Object.keys(targets).find((n) => targets[n] === '가');
  res = await post(base, '/api/manito/guess', { participantId: ids['가'], guessName: myGuardian });
  assert.equal(res.status, 200);

  await post(base, '/api/manito/admin/reveal');
  snap = await state(base, '/api/manito/state');
  assert.equal(snap.status, 'revealed');
  assert.equal(snap.pairs.length, 3);
  assert.equal(snap.pairs.find((p) => p.to === '가').guessedRight, true);
  assert.equal(snap.scores.find((s) => s.name === '가').score, 100);
});
