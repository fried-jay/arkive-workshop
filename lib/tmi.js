'use strict';
const crypto = require('node:crypto');

const MIN_ENTRIES = 4;
const CHOICES_PER_ROUND = 4;
const CORRECT_SCORE = 100;
const SPEED_BONUS = [30, 20, 10];

function createTmi() {
  // entries: 제출자이자 참가자. rounds는 startTmi에서 생성.
  return { entries: [], status: 'collecting', currentIndex: -1, rounds: [] };
}

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function submitTmi(game, name, tmi) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('NAME_REQUIRED');
  const trimmedTmi = typeof tmi === 'string' ? tmi.trim() : '';
  if (!trimmedTmi) throw new Error('TMI_REQUIRED');
  const existing = game.entries.find((e) => e.name === trimmedName);
  if (existing) {
    existing.tmi = trimmedTmi;
    return existing;
  }
  const entry = { id: crypto.randomUUID(), name: trimmedName, tmi: trimmedTmi, score: 0, answers: {} };
  game.entries.push(entry);
  return entry;
}

function startTmi(game) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  if (game.entries.length < MIN_ENTRIES) throw new Error('NOT_ENOUGH_ENTRIES');
  game.rounds = shuffled(game.entries).map((owner) => {
    const others = shuffled(game.entries.filter((e) => e.id !== owner.id))
      .slice(0, CHOICES_PER_ROUND - 1);
    return { ownerId: owner.id, choiceIds: shuffled([owner.id, ...others.map((e) => e.id)]) };
  });
  game.currentIndex = 0;
  game.status = 'question';
}

function answerTmi(game, participantId, choiceIndex) {
  if (game.status !== 'question') throw new Error('WRONG_STATE');
  const participant = game.entries.find((e) => e.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  const round = game.rounds[game.currentIndex];
  if (participant.id === round.ownerId) throw new Error('OWN_QUESTION');
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= round.choiceIds.length) {
    throw new Error('CHOICE_INVALID');
  }
  if (participant.answers[game.currentIndex]) throw new Error('ALREADY_ANSWERED');
  const order = game.entries.filter((e) => e.answers[game.currentIndex]).length;
  participant.answers[game.currentIndex] = { choiceIndex, order };
  return participant;
}

function revealTmi(game) {
  if (game.status !== 'question') throw new Error('WRONG_STATE');
  const round = game.rounds[game.currentIndex];
  const answerIndex = round.choiceIds.indexOf(round.ownerId);
  const correct = game.entries
    .filter((e) => e.answers[game.currentIndex]?.choiceIndex === answerIndex)
    .sort((a, b) => a.answers[game.currentIndex].order - b.answers[game.currentIndex].order);
  correct.forEach((e, rank) => {
    e.score += CORRECT_SCORE + (SPEED_BONUS[rank] ?? 0);
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
  for (const e of game.entries) {
    e.score = 0;
    e.answers = {};
  }
}

function clearTmi(game) {
  game.entries = [];
  resetTmi(game);
}

function entryById(game, id) {
  return game.entries.find((e) => e.id === id);
}

function tmiSnapshot(game) {
  const active = game.status === 'question' || game.status === 'revealed';
  let round = null;
  if (active) {
    const current = game.rounds[game.currentIndex];
    round = {
      tmi: entryById(game, current.ownerId).tmi,
      choices: current.choiceIds.map((id) => entryById(game, id).name),
    };
    if (game.status === 'revealed') {
      round.answerIndex = current.choiceIds.indexOf(current.ownerId);
      round.ownerName = entryById(game, current.ownerId).name;
      round.counts = current.choiceIds.map((_, choice) =>
        game.entries.filter((e) => e.answers[game.currentIndex]?.choiceIndex === choice).length);
    }
  }
  return {
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    entryCount: game.entries.length,
    names: game.entries.map((e) => e.name),
    round,
    answeredCount: active
      ? game.entries.filter((e) => e.answers[game.currentIndex]).length
      : 0,
    participants: game.entries.map((e) => ({
      name: e.name,
      score: e.score,
      answered: active ? Boolean(e.answers[game.currentIndex]) : false,
    })),
  };
}

function tmiParticipantView(game, participantId) {
  const e = entryById(game, participantId);
  if (!e) return null;
  const active = game.status === 'question' || game.status === 'revealed';
  return {
    participantId: e.id,
    name: e.name,
    tmi: e.tmi,
    score: e.score,
    answeredChoice: active ? (e.answers[game.currentIndex]?.choiceIndex ?? null) : null,
    isOwner: active ? game.rounds[game.currentIndex].ownerId === e.id : false,
  };
}

module.exports = {
  createTmi, submitTmi, startTmi, answerTmi, revealTmi, nextTmi,
  resetTmi, clearTmi, tmiSnapshot, tmiParticipantView,
};
