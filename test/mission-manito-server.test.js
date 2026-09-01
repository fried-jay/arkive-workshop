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

test('비밀미션 흐름: 미션 등록 → join → start → 신고/간파 → 공개', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  let res = await post(base, '/api/mission/admin/missions', { missions: ['a', ' '] });
  assert.equal(res.status, 400);
  await post(base, '/api/mission/admin/missions', { missions: ['미션A', '미션B', '미션C'] });

  const ids = {};
  for (const name of ['가', '나']) {
    ids[name] = (await post(base, '/api/mission/join', { name })).body.participantId;
  }
  res = await post(base, '/api/mission/admin/start');
  assert.equal(res.status, 200);

  // 내 미션은 me로만, 스냅샷엔 배정 없음
  const meRes = await fetch(`${base}/api/mission/me/${ids['가']}`);
  const me = await meRes.json();
  assert.ok(['미션A', '미션B', '미션C'].includes(me.mission));
  let snap = await state(base, '/api/mission/state');
  assert.deepEqual(snap.missions, ['미션A', '미션B', '미션C']);
  assert.equal('assignments' in snap, false);

  // 성공 신고
  res = await post(base, '/api/mission/report', { participantId: ids['가'] });
  assert.equal(res.status, 200);
  assert.equal(res.body.score, 100);
  res = await post(base, '/api/mission/report', { participantId: ids['가'] });
  assert.equal(res.status, 409);

  // 간파 (이름 기반): '가'는 이미 done이라 대상 불가 → '나'를 지목
  const naMission = (await (await fetch(`${base}/api/mission/me/${ids['나']}`)).json()).mission;
  const naIndex = ['미션A', '미션B', '미션C'].indexOf(naMission);
  res = await post(base, '/api/mission/accuse', {
    participantId: ids['가'], targetName: '나', missionIndex: (naIndex + 1) % 3,
  });
  assert.equal(res.body.correct, false);
  res = await post(base, '/api/mission/accuse', {
    participantId: ids['가'], targetName: '나', missionIndex: naIndex,
  });
  assert.equal(res.body.correct, true);

  // 공개
  await post(base, '/api/mission/admin/reveal');
  snap = await state(base, '/api/mission/state');
  assert.equal(snap.status, 'revealed');
  assert.equal(snap.assignments.find((a) => a.name === '나').foiled, true);
  assert.equal(snap.assignments.find((a) => a.name === '나').foiledBy, '가');

  await post(base, '/api/mission/admin/reset');
  snap = await state(base, '/api/mission/state');
  assert.equal(snap.participants.length, 0);
  assert.equal(snap.missions.length, 3);
});

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
