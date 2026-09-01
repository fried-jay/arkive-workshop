'use strict';
const crypto = require('node:crypto');

const TMIS_PER_PERSON = 3;
const MIN_PARTICIPANTS = 2;

// 진행 형태: 한 사람의 TMI 3개를 힌트처럼 하나씩 공개하고,
// 다 나온 뒤 "주인 공개" — 답변/점수 없이 다 같이 입으로 추리하는 게임.
function createTmi() {
  return {
    participants: [],      // [{id, name, tmis: string[3]}]
    status: 'collecting',  // collecting → playing → finished
    rounds: [],            // 셔플된 참가자 id 순서
    roundIndex: -1,
    revealedCount: 0,      // 현재 라운드에서 공개된 힌트 수 (1~3)
    ownerRevealed: false,
  };
}

// 저장 파일이 현재 형태일 때만 복원 (구버전 형태는 새 게임으로)
function reviveTmi(saved) {
  if (!saved || !Array.isArray(saved.participants)) return null;
  if (!saved.participants.every((p) => Array.isArray(p.tmis))) return null;
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

function submitTmi(game, name, tmis) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('NAME_REQUIRED');
  const trimmedTmis = Array.isArray(tmis)
    ? tmis.map((t) => (typeof t === 'string' ? t.trim() : ''))
    : [];
  if (trimmedTmis.length !== TMIS_PER_PERSON || trimmedTmis.some((t) => t === '')) {
    throw new Error('TMI_REQUIRED');
  }
  const existing = game.participants.find((p) => p.name === trimmedName);
  if (existing) {
    existing.tmis = trimmedTmis;
    return existing;
  }
  const participant = { id: crypto.randomUUID(), name: trimmedName, tmis: trimmedTmis };
  game.participants.push(participant);
  return participant;
}

function startTmi(game) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  if (game.participants.length < MIN_PARTICIPANTS) throw new Error('NOT_ENOUGH_ENTRIES');
  game.rounds = shuffled(game.participants.map((p) => p.id));
  game.roundIndex = 0;
  game.revealedCount = 1;
  game.ownerRevealed = false;
  game.status = 'playing';
}

function advanceTmi(game) {
  if (game.status !== 'playing') throw new Error('WRONG_STATE');
  if (game.revealedCount < TMIS_PER_PERSON) {
    game.revealedCount += 1;
  } else if (!game.ownerRevealed) {
    game.ownerRevealed = true;
  } else if (game.roundIndex + 1 < game.rounds.length) {
    game.roundIndex += 1;
    game.revealedCount = 1;
    game.ownerRevealed = false;
  } else {
    game.status = 'finished';
  }
}

function resetTmi(game) {
  game.status = 'collecting';
  game.rounds = [];
  game.roundIndex = -1;
  game.revealedCount = 0;
  game.ownerRevealed = false;
}

function clearTmi(game) {
  game.participants = [];
  resetTmi(game);
}

function tmiSnapshot(game) {
  let round = null;
  if (game.status === 'playing') {
    const owner = game.participants.find((p) => p.id === game.rounds[game.roundIndex]);
    round = {
      tmis: owner.tmis.slice(0, game.revealedCount),
      totalTmis: TMIS_PER_PERSON,
      ownerName: game.ownerRevealed ? owner.name : null,
    };
  }
  return {
    status: game.status,
    participantCount: game.participants.length,
    members: game.participants.map((p) => p.name),
    roundIndex: game.roundIndex,
    totalRounds: game.rounds.length,
    revealedCount: game.revealedCount,
    ownerRevealed: game.ownerRevealed,
    round,
  };
}

function tmiParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  return { participantId: p.id, name: p.name, tmis: [...p.tmis] };
}

module.exports = {
  createTmi, submitTmi, startTmi, advanceTmi,
  resetTmi, clearTmi, reviveTmi, tmiSnapshot, tmiParticipantView,
};
