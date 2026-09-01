const test = require('node:test');
const assert = require('node:assert');
const {
  createTmi, submitTmi, startTmi, advanceTmi,
  resetTmi, clearTmi, reviveTmi, tmiSnapshot, tmiParticipantView,
} = require('../lib/tmi');

const NAMES = ['가', '나', '다'];

function tmisOf(name) {
  return [`${name}의 비밀 1`, `${name}의 비밀 2`, `${name}의 비밀 3`];
}

function collectedTmi(n = 3) {
  const game = createTmi();
  const people = NAMES.slice(0, n).map((name) => submitTmi(game, name, tmisOf(name)));
  return { game, people };
}

test('submitTmi: 이름 필수, TMI는 정확히 3개(빈 값 불가), 재제출은 수정', () => {
  const game = createTmi();
  assert.throws(() => submitTmi(game, ' ', tmisOf('x')), /NAME_REQUIRED/);
  assert.throws(() => submitTmi(game, '원', ['하나', '둘']), /TMI_REQUIRED/);
  assert.throws(() => submitTmi(game, '원', ['하나', '둘', '  ']), /TMI_REQUIRED/);
  assert.throws(() => submitTmi(game, '원', '문자열'), /TMI_REQUIRED/);
  const a = submitTmi(game, '원', ['하나', '둘', '셋']);
  const b = submitTmi(game, ' 원 ', [' 일 ', '이', '삼']);
  assert.equal(a.id, b.id);
  assert.equal(game.participants.length, 1);
  assert.deepEqual(game.participants[0].tmis, ['일', '이', '삼']);
});

test('startTmi: 2명 미만이면 거부, 시작하면 셔플된 사람 순서로 첫 힌트 공개', () => {
  const { game } = collectedTmi(1);
  assert.throws(() => startTmi(game), /NOT_ENOUGH_ENTRIES/);

  const { game: g2 } = collectedTmi(3);
  startTmi(g2);
  assert.equal(g2.status, 'playing');
  assert.equal(g2.roundIndex, 0);
  assert.equal(g2.revealedCount, 1);
  assert.equal(g2.ownerRevealed, false);
  assert.deepEqual(
    [...g2.rounds].sort(),
    g2.participants.map((p) => p.id).sort(),
    '라운드는 참가자 순열',
  );
  assert.throws(() => startTmi(g2), /WRONG_STATE/);
  assert.throws(() => submitTmi(g2, '새사람', tmisOf('새사람')), /WRONG_STATE/);
});

test('advanceTmi: 힌트1→2→3→주인 공개→다음 사람→…→finished', () => {
  const { game } = collectedTmi(2);
  assert.throws(() => advanceTmi(game), /WRONG_STATE/); // collecting
  startTmi(game);

  advanceTmi(game); // 힌트 2
  assert.deepEqual([game.roundIndex, game.revealedCount, game.ownerRevealed], [0, 2, false]);
  advanceTmi(game); // 힌트 3
  assert.deepEqual([game.roundIndex, game.revealedCount, game.ownerRevealed], [0, 3, false]);
  advanceTmi(game); // 주인 공개
  assert.deepEqual([game.roundIndex, game.revealedCount, game.ownerRevealed], [0, 3, true]);
  advanceTmi(game); // 다음 사람 힌트 1
  assert.deepEqual([game.roundIndex, game.revealedCount, game.ownerRevealed], [1, 1, false]);
  advanceTmi(game);
  advanceTmi(game);
  advanceTmi(game); // 두 번째 사람 주인 공개
  advanceTmi(game); // 끝
  assert.equal(game.status, 'finished');
  assert.throws(() => advanceTmi(game), /WRONG_STATE/);
});

test('tmiSnapshot: 공개된 힌트만 노출, 주인은 공개 전 미노출', () => {
  const { game } = collectedTmi(2);
  let snap = tmiSnapshot(game);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.participantCount, 2);
  assert.deepEqual(snap.members.sort(), ['가', '나']);
  assert.equal(snap.round, null);
  assert.equal(JSON.stringify(snap).includes('비밀'), false, '수집 중 TMI 내용 미노출');

  startTmi(game);
  snap = tmiSnapshot(game);
  const ownerName = game.participants.find((p) => p.id === game.rounds[0]).name;
  assert.equal(snap.status, 'playing');
  assert.equal(snap.roundIndex, 0);
  assert.equal(snap.totalRounds, 2);
  assert.deepEqual(snap.round.tmis, [`${ownerName}의 비밀 1`]);
  assert.equal(snap.round.totalTmis, 3);
  assert.equal(snap.round.ownerName, null);
  assert.equal(JSON.stringify(snap).includes('비밀 2'), false, '미공개 힌트 미노출');

  advanceTmi(game); // 힌트 2
  snap = tmiSnapshot(game);
  assert.equal(snap.round.tmis.length, 2);
  assert.equal(snap.round.ownerName, null);

  advanceTmi(game); // 힌트 3
  advanceTmi(game); // 주인 공개
  snap = tmiSnapshot(game);
  assert.equal(snap.round.tmis.length, 3);
  assert.equal(snap.round.ownerName, ownerName);
});

test('resetTmi: 제출물 유지하고 수집으로 복귀 / clearTmi: 전부 삭제', () => {
  const { game } = collectedTmi(2);
  startTmi(game);
  advanceTmi(game);
  resetTmi(game);
  assert.equal(game.status, 'collecting');
  assert.equal(game.participants.length, 2);
  assert.equal(game.rounds.length, 0);
  clearTmi(game);
  assert.equal(game.participants.length, 0);
});

test('reviveTmi: 현재 형태만 수용, 구버전(단일 tmi/entries)은 null', () => {
  const { game } = collectedTmi(2);
  assert.deepEqual(reviveTmi(JSON.parse(JSON.stringify(game))), JSON.parse(JSON.stringify(game)));
  assert.equal(reviveTmi(null), null);
  assert.equal(reviveTmi({ entries: [{ id: 'x', name: '원', tmi: '비밀' }] }), null);
  assert.equal(reviveTmi({ participants: [{ id: 'x', name: '원', tmi: '비밀' }] }), null);
});

test('tmiParticipantView: 내 제출 복원', () => {
  const { game, people } = collectedTmi(2);
  assert.equal(tmiParticipantView(game, 'nope'), null);
  const view = tmiParticipantView(game, people[0].id);
  assert.equal(view.name, '가');
  assert.deepEqual(view.tmis, tmisOf('가'));
});
