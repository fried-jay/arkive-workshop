# 밸런스 게임 + TMI 주인 찾기 — 설계 스펙

날짜: 2026-09-01
상태: 사용자 승인 ("1,2 ㄱㄱ")

빙고·퀴즈와 동일 아키텍처(Express + SSE + 바닐라 JS, `lib/` 순수 로직 + node:test).
각 게임은 독립 상태 파일(`balance-data.json`, `tmi-data.json`)과 독립 SSE 채널.

## 게임 3: 밸런스 게임 (`lib/balance.js`)

- 라운드 = A vs B 양자택일 (`{a, b}` 목록을 관리자가 등록).
- 상태 머신: `idle → voting ⇄ revealed → finished` (퀴즈와 동일한 진행자 컨트롤).
- 참가자는 라운드당 1회 투표(0=A, 1=B). **투표 중엔 분포를 노출하지 않는다** (밴드왜건 방지).
- 공개 시: 양쪽 득표 수 공개, **다수파에 +10점** (동률이면 투표자 전원 +10). 리더보드 누적.
- 화면: `/balance.html`(참가자), `/balance-board.html`(현황판: VS 카드 + 분포 바 + 순위),
  `/balance-admin.html`(라운드 등록 — 한 줄에 `A vs B`, 다음/공개/리셋).
- API: `/api/balance/{join, me/:id, vote, state, events, admin/rounds, admin/next, admin/reveal, admin/reset}`
- 에러: ROUNDS_INVALID, BALANCE_NOT_READY, WRONG_STATE, NAME_REQUIRED,
  PARTICIPANT_NOT_FOUND, CHOICE_INVALID, ALREADY_VOTED.

## 게임 4: TMI 주인 찾기 (`lib/tmi.js`)

- 2단계: **수집**(워크숍 전) + **출제**(현장).
- 수집(`collecting`): `/tmi.html`에서 이름 + TMI 한 줄 제출. 같은 이름 재제출 시 자기 TMI 수정.
  제출자 = 참가자 (별도 join 없음). 수집 화면에는 제출자 이름만 보이고 TMI 내용은 절대 미노출.
- 시작(관리자): 제출 4건 이상 필요(NOT_ENOUGH_ENTRIES). 엔트리를 셔플해 라운드 생성 —
  라운드마다 보기 = 주인 포함 랜덤 4명(전체가 4명 미만이면 전원) 이름 셔플.
- 진행: `collecting → question ⇄ revealed → finished`. 문제 = TMI 본문, 보기 = 이름 4개.
  **본인 TMI 라운드에는 답변 불가(OWN_QUESTION)**, 채점 대상에서도 제외.
- 채점: 정답 100점 + 선착순 정답 1/2/3등 보너스 30/20/10 (퀴즈와 동일).
- 리셋 2종: 진행 리셋(점수/진행만 초기화, 제출물 유지 → 재플레이), 전체 초기화(수집부터 다시).
- 스냅샷: question 상태에서 주인(answerIndex) 미노출, revealed에서 주인·보기별 응답 수 공개.
- 화면: `/tmi.html`(수집 폼 ↔ 답변 UI 자동 전환), `/tmi-board.html`, `/tmi-admin.html`.
- API: `/api/tmi/{submit, me/:id, answer, state, events, admin/start, admin/next, admin/reveal, admin/reset, admin/clear}`
- 에러: NAME_REQUIRED, TMI_REQUIRED, WRONG_STATE, NOT_ENOUGH_ENTRIES,
  PARTICIPANT_NOT_FOUND, CHOICE_INVALID, ALREADY_ANSWERED, OWN_QUESTION.

## 공통

- `server.js`가 4개 게임을 서빙하며 SSE 채널 생성 로직은 헬퍼로 공통화.
- 허브(`/`)에 밸런스·TMI 참가/현황판 링크 추가.

## 비범위 (YAGNI)

- 밸런스 소수파 탈락제(점수제로 대체), TMI 익명 모드, 제한시간 타이머.
