'use strict';
const crypto = require('node:crypto');

const HIT_SCORE = 100;
const MIN_PARTICIPANTS = 2;

// 몰래 예언: 시작 때 예언을 봉인해두고, 마무리에 공개하며 다 같이 판정.
function createProphecy() {
  return { status: 'collecting', participants: [] };
}

function submitProphecy(game, name, text) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('NAME_REQUIRED');
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (!trimmedText) throw new Error('PROPHECY_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmedName);
  if (existing) {
    existing.text = trimmedText;
    return existing;
  }
  const participant = {
    id: crypto.randomUUID(),
    name: trimmedName,
    text: trimmedText,
    hit: null, // null = 미판정
    score: 0,
  };
  game.participants.push(participant);
  return participant;
}

function sealProphecy(game) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  if (game.participants.length < MIN_PARTICIPANTS) throw new Error('NOT_ENOUGH_ENTRIES');
  game.status = 'sealed';
}

function revealProphecy(game) {
  if (game.status !== 'sealed') throw new Error('WRONG_STATE');
  game.status = 'revealed';
}

function markHit(game, participantId, hit) {
  if (game.status !== 'revealed') throw new Error('WRONG_STATE');
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  p.hit = Boolean(hit);
  p.score = p.hit ? HIT_SCORE : 0;
  return p;
}

function resetProphecy(game) {
  game.status = 'collecting';
  game.participants = [];
}

function prophecySnapshot(game) {
  const snap = {
    status: game.status,
    participantCount: game.participants.length,
    names: game.participants.map((p) => p.name),
  };
  if (game.status === 'revealed') {
    snap.prophecies = game.participants.map((p) => ({
      name: p.name,
      text: p.text,
      hit: p.hit,
      score: p.score,
    }));
  }
  return snap;
}

function prophecyParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  return { participantId: p.id, name: p.name, text: p.text, hit: p.hit, score: p.score };
}

module.exports = {
  createProphecy, submitProphecy, sealProphecy, revealProphecy, markHit,
  resetProphecy, prophecySnapshot, prophecyParticipantView,
};
