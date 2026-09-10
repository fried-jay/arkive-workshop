const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function startServer(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-srv-'));
  const { app, hidden } = createServer({ dataFile: path.join(dir, 'data.json'), saveDelayMs: 10, ...opts });
  const server = app.listen(0);
  return { server, hidden, base: `http://127.0.0.1:${server.address().port}` };
}
async function post(base, url, body) {
  const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('숨은그림찾기 서버: 1등 클리어 → 예약 종료 → 자동 다음 라운드', async (t) => {
  const { server, base } = startServer({ hiddenRoundEndMs: 150 });
  t.after(() => server.close());

  await post(base, '/api/hidden/admin/generate', { count: 2 });
  const a = (await post(base, '/api/hidden/join', { name: 'a' })).body;
  const b = (await post(base, '/api/hidden/join', { name: 'b' })).body;
  await post(base, '/api/hidden/admin/start');

  let state = await fetch(base + '/api/hidden/state').then((r) => r.json());
  const targets = state.round.cells.map((c, i) => (c === state.round.target ? i : -1)).filter((i) => i >= 0);
  let last;
  for (const i of targets) last = (await post(base, '/api/hidden/tap', { participantId: a.participantId, cellIndex: i })).body;
  assert.deepEqual([last.cleared, last.rank, last.points], [true, 1, 100]);

  state = await fetch(base + '/api/hidden/state').then((r) => r.json());
  assert.equal(state.currentIndex, 0);
  assert.ok(state.roundEndsAt > state.now - 1000);
  assert.equal(state.round.firstClear, 'a');
  assert.equal(state.participants.find((p) => p.name === 'a').score, 100);

  // 종료 전 2등 클리어는 70점
  for (const i of targets) last = (await post(base, '/api/hidden/tap', { participantId: b.participantId, cellIndex: i })).body;
  assert.equal(last.points, 70);

  await sleep(300);
  state = await fetch(base + '/api/hidden/state').then((r) => r.json());
  assert.equal(state.currentIndex, 1, '예약 시각 뒤 자동으로 다음 라운드');
  assert.equal(state.roundEndsAt, null);

  // 종료된 라운드 이후 탭은 새 라운드에 정상 반영 (잠금 해제)
  const r = await post(base, '/api/hidden/tap', { participantId: a.participantId, cellIndex: 0 });
  assert.equal(r.status, 200);
});

test('숨은그림찾기 서버: 종료 시각 지난 탭은 409 ROUND_OVER', async (t) => {
  const { server, base, hidden } = startServer({ hiddenRoundEndMs: 60_000 });
  t.after(() => server.close());
  await post(base, '/api/hidden/admin/generate', { count: 1 });
  const a = (await post(base, '/api/hidden/join', { name: 'a' })).body;
  await post(base, '/api/hidden/admin/start');
  hidden.roundEndsAt = Date.now() - 1; // 이미 지난 예약 (타이머는 아직)
  const r = await post(base, '/api/hidden/tap', { participantId: a.participantId, cellIndex: 0 });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ROUND_OVER');
});
