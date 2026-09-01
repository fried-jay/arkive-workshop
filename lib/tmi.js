'use strict';
const crypto = require('node:crypto');

const MIN_PARTICIPANTS = 4;   // 보기 4명을 채우기 위한 최소 인원
const CHOICES_PER_ROUND = 4;
const CORRECT_SCORE = 100;
const SPEED_BONUS = [30, 20, 10];

function createTmi() {
  // participants: 제출자(tmi 있음) + 추리 전용 참가자(tmi: null)
  return { participants: [], status: 'collecting', currentIndex: -1, rounds: [] };
}

// 구버전 저장 파일({entries: [...]})을 현재 형태로 마이그레이션
function reviveTmi(saved) {
  if (!saved) return null;
  if (Array.isArray(saved.entries)) {
    return {
      participants: saved.entries,
      status: saved.status ?? 'collecting',
      currentIndex: saved.currentIndex ?? -1,
      rounds: saved.rounds ?? [],
    };
  }
  return saved;
}

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function requireName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  return trimmed;
}

function joinTmi(game, name) {
  const trimmed = requireName(name);
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = { id: crypto.randomUUID(), name: trimmed, tmi: null, score: 0, answers: {} };
  game.participants.push(participant);
  return participant;
}

function submitTmi(game, name, tmi) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const trimmedName = requireName(name);
  const trimmedTmi = typeof tmi === 'string' ? tmi.trim() : '';
  if (!trimmedTmi) throw new Error('TMI_REQUIRED');
  const participant = joinTmi(game, trimmedName);
  participant.tmi = trimmedTmi;
  return participant;
}

function startTmi(game) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const submitters = game.participants.filter((p) => p.tmi);
  if (game.participants.length < MIN_PARTICIPANTS || submitters.length === 0) {
    throw new Error('NOT_ENOUGH_ENTRIES');
  }
  game.rounds = shuffled(submitters).map((owner) => {
    const others = shuffled(game.participants.filter((p) => p.id !== owner.id))
      .slice(0, CHOICES_PER_ROUND - 1);
    return { ownerId: owner.id, choiceIds: shuffled([owner.id, ...others.map((p) => p.id)]) };
  });
  game.currentIndex = 0;
  game.status = 'question';
}

function answerTmi(game, participantId, choiceIndex) {
  if (game.status !== 'question') throw new Error('WRONG_STATE');
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  const round = game.rounds[game.currentIndex];
  if (participant.id === round.ownerId) throw new Error('OWN_QUESTION');
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= round.choiceIds.length) {
    throw new Error('CHOICE_INVALID');
  }
  if (participant.answers[game.currentIndex]) throw new Error('ALREADY_ANSWERED');
  const order = game.participants.filter((p) => p.answers[game.currentIndex]).length;
  participant.answers[game.currentIndex] = { choiceIndex, order };
  return participant;
}

function revealTmi(game) {
  if (game.status !== 'question') throw new Error('WRONG_STATE');
  const round = game.rounds[game.currentIndex];
  const answerIndex = round.choiceIds.indexOf(round.ownerId);
  const correct = game.participants
    .filter((p) => p.answers[game.currentIndex]?.choiceIndex === answerIndex)
    .sort((a, b) => a.answers[game.currentIndex].order - b.answers[game.currentIndex].order);
  correct.forEach((p, rank) => {
    p.score += CORRECT_SCORE + (SPEED_BONUS[rank] ?? 0);
  });
  game.status = 'revealed';
}

function nextTmi(game) {
  if (game.status !== 'revealed') throw new Error('WRONG_STATE');
  game.currentIndex += 1;
  game.status = game.currentIndex >= game.rounds.length ? 'finished' : 'question';
}

function resetTmi(game) {
  game.status = 'collecting';
  game.currentIndex = -1;
  game.rounds = [];
  for (const p of game.participants) {
    p.score = 0;
    p.answers = {};
  }
}

function clearTmi(game) {
  game.participants = [];
  resetTmi(game);
}

function byId(game, id) {
  return game.participants.find((p) => p.id === id);
}

function tmiSnapshot(game) {
  const active = game.status === 'question' || game.status === 'revealed';
  let round = null;
  if (active) {
    const current = game.rounds[game.currentIndex];
    round = {
      tmi: byId(game, current.ownerId).tmi,
      choices: current.choiceIds.map((id) => byId(game, id).name),
    };
    if (game.status === 'revealed') {
      round.answerIndex = current.choiceIds.indexOf(current.ownerId);
      round.ownerName = byId(game, current.ownerId).name;
      round.counts = current.choiceIds.map((_, choice) =>
        game.participants.filter((p) => p.answers[game.currentIndex]?.choiceIndex === choice).length);
    }
  }
  return {
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    participantCount: game.participants.length,
    submittedCount: game.participants.filter((p) => p.tmi).length,
    members: game.participants.map((p) => ({ name: p.name, submitted: Boolean(p.tmi) })),
    round,
    answeredCount: active
      ? game.participants.filter((p) => p.answers[game.currentIndex]).length
      : 0,
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      answered: active ? Boolean(p.answers[game.currentIndex]) : false,
    })),
  };
}

function tmiParticipantView(game, participantId) {
  const p = byId(game, participantId);
  if (!p) return null;
  const active = game.status === 'question' || game.status === 'revealed';
  return {
    participantId: p.id,
    name: p.name,
    tmi: p.tmi,
    submitted: Boolean(p.tmi),
    score: p.score,
    answeredChoice: active ? (p.answers[game.currentIndex]?.choiceIndex ?? null) : null,
    isOwner: active ? game.rounds[game.currentIndex].ownerId === p.id : false,
  };
}

module.exports = {
  createTmi, submitTmi, joinTmi, startTmi, answerTmi, revealTmi, nextTmi,
  resetTmi, clearTmi, reviveTmi, tmiSnapshot, tmiParticipantView,
};
