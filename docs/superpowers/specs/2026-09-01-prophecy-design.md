# 몰래 예언 게임 — 설계 스펙

날짜: 2026-09-01. 사용자 선택("1번 예언게임 ㄱㄱ"). 기존 아키텍처 동일.

## 규칙

- 워크숍 시작 때 각자 **오늘 일어날 일 예언 1개**를 몰래 제출 (재제출 = 수정).
- 진행자가 **봉인**하면 제출/수정 마감 — 나중에 제출해서 이미 일어난 일을 적는 반칙 방지.
  봉인은 2명 이상 제출 시 가능.
- 하루 동안 봉인 상태 유지 (아무도 서로의 예언을 못 봄 — 스냅샷에 이름만).
- 마무리에 **대공개**: 전체 예언이 이름과 함께 공개되고, 진행자가 하나씩 읽으며
  다 같이 판정 → 관리자에서 예언별 **적중 ⭕ / 실패 ❌** 마킹 (번복 가능, 적중 +100).
- 적중을 위해 몰래 상황을 유도하는 플레이(자기실현 예언)는 허용 — 비밀미션과 시너지.
- 상태: `collecting → sealed → revealed`. 리셋: 전부 초기화.

## API

`/api/prophecy/…`: `submit` {name, text}(입장 겸용), `me/:id`, `state`, `events`(SSE),
`admin/seal`, `admin/reveal`, `admin/mark` {name, hit}, `admin/reset`

에러: PROPHECY_REQUIRED(400), NOT_ENOUGH_ENTRIES(409) + 공통
(NAME_REQUIRED, WRONG_STATE, PARTICIPANT_NOT_FOUND).

## 화면

`/prophecy.html`(제출 → 봉인 대기 → 내 결과), `/prophecy-board.html`(제출 현황 →
봉인 연출 → 공개 리스트+점수), `/prophecy-admin.html`(봉인/공개/리셋 + 예언별 판정 버튼).
허브·콘솔·매뉴얼 연동. 영속화 `prophecy-data.json`.
