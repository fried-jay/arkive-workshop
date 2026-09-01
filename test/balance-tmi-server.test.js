const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-srv-'));
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

test('밸런스 흐름: rounds → join → vote → reveal 점수/분포', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  let res = await post(base, '/api/balance/admin/rounds', { rounds: [{ a: 'A', b: '' }] });
  assert.equal(res.status, 400);
  res = await post(base, '/api/balance/admin/rounds', { rounds: [{ a: '마라탕', b: '김치찌개' }] });
  assert.equal(res.status, 200);

  const p1 = (await post(base, '/api/balance/join', { name: '원' })).body.participantId;
  const p2 = (await post(base, '/api/balance/join', { name: '제이' })).body.participantId;

  res = await post(base, '/api/balance/vote', { participantId: p1, choice: 0 });
  assert.equal(res.status, 409); // idle

  await post(base, '/api/balance/admin/next');
  let snap = await state(base, '/api/balance/state');
  assert.equal(snap.status, 'voting');
  assert.equal('counts' in snap.round, false);

  await post(base, '/api/balance/vote', { participantId: p1, choice: 0 });
  res = await post(base, '/api/balance/vote', { participantId: p1, choice: 1 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'ALREADY_VOTED');
  await post(base, '/api/balance/vote', { participantId: p2, choice: 0 });

  await post(base, '/api/balance/admin/reveal');
  snap = await state(base, '/api/balance/state');
  assert.deepEqual(snap.round.counts, [2, 0]);
  assert.equal(snap.participants.find((p) => p.name === '원').score, 10);

  // me 복원 + reset
  const me = await (await fetch(`${base}/api/balance/me/${p1}`)).json();
  assert.equal(me.score, 10);
  await post(base, '/api/balance/admin/reset');
  snap = await state(base, '/api/balance/state');
  assert.equal(snap.participants.length, 0);
  assert.equal(snap.totalRounds, 1);
});

test('TMI 흐름: submit(3개) → start → 힌트 순차 공개 → 주인 공개 → reset/clear', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  let res = await post(base, '/api/tmi/submit', { name: '가', tmis: ['하나', '둘'] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'TMI_REQUIRED');

  for (const name of ['가', '나']) {
    res = await post(base, '/api/tmi/submit', { name, tmis: [`${name}1`, `${name}2`, `${name}3`] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tmis, [`${name}1`, `${name}2`, `${name}3`]);
  }

  // 수집 중 스냅샷: 이름만, 내용 미노출
  let snap = await state(base, '/api/tmi/state');
  assert.equal(snap.participantCount, 2);
  assert.deepEqual(snap.members.sort(), ['가', '나']);
  assert.equal(/가1|나1/.test(JSON.stringify(snap)), false);

  res = await post(base, '/api/tmi/admin/start');
  assert.equal(res.status, 200);
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.status, 'playing');
  assert.equal(snap.round.tmis.length, 1);
  assert.equal(snap.round.ownerName, null);

  // 힌트 2, 3 → 주인 공개
  await post(base, '/api/tmi/admin/next');
  await post(base, '/api/tmi/admin/next');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.round.tmis.length, 3);
  assert.equal(snap.round.ownerName, null);
  await post(base, '/api/tmi/admin/next');
  snap = await state(base, '/api/tmi/state');
  const owner = snap.round.ownerName;
  assert.ok(['가', '나'].includes(owner));
  assert.equal(snap.round.tmis[0], `${owner}1`);

  // 다음 사람 → 끝까지
  for (let i = 0; i < 5; i++) await post(base, '/api/tmi/admin/next');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.status, 'finished');

  // 진행 리셋: 제출 유지 / 전체 초기화: 삭제
  await post(base, '/api/tmi/admin/reset');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.participantCount, 2);
  await post(base, '/api/tmi/admin/clear');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.participantCount, 0);
});

test('SSE 채널 분리: balance/tmi 이벤트 스트림 각각 즉시 스냅샷', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));
  for (const route of ['/api/balance/events', '/api/tmi/events']) {
    const res = await fetch(base + route);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const reader = res.body.getReader();
    const { value } = await reader.read();
    assert.match(new TextDecoder().decode(value), /^data: /);
    await reader.cancel();
  }
});
