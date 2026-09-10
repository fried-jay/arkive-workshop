'use strict';
const crypto = require('node:crypto');

// 캐치마인드(사전 제출형): 참가자가 미리 그림 + 정답을 제출(collecting) →
// 진행자가 하나씩 공개(showing)하고, 참가자는 손들어 맞힌다 →
// 진행자가 정답자를 지정하면 점수 반영. 타이핑 맞히기 없음.

const WINNER_SCORE = 100;
const DRAWER_SCORE = 50;
const MAX_STROKES = 2000;
const MAX_POINTS_PER_STROKE = 500;

function createCatchmind() {
  return { status: 'collecting', submissions: [], currentIndex: -1, scores: {}, promptBank: [], assignments: {} };
}

function validStroke(s) {
  return s && Array.isArray(s.points) && s.points.length > 0 &&
    s.points.length <= MAX_POINTS_PER_STROKE &&
    s.points.every((pt) => Array.isArray(pt) && pt.length === 2 &&
      pt.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) &&
    typeof s.c === 'string' && s.c.length <= 20 &&
    typeof s.w === 'number' && s.w > 0 && s.w <= 40;
}

// 제시어 뱅크 설정: [{word, hints:[h1,h2]}]. 수집 단계에서만. 순서 섞어 저장.
function setPromptBank(game, prompts) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('PROMPTS_INVALID');
  const clean = prompts.map((p) => ({
    word: typeof p.word === 'string' ? p.word.trim() : '',
    hints: (Array.isArray(p.hints) ? p.hints : []).map((h) => String(h).trim()).filter(Boolean).slice(0, 2),
  }));
  if (clean.some((p) => !p.word)) throw new Error('PROMPTS_INVALID');
  for (let i = clean.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [clean[i], clean[j]] = [clean[j], clean[i]];
  }
  game.promptBank = clean;
  game.assignments = {};
}

// 명단을 받아 제시어를 라운드로빈으로 골고루 배정 (겹침 최소화)
function assignPrompts(game, names) {
  if (!game.promptBank || game.promptBank.length === 0) throw new Error('PROMPTS_INVALID');
  if (!Array.isArray(names)) throw new Error('PROMPTS_INVALID');
  game.assignments = game.assignments || {};
  const order = game.promptBank.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  let k = 0;
  for (const raw of names) {
    const key = String(raw || '').trim();
    if (!key) continue;
    game.assignments[key] = order[k % order.length];
    k += 1;
  }
  return Object.keys(game.assignments).length;
}

// 배정된 제시어 반환 (배정 없으면 이름 해시로 폴백)
function promptForName(game, name) {
  if (!game.promptBank || game.promptBank.length === 0) return null;
  const key = String(name || '').trim();
  if (game.assignments && game.assignments[key] != null) return game.promptBank[game.assignments[key]];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return game.promptBank[h % game.promptBank.length];
}

// 그림 + 정답 제출. 같은 이름이면 덮어쓴다. 수집 단계에서만 가능.
function submitCatchmind(game, name, strokes, word) {
  if (game.status !== 'collecting') throw new Error('WRONG_STATE');
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const assigned = promptForName(game, trimmed);
  const w = assigned ? assigned.word : (typeof word === 'string' ? word.trim() : '');
  const hints = assigned ? assigned.hints : [];
  if (!w) throw new Error('WORD_REQUIRED');
  if (!Array.isArray(strokes) || strokes.length === 0 ||
    strokes.length > MAX_STROKES || !strokes.every(validStroke)) {
    throw new Error('STROKE_INVALID');
  }
  const existing = game.submissions.find((s) => s.name === trimmed);
  if (existing) {
    existing.strokes = strokes;
    existing.word = w;
    existing.hints = hints;
    return existing;
  }
  const sub = { id: crypto.randomUUID(), name: trimmed, strokes, word: w, hints, winnerName: null, revealed: false };
  game.submissions.push(sub);
  return sub;
}

function startShow(game) {
  if (game.submissions.length === 0) throw new Error('NOT_ENOUGH_ENTRIES');
  // 공개 순서 섞기
  for (let i = game.submissions.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [game.submissions[i], game.submissions[j]] = [game.submissions[j], game.submissions[i]];
  }
  game.status = 'showing';
  game.currentIndex = 0;
  return game;
}

function nextShow(game) {
  if (game.status !== 'showing') throw new Error('WRONG_STATE');
  if (game.currentIndex + 1 >= game.submissions.length) {
    game.status = 'finished';
  } else {
    game.currentIndex += 1;
  }
  return game;
}

// 정답 공개(정답자 없음 — 아무도 못 맞힘)
function revealCurrent(game) {
  if (game.status !== 'showing') throw new Error('WRONG_STATE');
  game.submissions[game.currentIndex].revealed = true;
  return game.submissions[game.currentIndex];
}

// 진행자가 정답자 지정 → 정답자 +100, 그린 사람 +50, 정답 공개
function pickWinner(game, winnerName) {
  if (game.status !== 'showing') throw new Error('WRONG_STATE');
  const w = typeof winnerName === 'string' ? winnerName.trim() : '';
  if (!w) throw new Error('GUESS_REQUIRED');
  const sub = game.submissions[game.currentIndex];
  sub.winnerName = w;
  sub.revealed = true;
  game.scores[w] = (game.scores[w] || 0) + WINNER_SCORE;
  game.scores[sub.name] = (game.scores[sub.name] || 0) + DRAWER_SCORE;
  return sub;
}

// 진행/점수 초기화 (제출물은 유지)
function resetCatchmind(game) {
  game.status = 'collecting';
  game.currentIndex = -1;
  game.scores = {};
  for (const s of game.submissions) { s.winnerName = null; s.revealed = false; }
}

// 제출물까지 전부 삭제
function clearCatchmind(game) {
  const bank = game.promptBank || [];
  const asg = game.assignments || {};
  Object.assign(game, createCatchmind());
  game.promptBank = bank;
  game.assignments = asg;
}

function currentStrokes(game) {
  if (game.status !== 'showing') return [];
  return game.submissions[game.currentIndex]?.strokes ?? [];
}

function catchmindSnapshot(game) {
  const showing = game.status === 'showing';
  const cur = showing ? game.submissions[game.currentIndex] : null;
  return {
    status: game.status,
    total: game.submissions.length,
    currentIndex: game.currentIndex,
    submitters: game.submissions.map((s) => s.name),
    current: cur ? {
      drawerName: cur.revealed ? cur.name : null,   // 그린 사람은 공개 시점에만 노출
      revealed: cur.revealed,
      word: cur.revealed ? cur.word : null,
      hints: cur.hints || [],                        // 힌트는 맞히기 도움용으로 공개
      winnerName: cur.winnerName,
    } : null,
    scores: Object.entries(game.scores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko')),
  };
}

module.exports = {
  createCatchmind, setPromptBank, assignPrompts, promptForName, submitCatchmind, startShow, nextShow, revealCurrent, pickWinner,
  resetCatchmind, clearCatchmind, currentStrokes, catchmindSnapshot,
};
