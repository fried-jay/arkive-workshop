# 사내 워크숍 퀴즈 웹 — 설계 스펙

날짜: 2026-09-01
상태: 사용자 전권 위임("너가 시작해서 다해줘")으로 기본값 설계 확정

## 목적

워크숍 게임 2번째: 진행자 주도 라이브 퀴즈 (카훗 스타일). 빙고와 동일한
아키텍처(Express + SSE + 바닐라 JS, `lib/` 순수 로직 + node:test)를 따른다.

## 게임 규칙

- 진행자가 문제를 미리 등록 (문제 + 보기 2~4개 + 정답).
- 진행자가 "다음 문제"를 누르면 참가자 화면에 문제 공개 (`question` 상태).
- 참가자는 문제당 한 번만 답변. 답변 순서가 기록된다.
- 진행자가 "정답 공개"를 누르면 마감(`revealed` 상태), 채점:
  - 정답 +100점, 정답자 중 선착순 1/2/3등 보너스 +30/+20/+10.
- 마지막 문제 공개 후 "다음 문제" → `finished` (최종 순위).
- 상태 머신: `idle → question ⇄ revealed → … → finished`. 리셋으로 idle 복귀.

## 화면

| 경로 | 용도 |
|------|------|
| `/quiz.html` | 참가자: 이름 입력 → 대기 → 보기 버튼 답변 → 공개 시 정답/점수 확인 |
| `/quiz-board.html` | 빔프로젝터: 현재 문제·보기·응답 수, 공개 시 정답 하이라이트 + 순위표 |
| `/quiz-admin.html` | 문제 등록(텍스트 포맷), 다음 문제/정답 공개/리셋 버튼, 진행 상태 |

허브(`/`)의 "퀴즈는 곧 열립니다" 자리를 실제 링크로 교체.

문제 입력 포맷(관리자 textarea): 빈 줄로 문제 블록 구분, 블록 첫 줄이 문제,
이후 줄이 보기(2~4개), 정답 보기는 맨 앞에 `*`.

## API (기존 서버에 추가)

- `POST /api/quiz/join` `{name}` → 참가자 뷰. 같은 이름 재입장 시 기존 참가자.
- `GET /api/quiz/me/:participantId` → 참가자 뷰 (새로고침 복원)
- `POST /api/quiz/answer` `{participantId, choiceIndex}`
- `GET /api/quiz/state`, `GET /api/quiz/events` (SSE, 빙고와 별도 채널)
- `POST /api/quiz/admin/questions` `{questions: [{text, choices, answerIndex}]}` — 등록 시 진행/참가자 초기화
- `POST /api/quiz/admin/next`, `POST /api/quiz/admin/reveal`, `POST /api/quiz/admin/reset`

공개 스냅샷은 `question` 상태에서 answerIndex를 절대 노출하지 않는다
(`revealed`/`finished`에서만 포함). 영속화는 빙고 `data.json`과 별도인
`quiz-data.json` (기존 파일 포맷 마이그레이션 회피).

## 데이터 모델 (`lib/quiz.js`)

```js
{
  questions: [{text, choices: string[2..4], answerIndex}],
  status: 'idle'|'question'|'revealed'|'finished',
  currentIndex: number,   // idle이면 -1
  participants: [{id, name, score, answers: {[qIndex]: {choiceIndex, order}}}]
}
```

에러 코드: QUESTIONS_INVALID, QUIZ_NOT_READY, WRONG_STATE, NAME_REQUIRED,
PARTICIPANT_NOT_FOUND, CHOICE_INVALID, ALREADY_ANSWERED.

## 비범위 (YAGNI)

- 답변 제한시간 타이머 (진행자가 공개 버튼으로 마감)
- 빙고와 참가자 계정 공유 (게임별 독립 입장)
