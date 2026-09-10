'use strict';
// 등록된 참가자 목록에서 본인 이름을 선택해 입장. onPick(name) 호출.
function setupRosterJoin({ stateUrl, listEl, filterEl, emptyText, onPick }) {
  let names = [];
  function extract(snap) {
    const raw = (snap.participants && snap.participants.map((p) => p.name)) || snap.members || snap.names || [];
    return [...new Set(raw)].sort((a, b) => a.localeCompare(b, 'ko'));
  }
  function render(filter = '') {
    if (names.length === 0) {
      listEl.innerHTML = '<p class="muted">' + (emptyText || '아직 등록된 참가자가 없어요. 진행자가 명단을 준비하면 여기서 고를 수 있어요.') + '</p>';
      return;
    }
    const f = filter.trim().toLowerCase();
    const shown = names.filter((n) => !f || n.toLowerCase().includes(f));
    listEl.replaceChildren(...shown.map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'name-btn';
      b.textContent = n;
      b.addEventListener('click', () => onPick(n));
      return b;
    }));
  }
  async function load() {
    try { names = extract(await (await fetch(stateUrl)).json()); } catch { names = []; }
    render(filterEl ? filterEl.value : '');
  }
  if (filterEl) filterEl.addEventListener('input', () => render(filterEl.value));
  load();
  return { reload: load };
}
