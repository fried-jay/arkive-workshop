const test = require('node:test');
const assert = require('node:assert');
const {
  createBalance, setRounds, joinBalance, openNextRound, voteBalance,
  revealBalance, resetBalance, clearBalanceParticipants, balanceSnapshot, balanceParticipantView,
} = require('../lib/balance');

const ROUNDS = [
  { a: '평생 마라탕', b: '평생 김치찌개' },
  { a: '월요일 오전 회의', b: '금요일 야근' },
];

function readyBalance() {
  const game = createBalance();
  setRounds(game, ROUNDS);
  return game;
}

test('setRounds: 검증 — 빈 배열/빈 항목 거부, 등록 시 진행 초기화', () => {
  const game = createBalance();
  assert.throws(() => setRounds(game, []), /ROUNDS_INVALID/);
  assert.throws(() => setRounds(game, [{ a: 'A', b: ' ' }]), /ROUNDS_INVALID/);
  setRounds(game, ROUNDS);
  const p0 = joinBalance(game, '원');
  openNextRound(game);
  p0.score = 40;
  setRounds(game, ROUNDS);
  assert.equal(game.participants.length, 1);
  assert.equal(game.participants[0].score, 0);
  assert.equal(game.status, 'idle');
});

test('joinBalance: 빈 이름 거부, 같은 이름 재사용', () => {
  const game = readyBalance();
  assert.throws(() => joinBalance(game, ' '), /NAME_REQUIRED/);
  const a = joinBalance(game, '원');
  assert.equal(joinBalance(game, ' 원 ').id, a.id);
});

test('openNextRound: 상태 전이 voting→revealed→…→finished', () => {
  assert.throws(() => openNextRound(createBalance()), /BALANCE_NOT_READY/);
  const game = readyBalance();
  openNextRound(game);
  assert.equal(game.status, 'voting');
  assert.equal(game.currentIndex, 0);
  assert.throws(() => openNextRound(game), /WRONG_STATE/);
  revealBalance(game);
  openNextRound(game);
  revealBalance(game);
  openNextRound(game);
  assert.equal(game.status, 'finished');
});

test('voteBalance: voting에서만, 라운드당 1회, 0|1만', () => {
  const game = readyBalance();
  const p = joinBalance(game, '원');
  assert.throws(() => voteBalance(game, p.id, 0), /WRONG_STATE/);
  openNextRound(game);
  assert.throws(() => voteBalance(game, 'nope', 0), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => voteBalance(game, p.id, 2), /CHOICE_INVALID/);
  voteBalance(game, p.id, 1);
  assert.throws(() => voteBalance(game, p.id, 0), /ALREADY_VOTED/);
});

test('revealBalance: 다수파 +10점, 동률이면 투표자 전원 +10', () => {
  const game = readyBalance();
  const [a, b, c] = ['가', '나', '다'].map((n) => joinBalance(game, n));
  openNextRound(game);
  voteBalance(game, a.id, 0);
  voteBalance(game, b.id, 0);
  voteBalance(game, c.id, 1);
  revealBalance(game);
  assert.equal(a.score, 10);
  assert.equal(b.score, 10);
  assert.equal(c.score, 0);
  assert.throws(() => revealBalance(game), /WRONG_STATE/);

  openNextRound(game); // 동률 라운드
  voteBalance(game, a.id, 0);
  voteBalance(game, c.id, 1);
  revealBalance(game);
  assert.equal(a.score, 20);
  assert.equal(b.score, 10); // 미투표 → 점수 없음
  assert.equal(c.score, 10);
});

test('balanceSnapshot: voting에선 분포 미노출, revealed에서 counts/majority 공개', () => {
  const game = readyBalance();
  const p = joinBalance(game, '원');
  openNextRound(game);
  voteBalance(game, p.id, 0);
  let snap = balanceSnapshot(game);
  assert.equal(snap.status, 'voting');
  assert.deepEqual(snap.round, { a: ROUNDS[0].a, b: ROUNDS[0].b });
  assert.equal('counts' in snap.round, false);
  assert.equal(snap.votedCount, 1);
  assert.deepEqual(snap.participants, [{ name: '원', score: 0, voted: true }]);

  revealBalance(game);
  snap = balanceSnapshot(game);
  assert.deepEqual(snap.round.counts, [1, 0]);
  assert.equal(snap.round.majority, 0);
});

test('resetBalance: 참가자 초기화, 라운드 유지 / participantView 복원', () => {
  const game = readyBalance();
  const p = joinBalance(game, '원');
  openNextRound(game);
  voteBalance(game, p.id, 1);
  const view = balanceParticipantView(game, p.id);
  assert.equal(view.votedChoice, 1);
  assert.equal(view.name, '원');
  assert.equal(balanceParticipantView(game, 'nope'), null);
  resetBalance(game);
  assert.equal(game.participants.length, 1);   // 참가자 유지
  assert.equal(game.participants[0].score, 0); // 점수 초기화
  assert.equal(game.rounds.length, 2);
  assert.equal(game.status, 'idle');
});

test('clearBalanceParticipants: 참가자만 제거, 라운드 유지', () => {
  const game = readyBalance();
  joinBalance(game, '원');
  clearBalanceParticipants(game);
  assert.equal(game.participants.length, 0);
  assert.equal(game.rounds.length, 2);
});
