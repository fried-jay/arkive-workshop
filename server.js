'use strict';
const path = require('node:path');
const express = require('express');
const {
  createGame, setItems, joinGame, markCell, resetGame,
  publicSnapshot, participantView,
} = require('./lib/game');
const {
  createQuiz, setQuestions, joinQuiz, openNext, answerQuestion,
  reveal, resetQuiz, quizSnapshot, quizParticipantView,
} = require('./lib/quiz');
const { loadState, createSaver } = require('./lib/persist');

const ERROR_STATUS = {
  NAME_REQUIRED: 400,
  ITEMS_NOT_SET: 400,
  ITEMS_INVALID: 400,
  CELL_INVALID: 400,
  QUESTIONS_INVALID: 400,
  CHOICE_INVALID: 400,
  QUIZ_NOT_READY: 409,
  WRONG_STATE: 409,
  ALREADY_ANSWERED: 409,
  PARTICIPANT_NOT_FOUND: 404,
};

function createServer({ dataFile, quizDataFile, saveDelayMs = 500 }) {
  quizDataFile ??= path.join(path.dirname(dataFile), 'quiz-data.json');
  const game = loadState(dataFile) ?? createGame();
  const quiz = loadState(quizDataFile) ?? createQuiz();
  const save = createSaver(dataFile, saveDelayMs);
  const saveQuiz = createSaver(quizDataFile, saveDelayMs);
  const sseClients = new Set();
  const quizSseClients = new Set();

  function broadcast() {
    save(game);
    const payload = `data: ${JSON.stringify(publicSnapshot(game))}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  function broadcastQuiz() {
    saveQuiz(quiz);
    const payload = `data: ${JSON.stringify(quizSnapshot(quiz))}\n\n`;
    for (const res of quizSseClients) res.write(payload);
  }

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function handle(res, fn) {
    try {
      fn();
    } catch (err) {
      const status = ERROR_STATUS[err.message] ?? 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: status === 500 ? 'INTERNAL' : err.message });
    }
  }

  app.post('/api/join', (req, res) => handle(res, () => {
    const p = joinGame(game, req.body?.name);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.get('/api/me/:participantId', (req, res) => {
    const view = participantView(game, req.params.participantId);
    if (!view) return res.status(404).json({ error: 'PARTICIPANT_NOT_FOUND' });
    res.json(view);
  });

  app.post('/api/mark', (req, res) => handle(res, () => {
    const { participantId, cellIndex, on } = req.body ?? {};
    const p = markCell(game, participantId, cellIndex, on);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.get('/api/state', (_req, res) => res.json(publicSnapshot(game)));

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(publicSnapshot(game))}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

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

  app.post('/api/quiz/join', (req, res) => handle(res, () => {
    const p = joinQuiz(quiz, req.body?.name);
    broadcastQuiz();
    res.json(quizParticipantView(quiz, p.id));
  }));

  app.get('/api/quiz/me/:participantId', (req, res) => {
    const view = quizParticipantView(quiz, req.params.participantId);
    if (!view) return res.status(404).json({ error: 'PARTICIPANT_NOT_FOUND' });
    res.json(view);
  });

  app.post('/api/quiz/answer', (req, res) => handle(res, () => {
    const { participantId, choiceIndex } = req.body ?? {};
    const p = answerQuestion(quiz, participantId, choiceIndex);
    broadcastQuiz();
    res.json(quizParticipantView(quiz, p.id));
  }));

  app.get('/api/quiz/state', (_req, res) => res.json(quizSnapshot(quiz)));

  app.get('/api/quiz/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(quizSnapshot(quiz))}\n\n`);
    quizSseClients.add(res);
    req.on('close', () => quizSseClients.delete(res));
  });

  app.post('/api/quiz/admin/questions', (req, res) => handle(res, () => {
    setQuestions(quiz, req.body?.questions);
    broadcastQuiz();
    res.json({ ok: true });
  }));

  app.post('/api/quiz/admin/next', (_req, res) => handle(res, () => {
    openNext(quiz);
    broadcastQuiz();
    res.json({ ok: true });
  }));

  app.post('/api/quiz/admin/reveal', (_req, res) => handle(res, () => {
    reveal(quiz);
    broadcastQuiz();
    res.json({ ok: true });
  }));

  app.post('/api/quiz/admin/reset', (_req, res) => handle(res, () => {
    resetQuiz(quiz);
    broadcastQuiz();
    res.json({ ok: true });
  }));

  return { app, game, quiz };
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { app } = createServer({ dataFile: path.join(__dirname, 'data.json') });
  app.listen(port, () => console.log(`빙고 서버 실행 중: http://localhost:${port}`));
}
