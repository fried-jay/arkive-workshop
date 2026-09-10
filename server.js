'use strict';
const path = require('node:path');
const express = require('express');
const {
  createGame, setItems, joinGame, reshuffle, setReady, startGame, markCell, resetGame, clearBingoParticipants,
  publicSnapshot, participantView,
} = require('./lib/game');
const {
  createQuiz, setQuestions, joinQuiz, openNext, answerQuestion,
  reveal, resetQuiz, clearQuizParticipants, quizSnapshot, quizParticipantView,
} = require('./lib/quiz');
const {
  createBalance, setRounds, joinBalance, openNextRound, voteBalance,
  revealBalance, resetBalance, clearBalanceParticipants, balanceSnapshot, balanceParticipantView,
} = require('./lib/balance');
const {
  createTmi, submitTmi, startTmi, advanceTmi,
  resetTmi, clearTmi, reviveTmi, tmiSnapshot, tmiParticipantView,
} = require('./lib/tmi');
const {
  createCatchmind, joinCatchmind, assignDrawer, drawerByKey, submitDrawing,
  submitGuess, revealRound, resetCatchmind, catchmindSnapshot, catchmindParticipantView,
} = require('./lib/catchmind');
const {
  createManito, joinManito, setNote, startManito, guessManito,
  revealManito, resetManito, manitoSnapshot, manitoParticipantView,
} = require('./lib/manito');
const {
  createProphecy, submitProphecy, sealProphecy, revealProphecy, markHit,
  resetProphecy, prophecySnapshot, prophecyParticipantView,
} = require('./lib/prophecy');
const {
  createHidden, generateRounds, setRounds: setHiddenRounds, joinHidden, startHidden, nextRound: nextHidden,
  tapHidden, resetHidden, clearHiddenParticipants, hiddenSnapshot, hiddenParticipantView,
} = require('./lib/hidden');
const { loadState, createSaver } = require('./lib/persist');

const ERROR_STATUS = {
  NAME_REQUIRED: 400,
  ITEMS_NOT_SET: 400,
  ITEMS_INVALID: 400,
  CELL_INVALID: 400,
  NOT_STARTED: 409,
  ALREADY_STARTED: 409,
  ALREADY_READY: 409,
  NO_PARTICIPANTS: 400,
  HIDDEN_NOT_READY: 409,
  QUESTIONS_INVALID: 400,
  CHOICE_INVALID: 400,
  ROUNDS_INVALID: 400,
  TMI_REQUIRED: 400,
  WORD_REQUIRED: 400,
  GUESS_REQUIRED: 400,
  STROKE_INVALID: 400,
  MISSIONS_INVALID: 400,
  PROPHECY_REQUIRED: 400,
  MISSION_INVALID: 400,
  SELF_ACCUSE: 400,
  MISSION_NOT_READY: 409,
  ALREADY_DONE: 409,
  MISSION_FOILED: 409,
  OWN_DRAW: 403,
  DRAW_KEY_INVALID: 404,
  QUIZ_NOT_READY: 409,
  BALANCE_NOT_READY: 409,
  NOT_ENOUGH_ENTRIES: 409,
  WRONG_STATE: 409,
  ALREADY_ANSWERED: 409,
  ALREADY_VOTED: 409,
  OWN_QUESTION: 403,
  PARTICIPANT_NOT_FOUND: 404,
};

function createServer({ dataFile, quizDataFile, balanceDataFile, tmiDataFile, catchmindDataFile, saveDelayMs = 500 }) {
  const dir = path.dirname(dataFile);
  quizDataFile ??= path.join(dir, 'quiz-data.json');
  balanceDataFile ??= path.join(dir, 'balance-data.json');
  tmiDataFile ??= path.join(dir, 'tmi-data.json');
  catchmindDataFile ??= path.join(dir, 'catchmind-data.json');
  const manitoDataFile = path.join(dir, 'manito-data.json');
  const prophecyDataFile = path.join(dir, 'prophecy-data.json');
  const hiddenDataFile = path.join(dir, 'hidden-data.json');

  const game = loadState(dataFile) ?? createGame();
  const quiz = loadState(quizDataFile) ?? createQuiz();
  const balance = loadState(balanceDataFile) ?? createBalance();
  const tmi = reviveTmi(loadState(tmiDataFile)) ?? createTmi();
  const catchmind = loadState(catchmindDataFile) ?? createCatchmind();
  const manito = loadState(manitoDataFile) ?? createManito();
  const prophecy = loadState(prophecyDataFile) ?? createProphecy();
  const hidden = loadState(hiddenDataFile) ?? createHidden();

  const app = express();
  app.use(express.json({ limit: '2mb' })); // 캐치마인드 그림 제출용 여유
  app.use(express.static(path.join(__dirname, 'public')));

  // SSE 채널: 연결 즉시 + broadcast() 호출마다 전체 스냅샷 push, 상태 저장 포함
  function createSseChannel(route, state, file, getSnapshot) {
    const save = createSaver(file, saveDelayMs);
    const clients = new Set();
    app.get(route, (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(getSnapshot(state))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
    });
    return function broadcast() {
      save(state);
      const payload = `data: ${JSON.stringify(getSnapshot(state))}\n\n`;
      for (const res of clients) res.write(payload);
    };
  }

  const broadcast = createSseChannel('/api/events', game, dataFile, publicSnapshot);
  const broadcastQuiz = createSseChannel('/api/quiz/events', quiz, quizDataFile, quizSnapshot);
  const broadcastBalance = createSseChannel('/api/balance/events', balance, balanceDataFile, balanceSnapshot);
  const broadcastTmi = createSseChannel('/api/tmi/events', tmi, tmiDataFile, tmiSnapshot);
  const broadcastCatchmind = createSseChannel('/api/catchmind/events', catchmind, catchmindDataFile, catchmindSnapshot);
  const broadcastManito = createSseChannel('/api/manito/events', manito, manitoDataFile, manitoSnapshot);
  const broadcastProphecy = createSseChannel('/api/prophecy/events', prophecy, prophecyDataFile, prophecySnapshot);
  const broadcastHidden = createSseChannel('/api/hidden/events', hidden, hiddenDataFile, hiddenSnapshot);

  function handle(res, fn) {
    try {
      fn();
    } catch (err) {
      const status = ERROR_STATUS[err.message] ?? 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: status === 500 ? 'INTERNAL' : err.message });
    }
  }

  function meRoute(route, state, getView) {
    app.get(route, (req, res) => {
      const view = getView(state, req.params.participantId);
      if (!view) return res.status(404).json({ error: 'PARTICIPANT_NOT_FOUND' });
      res.json(view);
    });
  }

  // ---------- 빙고 ----------
  app.post('/api/join', (req, res) => handle(res, () => {
    const p = joinGame(game, req.body?.name);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  meRoute('/api/me/:participantId', game, participantView);

  app.post('/api/mark', (req, res) => handle(res, () => {
    const { participantId, cellIndex, on } = req.body ?? {};
    const p = markCell(game, participantId, cellIndex, on);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.post('/api/shuffle', (req, res) => handle(res, () => {
    const p = reshuffle(game, req.body?.participantId);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.post('/api/ready', (req, res) => handle(res, () => {
    const { participantId, ready } = req.body ?? {};
    const p = setReady(game, participantId, ready);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.get('/api/state', (_req, res) => res.json(publicSnapshot(game)));

  app.post('/api/admin/start', (_req, res) => handle(res, () => {
    startGame(game);
    broadcast();
    res.json({ ok: true });
  }));

  app.post('/api/admin/items', (req, res) => handle(res, () => {
    setItems(game, req.body?.items);
    broadcast();
    res.json({ ok: true });
  }));

  app.post('/api/admin/reset', (_req, res) => handle(res, () => {
    resetGame(game);
    broadcast();
    res.json({ ok: true });
  }));

  app.post('/api/admin/clear-participants', (_req, res) => handle(res, () => {
    clearBingoParticipants(game);
    broadcast();
    res.json({ ok: true });
  }));

  // ---------- 퀴즈 ----------
  app.post('/api/quiz/join', (req, res) => handle(res, () => {
    const p = joinQuiz(quiz, req.body?.name);
    broadcastQuiz();
    res.json(quizParticipantView(quiz, p.id));
  }));

  meRoute('/api/quiz/me/:participantId', quiz, quizParticipantView);

  app.post('/api/quiz/answer', (req, res) => handle(res, () => {
    const { participantId, choiceIndex } = req.body ?? {};
    const p = answerQuestion(quiz, participantId, choiceIndex);
    broadcastQuiz();
    res.json(quizParticipantView(quiz, p.id));
  }));

  app.get('/api/quiz/state', (_req, res) => res.json(quizSnapshot(quiz)));

  app.post('/api/quiz/admin/questions', (req, res) => handle(res, () => {
    setQuestions(quiz, req.body?.questions);
    broadcastQuiz();
    res.json({ ok: true });
  }));

  for (const [route, action] of [
    ['next', openNext], ['reveal', reveal], ['reset', resetQuiz], ['clear-participants', clearQuizParticipants],
  ]) {
    app.post(`/api/quiz/admin/${route}`, (_req, res) => handle(res, () => {
      action(quiz);
      broadcastQuiz();
      res.json({ ok: true });
    }));
  }

  // ---------- 밸런스 ----------
  app.post('/api/balance/join', (req, res) => handle(res, () => {
    const p = joinBalance(balance, req.body?.name);
    broadcastBalance();
    res.json(balanceParticipantView(balance, p.id));
  }));

  meRoute('/api/balance/me/:participantId', balance, balanceParticipantView);

  app.post('/api/balance/vote', (req, res) => handle(res, () => {
    const { participantId, choice } = req.body ?? {};
    const p = voteBalance(balance, participantId, choice);
    broadcastBalance();
    res.json(balanceParticipantView(balance, p.id));
  }));

  app.get('/api/balance/state', (_req, res) => res.json(balanceSnapshot(balance)));

  app.post('/api/balance/admin/rounds', (req, res) => handle(res, () => {
    setRounds(balance, req.body?.rounds);
    broadcastBalance();
    res.json({ ok: true });
  }));

  for (const [route, action] of [
    ['next', openNextRound], ['reveal', revealBalance], ['reset', resetBalance], ['clear-participants', clearBalanceParticipants],
  ]) {
    app.post(`/api/balance/admin/${route}`, (_req, res) => handle(res, () => {
      action(balance);
      broadcastBalance();
      res.json({ ok: true });
    }));
  }

  // ---------- TMI ----------
  app.post('/api/tmi/submit', (req, res) => handle(res, () => {
    const { name, tmis } = req.body ?? {};
    const p = submitTmi(tmi, name, tmis);
    broadcastTmi();
    res.json(tmiParticipantView(tmi, p.id));
  }));

  meRoute('/api/tmi/me/:participantId', tmi, tmiParticipantView);

  app.get('/api/tmi/state', (_req, res) => res.json(tmiSnapshot(tmi)));

  for (const [route, action] of [
    ['start', startTmi], ['next', advanceTmi],
    ['reset', resetTmi], ['clear', clearTmi],
  ]) {
    app.post(`/api/tmi/admin/${route}`, (_req, res) => handle(res, () => {
      action(tmi);
      broadcastTmi();
      res.json({ ok: true });
    }));
  }

  // ---------- 캐치마인드 ----------
  app.post('/api/catchmind/join', (req, res) => handle(res, () => {
    const p = joinCatchmind(catchmind, req.body?.name);
    broadcastCatchmind();
    res.json(catchmindParticipantView(catchmind, p.id));
  }));

  meRoute('/api/catchmind/me/:participantId', catchmind, catchmindParticipantView);

  app.get('/api/catchmind/state', (_req, res) => res.json(catchmindSnapshot(catchmind)));

  app.get('/api/catchmind/strokes', (_req, res) => res.json({ strokes: catchmind.strokes }));

  app.get('/api/catchmind/draw/:key', (req, res) => {
    const drawer = drawerByKey(catchmind, req.params.key);
    if (!drawer || catchmind.status !== 'waiting') {
      return res.status(404).json({ error: 'DRAW_KEY_INVALID' });
    }
    res.json({ name: drawer.name });
  });

  app.post('/api/catchmind/draw/submit', (req, res) => handle(res, () => {
    const { key, strokes, word } = req.body ?? {};
    submitDrawing(catchmind, key, strokes, word);
    broadcastCatchmind();
    res.json({ ok: true });
  }));

  app.post('/api/catchmind/guess', (req, res) => handle(res, () => {
    const { participantId, text } = req.body ?? {};
    const result = submitGuess(catchmind, participantId, text);
    broadcastCatchmind();
    res.json(result);
  }));

  app.post('/api/catchmind/admin/assign', (req, res) => handle(res, () => {
    const key = assignDrawer(catchmind, req.body?.participantId);
    broadcastCatchmind();
    res.json({ key });
  }));

  for (const [route, action] of [['reveal', revealRound], ['reset', resetCatchmind]]) {
    app.post(`/api/catchmind/admin/${route}`, (_req, res) => handle(res, () => {
      action(catchmind);
      broadcastCatchmind();
      res.json({ ok: true });
    }));
  }

  // ---------- 마니또 ----------
  app.post('/api/manito/join', (req, res) => handle(res, () => {
    const p = joinManito(manito, req.body?.name);
    broadcastManito();
    res.json(manitoParticipantView(manito, p.id));
  }));

  meRoute('/api/manito/me/:participantId', manito, manitoParticipantView);

  app.get('/api/manito/state', (_req, res) => res.json(manitoSnapshot(manito)));

  app.post('/api/manito/guess', (req, res) => handle(res, () => {
    const { participantId, guessName } = req.body ?? {};
    const guessed = manito.participants.find((p) => p.name === guessName);
    const p = guessManito(manito, participantId, guessed?.id ?? 'unknown');
    broadcastManito();
    res.json(manitoParticipantView(manito, p.id));
  }));

  app.post('/api/manito/admin/note', (req, res) => handle(res, () => {
    setNote(manito, req.body?.text);
    broadcastManito();
    res.json({ ok: true });
  }));

  for (const [route, action] of [
    ['start', startManito], ['reveal', revealManito], ['reset', resetManito],
  ]) {
    app.post(`/api/manito/admin/${route}`, (_req, res) => handle(res, () => {
      action(manito);
      broadcastManito();
      res.json({ ok: true });
    }));
  }

  // ---------- 몰래 예언 ----------
  app.post('/api/prophecy/submit', (req, res) => handle(res, () => {
    const { name, text } = req.body ?? {};
    const p = submitProphecy(prophecy, name, text);
    broadcastProphecy();
    res.json(prophecyParticipantView(prophecy, p.id));
  }));

  meRoute('/api/prophecy/me/:participantId', prophecy, prophecyParticipantView);

  app.get('/api/prophecy/state', (_req, res) => res.json(prophecySnapshot(prophecy)));

  app.post('/api/prophecy/admin/mark', (req, res) => handle(res, () => {
    const { name, hit } = req.body ?? {};
    const target = prophecy.participants.find((p) => p.name === name);
    markHit(prophecy, target?.id ?? 'unknown', hit);
    broadcastProphecy();
    res.json({ ok: true });
  }));

  for (const [route, action] of [
    ['seal', sealProphecy], ['reveal', revealProphecy], ['reset', resetProphecy],
  ]) {
    app.post(`/api/prophecy/admin/${route}`, (_req, res) => handle(res, () => {
      action(prophecy);
      broadcastProphecy();
      res.json({ ok: true });
    }));
  }


  // ---------- 숨은그림찾기 ----------
  app.post('/api/hidden/join', (req, res) => handle(res, () => {
    const p = joinHidden(hidden, req.body?.name);
    broadcastHidden();
    res.json(hiddenParticipantView(hidden, p.id));
  }));

  meRoute('/api/hidden/me/:participantId', hidden, hiddenParticipantView);

  app.get('/api/hidden/state', (_req, res) => res.json(hiddenSnapshot(hidden)));

  app.post('/api/hidden/tap', (req, res) => handle(res, () => {
    const { participantId, cellIndex } = req.body ?? {};
    const result = tapHidden(hidden, participantId, cellIndex);
    broadcastHidden();
    res.json(result);
  }));

  app.post('/api/hidden/admin/generate', (req, res) => handle(res, () => {
    setHiddenRounds(hidden, generateRounds(req.body?.count));
    broadcastHidden();
    res.json({ ok: true, rounds: hidden.rounds.length });
  }));

  app.post('/api/hidden/admin/start', (_req, res) => handle(res, () => {
    startHidden(hidden);
    broadcastHidden();
    res.json({ ok: true });
  }));

  app.post('/api/hidden/admin/next', (_req, res) => handle(res, () => {
    nextHidden(hidden);
    broadcastHidden();
    res.json({ ok: true });
  }));

  app.post('/api/hidden/admin/reset', (_req, res) => handle(res, () => {
    resetHidden(hidden);
    broadcastHidden();
    res.json({ ok: true });
  }));

  app.post('/api/hidden/admin/clear-participants', (_req, res) => handle(res, () => {
    clearHiddenParticipants(hidden);
    broadcastHidden();
    res.json({ ok: true });
  }));

  return { app, game, quiz, balance, tmi, catchmind, manito, prophecy, hidden };
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { app } = createServer({ dataFile: path.join(__dirname, 'data.json') });
  app.listen(port, () => console.log(`워크숍 게임 서버 실행 중: http://localhost:${port}`));
}
