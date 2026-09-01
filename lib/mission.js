'use strict';
const crypto = require('node:crypto');

const DONE_SCORE = 100;
const ACCUSE_SCORE = 50;
const ACCUSE_PENALTY = 20;
const MIN_PARTICIPANTS = 2;

// 비밀미션: 미션 풀은 전원 공개, 누가 어떤 미션인지만 비밀.
// 성공은 자진 신고(+100), 다른 사람 미션을 간파하면 무효화(+50, 오판 -20).
function createMission() {
  return { missions: [], status: 'idle', participants: [] };
}

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function setMissions(game, missions) {
  if (game.status !== 'idle') throw new Error('WRONG_STATE');
  if (!Array.isArray(missions) || missions.length === 0) throw new Error('MISSIONS_INVALID');
  const trimmed = missions.map((m) => (typeof m === 'string' ? m.trim() : ''));
  if (trimmed.some((m) => m === '')) throw new Error('MISSIONS_INVALID');
  game.missions = trimmed;
}

function unusedMissionIndex(game) {
  const used = new Set(game.participants.map((p) => p.missionIndex));
  const free = game.missions.map((_, i) => i).filter((i) => !used.has(i));
  const pool = free.length > 0 ? free : game.missions.map((_, i) => i);
  return pool[crypto.randomInt(pool.length)];
}

function joinMission(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = {
    id: crypto.randomUUID(),
    name: trimmed,
    score: 0,
    missionIndex: null,
    done: false,
    foiled: false,
    foiledBy: null,
  };
  if (game.status === 'running') participant.missionIndex = unusedMissionIndex(game);
  game.participants.push(participant);
  return participant;
}

function startMission(game) {
  if (game.status !== 'idle') throw new Error('WRONG_STATE');
  if (game.participants.length < MIN_PARTICIPANTS || game.missions.length === 0) {
    throw new Error('MISSION_NOT_READY');
  }
  const order = shuffled(game.missions.map((_, i) => i));
  game.participants.forEach((p, i) => {
    p.missionIndex = order[i % order.length];
  });
  game.status = 'running';
}

function findParticipant(game, id) {
  const p = game.participants.find((x) => x.id === id);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  return p;
}

function reportDone(game, participantId) {
  if (game.status !== 'running') throw new Error('WRONG_STATE');
  const p = findParticipant(game, participantId);
  if (p.done) throw new Error('ALREADY_DONE');
  if (p.foiled) throw new Error('MISSION_FOILED');
  p.done = true;
  p.score += DONE_SCORE;
  return p;
}

function accuse(game, accuserId, targetId, missionIndex) {
  if (game.status !== 'running') throw new Error('WRONG_STATE');
  const accuser = findParticipant(game, accuserId);
  if (accuserId === targetId) throw new Error('SELF_ACCUSE');
  const target = findParticipant(game, targetId);
  if (!Number.isInteger(missionIndex) || missionIndex < 0 || missionIndex >= game.missions.length) {
    throw new Error('MISSION_INVALID');
  }
  if (target.done) throw new Error('ALREADY_DONE');
  if (target.foiled) throw new Error('MISSION_FOILED');
  if (target.missionIndex === missionIndex) {
    target.foiled = true;
    target.foiledBy = accuser.name;
    accuser.score += ACCUSE_SCORE;
    return { correct: true };
  }
  accuser.score -= ACCUSE_PENALTY;
  return { correct: false };
}

function revealMission(game) {
  if (game.status !== 'running') throw new Error('WRONG_STATE');
  game.status = 'revealed';
}

function resetMission(game) {
  game.status = 'idle';
  game.participants = [];
}

function missionSnapshot(game) {
  const snap = {
    status: game.status,
    missions: [...game.missions],
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      done: p.done,
      foiled: p.foiled,
    })),
  };
  if (game.status === 'revealed') {
    snap.assignments = game.participants.map((p) => ({
      name: p.name,
      mission: game.missions[p.missionIndex] ?? null,
      done: p.done,
      foiled: p.foiled,
      foiledBy: p.foiledBy,
    }));
  }
  return snap;
}

function missionParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  return {
    participantId: p.id,
    name: p.name,
    score: p.score,
    mission: p.missionIndex == null ? null : game.missions[p.missionIndex],
    done: p.done,
    foiled: p.foiled,
    foiledBy: p.foiledBy,
  };
}

module.exports = {
  createMission, setMissions, joinMission, startMission, reportDone, accuse,
  revealMission, resetMission, missionSnapshot, missionParticipantView,
};
