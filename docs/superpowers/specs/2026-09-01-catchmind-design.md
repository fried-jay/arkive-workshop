# 캐치마인드 (드로잉 퀴즈) — 설계 스펙

날짜: 2026-09-01. 사용자 확정안: 진행자가 콘솔에서 참가자 한 명에게 그리기 링크를
보내고, 그 사람이 그림+정답을 제출하면 나머지가 맞추는 방식. 실시간 중계 없음.

## 규칙

- 참가자는 `/catchmind.html` 에서 이름으로 입장.
- 진행자가 관리자에서 참가자 한 명 선택 → **그리기 링크 발급** (`/catchmind-draw.html?key=…`,
  1회용 랜덤 토큰) → 슬랙 등으로 본인에게 전달. 링크 재발급 시 이전 링크 무효.
- 링크를 연 사람: **정답 단어 입력 + 캔버스에 그림 → 제출**. 제출 전까지 아무에게도 안 보임.
- 제출되면 `guessing`: 그림이 현황판·참가자 화면에 공개, 나머지가 텍스트로 정답 시도(무제한).
  판정은 공백 제거+소문자 비교. 오답은 피드(최근 8개)에 공개.
  - 정답 → 맞힌 사람 +100, 그린 사람 +50, `revealed` (정답 단어·주인공 발표).
- 아무도 못 맞히면 관리자 **정답 공개**(스킵, 점수 없음).
- 다음 라운드 = 링크 새로 발급. 상태: `idle → waiting(그리는 중) → guessing ⇄` ← 발급은
  guessing 중만 불가. 리셋: 참가자/점수/진행 초기화.

## 비밀 유지

- 정답 단어는 `revealed` 전 스냅샷에 미포함. 그리기 토큰(drawKey)도 스냅샷 미포함 —
  발급 응답으로 관리자에게만 전달.
- 그림(strokes)은 스냅샷에 넣지 않고 `GET /api/catchmind/strokes` 로 1회 조회
  (guessing 진입 시 클라이언트가 가져옴). 좌표는 0..1 정규화.

## API

`/api/catchmind/…`: `join`, `me/:id`, `state`, `events`(SSE), `strokes`,
`guess` {participantId, text}, `draw/:key`(GET, 그리는 사람 확인),
`draw/submit` {key, strokes, word}, `admin/assign` {participantId} → {key},
`admin/reveal`, `admin/reset`

에러: NAME_REQUIRED·GUESS_REQUIRED·WORD_REQUIRED·STROKE_INVALID(400),
WRONG_STATE(409), OWN_DRAW(403), DRAW_KEY_INVALID(404), PARTICIPANT_NOT_FOUND(404)

## 화면

`/catchmind.html`(입장→대기/맞추기), `/catchmind-draw.html?key=…`(캔버스: 4색 펜·전체
지우기·정답 입력·제출), `/catchmind-board.html`(그림 크게 + 오답 피드 + 순위),
`/catchmind-admin.html`(참가자 선택→링크 발급·복사, 정답 공개, 리셋).
호스트 콘솔·허브·매뉴얼 연동. 영속화 `catchmind-data.json`.
