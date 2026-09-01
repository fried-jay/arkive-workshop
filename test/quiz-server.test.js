const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const QUESTIONS = [
  { text: '우리 회사 창립연도는?', choices: ['2019', '2020', '2021', '2022'], answerIndex: 1 },
  { text: '대표님 MBTI는?', choices: ['ENFP', 'ISTJ'], answerIndex: 0 },
];

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-srv-'));
  const dataFile = path.join(dir, 'data.json');
  const quizDataFile = path.join(dir, 'quiz-data.json');
  const { app } = createServer({ dataFile, quizDataFile, saveDelayMs: 10 });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, quizDataFile };
}

// close()만으로는 keep-alive/SSE 소켓이 남아 테스트 프로세스가 안 끝날 수 있음
function stop(server) {
  server.closeAllConnections?.();
  server.close();
}

async function post(base, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

test('퀴즈 전체 흐름: 문제 등록 → join → next → answer → reveal → 순위', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));

  // 문제 검증
  let res = await post(base, '/api/quiz/admin/questions', { questions: [{ text: 'q', choices: ['한개'], answerIndex: 0 }] });
  assert.equal(res.status, 400);
  res = await post(base, '/api/quiz/admin/questions', { questions: QUESTIONS });
  assert.equal(res.status, 200);

  // 문제 열기 전 next 없이 answer 불가 확인용 join
  res = await post(base, '/api/quiz/join', { name: '원' });
  assert.equal(res.status, 200);
  const p1 = res.body.participantId;
  assert.equal(res.body.score, 0);

  res = await post(base, '/api/quiz/join', { name: '  ' });
  assert.equal(res.status, 400);

  // idle 상태에서 답변 거부
  res = await post(base, '/api/quiz/answer', { participantId: p1, choiceIndex: 0 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'WRONG_STATE');

  // 문제 1 열기
  res = await post(base, '/api/quiz/admin/next');
  assert.equal(res.status, 200);

  // 상태: question, answerIndex 미노출
  let stateRes = await fetch(`${base}/api/quiz/state`);
  let snap = await stateRes.json();
  assert.equal(snap.status, 'question');
  assert.equal('answerIndex' in snap.question, false);

  // 답변
  res = await post(base, '/api/quiz/answer', { participantId: p1, choiceIndex: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.answeredChoice, 1);
  res = await post(base, '/api/quiz/answer', { participantId: p1, choiceIndex: 0 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'ALREADY_ANSWERED');
  res = await post(base, '/api/quiz/answer', { participantId: 'nope', choiceIndex: 0 });
  assert.equal(res.status, 404);

  // 공개 → 점수 반영
  res = await post(base, '/api/quiz/admin/reveal');
  assert.equal(res.status, 200);
  stateRes = await fetch(`${base}/api/quiz/state`);
  snap = await stateRes.json();
  assert.equal(snap.status, 'revealed');
  assert.equal(snap.question.answerIndex, 1);
  assert.deepEqual(snap.participants, [{ name: '원', score: 130, answered: true }]);

  // me 복원
  const meRes = await fetch(`${base}/api/quiz/me/${p1}`);
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).score, 130);
  assert.equal((await fetch(`${base}/api/quiz/me/nope`)).status, 404);

  // 문제 2 → finished
  await post(base, '/api/quiz/admin/next');
  await post(base, '/api/quiz/admin/reveal');
  res = await post(base, '/api/quiz/admin/next');
  assert.equal(res.status, 200);
  stateRes = await fetch(`${base}/api/quiz/state`);
  assert.equal((await stateRes.json()).status, 'finished');

  // reset
  res = await post(base, '/api/quiz/admin/reset');
  assert.equal(res.status, 200);
  stateRes = await fetch(`${base}/api/quiz/state`);
  snap = await stateRes.json();
  assert.equal(snap.status, 'idle');
  assert.equal(snap.participants.length, 0);
  assert.equal(snap.totalQuestions, 2);
});

test('퀴즈 SSE: 연결 즉시 스냅샷 push', async (t) => {
  const { server, base } = startServer();
  t.after(() => stop(server));
  await post(base, '/api/quiz/admin/questions', { questions: QUESTIONS });

  const res = await fetch(`${base}/api/quiz/events`);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const snap = JSON.parse(new TextDecoder().decode(value).replace(/^data: /, '').trim());
  assert.equal(snap.totalQuestions, 2);
  await reader.cancel();
});

test('퀴즈 영속화: 재시작 시 문제/참가자 복원', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-srv-'));
  const dataFile = path.join(dir, 'data.json');
  const quizDataFile = path.join(dir, 'quiz-data.json');
  const first = createServer({ dataFile, quizDataFile, saveDelayMs: 10 });
  const server1 = first.app.listen(0);
  const base1 = `http://127.0.0.1:${server1.address().port}`;
  await post(base1, '/api/quiz/admin/questions', { questions: QUESTIONS });
  const joinRes = await post(base1, '/api/quiz/join', { name: '원' });
  await new Promise((r) => setTimeout(r, 100));
  stop(server1);

  const second = createServer({ dataFile, quizDataFile });
  const server2 = second.app.listen(0);
  t.after(() => stop(server2));
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const meRes = await fetch(`${base2}/api/quiz/me/${joinRes.body.participantId}`);
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).name, '원');
});
