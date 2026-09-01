# 비밀미션 + 마니또 — 설계 스펙

날짜: 2026-09-01. 사용자 선택: 비밀미션 구현 + 마니또 게임 추가. 기존 아키텍처 동일.

## 게임 6: 비밀미션 (`lib/mission.js`)

워크숍 내내 백그라운드로 도는 메타게임.

- 관리자가 미션 풀 등록 (한 줄에 하나, 기본 팩 20개 프리셋 버튼). **풀은 전원 공개**,
  누가 어떤 미션을 가졌는지만 비밀 — 그래야 간파가 성립.
- 시작 시 참가자마다 풀에서 랜덤 배정 (셔플 후 순차 — 풀 ≥ 인원이면 중복 없음).
  진행 중 늦게 입장하면 즉시 배정.
- **성공 신고**: 본인이 폰에서 자진 신고 (+100, 양심 기반 — 공개 때 검증 토크).
  간파당한 미션은 신고 불가.
- **간파**: 다른 사람 + 풀의 미션을 골라 지목 → 서버 자동 판정.
  적중: 대상 미션 무효(foiled) + 간파자 +50. 오판: 간파자 -20. 이미 성공/간파된 대상 불가.
- 상태: `idle → running → revealed`. 공개 시 전체 배정·성공/간파 내역 현황판 표시.
- 리셋: 참가자/진행 초기화, 미션 풀 유지.
- 스냅샷: 미션 풀, 참가자 {name, score, done, foiled} — 배정 내용은 revealed 전 비공개.
- API: `/api/mission/{join, me/:id, state, events, report, accuse, admin/missions,
  admin/start, admin/reveal, admin/reset}`
- 에러: MISSIONS_INVALID(400), MISSION_INVALID(400), MISSION_NOT_READY(409),
  ALREADY_DONE(409), MISSION_FOILED(409), SELF_ACCUSE(400) + 공통.

## 게임 7: 마니또 (`lib/manito.js`)

- 참가자 모집(idle에서만 입장) → 시작 시 **한 줄 사이클**로 비밀 배정 (셔플 링, 자기 자신 X,
  3명 이상 필요).
- 각자 폰에 "몰래 챙길 사람: ○○" + 관리자가 쓴 안내문(선택) 표시.
- 진행 중 각자 "나를 챙긴 사람" 추측 제출 (공개 전까지 변경 가능).
- 공개: 현황판에 전체 사이클(A → B → C → … → A) + 추측 적중자(+100) 발표.
- 상태: `idle → running → revealed`. 리셋: 전부 초기화(안내문 유지).
- API: `/api/manito/{join, me/:id, state, events, guess, admin/note, admin/start,
  admin/reveal, admin/reset}`
- 에러: NOT_ENOUGH_ENTRIES(409, 3명 미만), CHOICE_INVALID(자기 자신 추측 등) + 공통.

## 화면

`/mission.html`(내 미션 + 성공 신고 + 간파), `/mission-board.html`, `/mission-admin.html`,
`/manito.html`, `/manito-board.html`, `/manito-admin.html`. 허브·콘솔·매뉴얼 연동.
영속화: `mission-data.json`, `manito-data.json`.
