const test = require('node:test');
const assert = require('node:assert');
const {
  createMission, setMissions, joinMission, startMission, reportDone, accuse,
  revealMission, resetMission, missionSnapshot, missionParticipantView,
} = require('../lib/mission');

const MISSIONS = ['미션A', '미션B', '미션C', '미션D'];

function runningGame(n = 3) {
  const game = createMission();
  setMissions(game, MISSIONS);
  const people = ['가', '나', '다'].slice(0, n).map((name) => joinMission(game, name));
  startMission(game);
  return { game, people };
}

test('setMissions: 검증, idle에서만, 참가자는 유지', () => {
  const game = createMission();
  assert.throws(() => setMissions(game, []), /MISSIONS_INVALID/);
  assert.throws(() => setMissions(game, ['a', ' ']), /MISSIONS_INVALID/);
  joinMission(game, '원');
  setMissions(game, MISSIONS.map((m) => ` ${m} `));
  assert.deepEqual(game.missions, MISSIONS);
  assert.equal(game.participants.length, 1, '미션 등록해도 참가자 유지');
  setMissions(game, MISSIONS);
  joinMission(game, '둘');
  startMission(game);
  assert.throws(() => setMissions(game, MISSIONS), /WRONG_STATE/);
});

test('startMission: 참가자 2명+미션 1개 이상, 배정은 중복 없이(풀 충분 시)', () => {
  const empty = createMission();
  joinMission(empty, '가');
  joinMission(empty, '나');
  assert.throws(() => startMission(empty), /MISSION_NOT_READY/); // 미션 없음

  const solo = createMission();
  setMissions(solo, MISSIONS);
  joinMission(solo, '가');
  assert.throws(() => startMission(solo), /MISSION_NOT_READY/); // 2명 미만

  const { game } = runningGame(3);
  assert.equal(game.status, 'running');
  const assigned = game.participants.map((p) => p.missionIndex);
  assert.equal(assigned.every((i) => Number.isInteger(i) && i >= 0 && i < 4), true);
  assert.equal(new Set(assigned).size, 3, '풀이 충분하면 중복 없음');
  assert.throws(() => startMission(game), /WRONG_STATE/);
});

test('joinMission: 진행 중 입장하면 즉시 미션 배정', () => {
  const { game } = runningGame();
  const late = joinMission(game, '늦은사람');
  assert.equal(Number.isInteger(late.missionIndex), true);
});

test('reportDone: 성공 신고 +100, 중복/간파 후 신고 불가', () => {
  const { game, people } = runningGame();
  const p = people[0];
  reportDone(game, p.id);
  assert.equal(p.done, true);
  assert.equal(p.score, 100);
  assert.throws(() => reportDone(game, p.id), /ALREADY_DONE/);

  const q = people[1];
  const accuser = people[2];
  accuse(game, accuser.id, q.id, q.missionIndex); // 간파 적중
  assert.throws(() => reportDone(game, q.id), /MISSION_FOILED/);
});

test('accuse: 적중 +50·대상 무효, 오판 -20, 자기 자신/완료 대상 불가', () => {
  const { game, people } = runningGame();
  const [a, b, c] = people;
  assert.throws(() => accuse(game, a.id, a.id, 0), /SELF_ACCUSE/);
  assert.throws(() => accuse(game, a.id, b.id, 99), /MISSION_INVALID/);
  assert.throws(() => accuse(game, a.id, 'nope', 0), /PARTICIPANT_NOT_FOUND/);

  const wrongIndex = (b.missionIndex + 1) % MISSIONS.length;
  let result = accuse(game, a.id, b.id, wrongIndex);
  assert.equal(result.correct, false);
  assert.equal(a.score, -20);

  result = accuse(game, a.id, b.id, b.missionIndex);
  assert.equal(result.correct, true);
  assert.equal(a.score, 30); // -20 + 50
  assert.equal(b.foiled, true);
  assert.equal(b.foiledBy, a.name);
  assert.throws(() => accuse(game, c.id, b.id, b.missionIndex), /MISSION_FOILED/);

  reportDone(game, c.id);
  assert.throws(() => accuse(game, a.id, c.id, c.missionIndex), /ALREADY_DONE/);
});

test('revealMission/resetMission: 상태 전이, 리셋은 미션 풀 유지', () => {
  const { game } = runningGame();
  revealMission(game);
  assert.equal(game.status, 'revealed');
  assert.throws(() => revealMission(game), /WRONG_STATE/);
  resetMission(game);
  assert.equal(game.status, 'idle');
  assert.equal(game.participants.length, 0);
  assert.deepEqual(game.missions, MISSIONS);
});

test('missionSnapshot: 풀은 공개, 배정은 revealed 전 비공개', () => {
  const { game, people } = runningGame();
  reportDone(game, people[0].id);
  let snap = missionSnapshot(game);
  assert.equal(snap.status, 'running');
  assert.deepEqual(snap.missions, MISSIONS);
  assert.deepEqual(
    snap.participants.find((p) => p.name === '가'),
    { name: '가', score: 100, done: true, foiled: false },
  );
  assert.equal('assignments' in snap, false, '배정 비공개');

  revealMission(game);
  snap = missionSnapshot(game);
  assert.equal(snap.assignments.length, 3);
  const mine = snap.assignments.find((a) => a.name === '가');
  assert.equal(mine.mission, MISSIONS[people[0].missionIndex]);
  assert.equal(mine.done, true);
});

test('missionParticipantView: 내 미션은 나에게만', () => {
  const { game, people } = runningGame();
  assert.equal(missionParticipantView(game, 'nope'), null);
  const view = missionParticipantView(game, people[0].id);
  assert.equal(view.mission, MISSIONS[people[0].missionIndex]);
  assert.equal(view.done, false);
  assert.equal(view.foiled, false);
  const idle = createMission();
  const p = joinMission(idle, '원');
  assert.equal(missionParticipantView(idle, p.id).mission, null);
});
