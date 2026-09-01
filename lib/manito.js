'use strict';
const crypto = require('node:crypto');

const GUESS_SCORE = 100;
const MIN_PARTICIPANTS = 3;

// 마니또: 시작 시 셔플된 한 줄 사이클로 "몰래 챙길 사람"을 비밀 배정.
// 진행 중 각자 "나를 챙긴 사람"을 추측하고, 공개 때 사이클과 적중자를 발표.
function createManito() {
  return { status: 'idle', note: '', participants: [] };
}

function joinManito(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  if (game.status !== 'idle') throw new Error('WRONG_STATE'); // 사이클 확정 후 신규 입장 불가
  const participant = {
    id: crypto.randomUUID(),
    name: trimmed,
    targetId: null,
    guessId: null,
    score: 0,
  };
  game.participants.push(participant);
  return participant;
}

function setNote(game, text) {
  game.note = typeof text === 'string' ? text.trim() : '';
}

function startManito(game) {
  if (game.status !== 'idle') throw new Error('WRONG_STATE');
  if (game.participants.length < MIN_PARTICIPANTS) throw new Error('NOT_ENOUGH_ENTRIES');
  const ring = [...game.participants];
  for (let i = ring.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  ring.forEach((p, i) => {
    p.targetId = ring[(i + 1) % ring.length].id;
  });
  game.status = 'running';
}

function findParticipant(game, id) {
  const p = game.participants.find((x) => x.id === id);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  return p;
}

function guessManito(game, participantId, guessId) {
  if (game.status !== 'running') throw new Error('WRONG_STATE');
  const p = findParticipant(game, participantId);
  const guessed = game.participants.find((x) => x.id === guessId);
  if (!guessed || guessed.id === p.id) throw new Error('CHOICE_INVALID');
  p.guessId = guessed.id;
  return p;
}

function guardianOf(game, participant) {
  return game.participants.find((x) => x.targetId === participant.id) ?? null;
}

function revealManito(game) {
  if (game.status !== 'running') throw new Error('WRONG_STATE');
  for (const p of game.participants) {
    const guardian = guardianOf(game, p);
    if (guardian && p.guessId === guardian.id) p.score += GUESS_SCORE;
  }
  game.status = 'revealed';
}

function resetManito(game) {
  game.status = 'idle';
  game.participants = [];
}

function manitoSnapshot(game) {
  const snap = {
    status: game.status,
    note: game.note,
    participantCount: game.participants.length,
    guessedCount: game.participants.filter((p) => p.guessId).length,
    participants: game.participants.map((p) => ({
      name: p.name,
      guessed: Boolean(p.guessId),
    })),
  };
  if (game.status === 'revealed') {
    snap.pairs = game.participants.map((p) => {
      const target = game.participants.find((x) => x.id === p.targetId);
      return {
        from: p.name,                       // 챙긴 사람
        to: target?.name ?? null,           // 챙김 받은 사람
        guessedRight: Boolean(target && target.guessId === p.id), // 받은 쪽이 맞혔는지
      };
    });
    snap.scores = game.participants.map((p) => ({ name: p.name, score: p.score }));
  }
  return snap;
}

function manitoParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const revealed = game.status === 'revealed';
  const guardian = game.status === 'idle' ? null : guardianOf(game, p);
  return {
    participantId: p.id,
    name: p.name,
    targetName: p.targetId
      ? game.participants.find((x) => x.id === p.targetId)?.name ?? null
      : null,
    guessName: p.guessId
      ? game.participants.find((x) => x.id === p.guessId)?.name ?? null
      : null,
    myManitoName: revealed ? guardian?.name ?? null : null,
    guessedRight: revealed ? Boolean(guardian && p.guessId === guardian.id) : null,
    score: p.score,
  };
}

module.exports = {
  createManito, joinManito, setNote, startManito, guessManito,
  revealManito, resetManito, manitoSnapshot, manitoParticipantView,
};
