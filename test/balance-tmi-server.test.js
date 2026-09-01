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

test('TMI 흐름: submit → start → answer(본인 불가) → reveal → reset/clear', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  let res = await post(base, '/api/tmi/submit', { name: '가', tmi: ' ' });
  assert.equal(res.status, 400);

  const ids = {};
  for (const name of ['가', '나', '다', '라']) {
    ids[name] = (await post(base, '/api/tmi/submit', { name, tmi: `${name}의 비밀` })).body.participantId;
  }

  // 시작 전 스냅샷에 TMI 내용 미노출
  let snap = await state(base, '/api/tmi/state');
  assert.equal(snap.entryCount, 4);
  assert.equal(JSON.stringify(snap).includes('비밀'), false);

  res = await post(base, '/api/tmi/admin/start');
  assert.equal(res.status, 200);
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.status, 'question');
  assert.equal('answerIndex' in snap.round, false);

  // 주인은 답변 불가, 다른 사람은 정답 시도
  const ownerName = snap.round.tmi.replace('의 비밀', '');
  const guesserName = ['가', '나', '다', '라'].find((n) => n !== ownerName);
  res = await post(base, '/api/tmi/answer', { participantId: ids[ownerName], choiceIndex: 0 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'OWN_QUESTION');
  const correctIndex = snap.round.choices.indexOf(ownerName);
  await post(base, '/api/tmi/answer', { participantId: ids[guesserName], choiceIndex: correctIndex });

  await post(base, '/api/tmi/admin/reveal');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.round.ownerName, ownerName);
  assert.equal(snap.participants.find((p) => p.name === guesserName).score, 130);

  // 진행 리셋: 제출 유지 / 전체 초기화: 삭제
  await post(base, '/api/tmi/admin/reset');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.entryCount, 4);
  await post(base, '/api/tmi/admin/clear');
  snap = await state(base, '/api/tmi/state');
  assert.equal(snap.entryCount, 0);
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
