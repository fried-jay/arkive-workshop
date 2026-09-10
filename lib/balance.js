'use strict';
const crypto = require('node:crypto');

const MAJORITY_SCORE = 10;

function createBalance() {
  return { rounds: [], status: 'idle', currentIndex: -1, participants: [] };
}

function validRound(r) {
  return r && typeof r.a === 'string' && r.a.trim() !== '' &&
    typeof r.b === 'string' && r.b.trim() !== '';
}

function setRounds(game, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0 || !rounds.every(validRound)) {
    throw new Error('ROUNDS_INVALID');
  }
  game.rounds = rounds.map((r) => ({ a: r.a.trim(), b: r.b.trim() }));
  game.status = 'idle';
  game.currentIndex = -1;
  for (const p of game.participants) { p.score = 0; p.votes = {}; }
}

function joinBalance(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = { id: crypto.randomUUID(), name: trimmed, score: 0, votes: {} };
  game.participants.push(participant);
  return participant;
}

function openNextRound(game) {
  if (game.rounds.length === 0) throw new Error('BALANCE_NOT_READY');
  if (game.status !== 'idle' && game.status !== 'revealed') throw new Error('WRONG_STATE');
  game.currentIndex += 1;
  game.status = game.currentIndex >= game.rounds.length ? 'finished' : 'voting';
}

function voteBalance(game, participantId, choice) {
  if (game.status !== 'voting') throw new Error('WRONG_STATE');
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  if (choice !== 0 && choice !== 1) throw new Error('CHOICE_INVALID');
  if (participant.votes[game.currentIndex] != null) throw new Error('ALREADY_VOTED');
  participant.votes[game.currentIndex] = choice;
  return participant;
}

function roundCounts(game) {
  const counts = [0, 0];
  for (const p of game.participants) {
    const v = p.votes[game.currentIndex];
    if (v != null) counts[v] += 1;
  }
  return counts;
}

function revealBalance(game) {
  if (game.status !== 'voting') throw new Error('WRONG_STATE');
  const counts = roundCounts(game);
  for (const p of game.participants) {
    const v = p.votes[game.currentIndex];
    if (v == null) continue;
    if (counts[v] >= counts[1 - v]) p.score += MAJORITY_SCORE; // 동률이면 양쪽 모두
  }
  game.status = 'revealed';
}

function resetBalance(game) {
  game.status = 'idle';
  game.currentIndex = -1;
  for (const p of game.participants) { p.score = 0; p.votes = {}; }
}

// 참가자만 제거 (라운드는 유지)
function clearBalanceParticipants(game) {
  game.status = 'idle';
  game.currentIndex = -1;
  game.participants = [];
}

function balanceSnapshot(game) {
  const active = game.status === 'voting' || game.status === 'revealed';
  const current = active ? game.rounds[game.currentIndex] : null;
  let round = null;
  if (current) {
    round = { a: current.a, b: current.b };
    if (game.status === 'revealed') {
      const counts = roundCounts(game);
      round.counts = counts;
      round.majority = counts[0] === counts[1] ? null : (counts[0] > counts[1] ? 0 : 1);
    }
  }
  return {
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    round,
    votedCount: active
      ? game.participants.filter((p) => p.votes[game.currentIndex] != null).length
      : 0,
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      voted: active ? p.votes[game.currentIndex] != null : false,
    })),
  };
}

function balanceParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const active = game.status === 'voting' || game.status === 'revealed';
  return {
    participantId: p.id,
    name: p.name,
    score: p.score,
    votedChoice: active ? (p.votes[game.currentIndex] ?? null) : null,
  };
}

module.exports = {
  createBalance, setRounds, joinBalance, openNextRound, voteBalance,
  revealBalance, resetBalance, clearBalanceParticipants, balanceSnapshot, balanceParticipantView,
};
