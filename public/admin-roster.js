'use strict';
// 진행자 화면 공용: 참가자 실시간 로스터 렌더러.
// rows: [{ name, status?, statusClass?, score? }]  (호출부에서 정렬/매핑)
function renderRoster(container, rows, emptyText) {
  if (!container) return;
  if (!rows || rows.length === 0) {
    const p = document.createElement('div');
    p.className = 'roster-empty';
    p.textContent = emptyText || '아직 참가자가 없어요.';
    container.replaceChildren(p);
    return;
  }
  container.replaceChildren(...rows.map((r) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = r.name;
    const right = document.createElement('span');
    right.className = 'right';
    if (r.status) {
      const st = document.createElement('span');
      st.className = 'st ' + (r.statusClass || '');
      st.textContent = r.status;
      right.appendChild(st);
    }
    if (r.score != null) {
      const sc = document.createElement('span');
      sc.className = 'sc';
      sc.textContent = `${r.score}점`;
      right.appendChild(sc);
    }
    li.append(name, right);
    return li;
  }));
}
