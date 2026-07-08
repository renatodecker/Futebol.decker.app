// View de elenco (spec 6.4). Modal fullscreen no mobile, nunca troca skin.

const POSITION_ORDER = ['G', 'D', 'M', 'A'];
const POSITION_LABEL = { G: 'Goleiros', D: 'Defensores', M: 'Meio-campistas', A: 'Atacantes' };

function ageFromBirthdate(dateStr) {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = (now.getUTCMonth() < birth.getUTCMonth())
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function playerRowHtml(pid, p) {
  const age = ageFromBirthdate(p.birthdate);
  return `
    <tr>
      <td>${p.jersey ?? '—'}</td>
      <td>${p.shirtName || p.fullName}</td>
      <td>${p.fullName}</td>
      <td>${age ?? '—'}</td>
      <td>${p.nationality || '—'}</td>
      <td>${p.apps || 0}</td>
      <td>${p.goals || 0}</td>
      <td>${p.debut || '—'}</td>
    </tr>
  `;
}

export function renderSquad({ contentEl }, teamSlug, teams, players, stats) {
  const team = teams[teamSlug];
  const teamStats = stats?.teams?.[teamSlug] || { goals: 0, conceded: 0, yellow: 0, red: 0 };
  const roster = Object.entries(players || {}).filter(([, p]) => p.team === teamSlug);

  const byPosition = new Map(POSITION_ORDER.map((p) => [p, []]));
  for (const [pid, p] of roster) {
    const group = byPosition.has(p.position) ? p.position : 'M';
    byPosition.get(group).push([pid, p]);
  }
  for (const list of byPosition.values()) {
    list.sort((a, b) => (a[1].jersey ?? 99) - (b[1].jersey ?? 99));
  }

  const sections = POSITION_ORDER
    .filter((pos) => byPosition.get(pos).length > 0)
    .map((pos) => `
      <h4 class="squad-position-label">${POSITION_LABEL[pos]}</h4>
      <table class="squad-table">
        <thead>
          <tr>
            <th>Nº</th><th>Camisa</th><th>Nome completo</th><th>Idade</th>
            <th>Nac.</th><th>Jogos</th><th>Gols</th><th>Estreia</th>
          </tr>
        </thead>
        <tbody>${byPosition.get(pos).map(([pid, p]) => playerRowHtml(pid, p)).join('')}</tbody>
      </table>
    `).join('');

  contentEl.innerHTML = `
    <button class="squad-close-btn" id="squadCloseBtn" aria-label="Fechar">✕</button>
    <div class="squad-header">
      <img src="${team?.badge || ''}" alt="" />
      <h3>${team?.name || teamSlug}</h3>
    </div>
    <div class="squad-team-stats">
      <div><strong>${teamStats.goals}</strong><span>Gols pró</span></div>
      <div><strong>${teamStats.conceded}</strong><span>Gols sofridos</span></div>
      <div><strong>${teamStats.yellow}</strong><span>Cartões amarelos</span></div>
      <div><strong>${teamStats.red}</strong><span>Cartões vermelhos</span></div>
    </div>
    ${sections || '<p class="empty-state">Elenco ainda não disponível.</p>'}
  `;
}

export function initSquadModal({ modalEl, backdropEl, contentEl }, getData) {
  function open(teamSlug) {
    const { teams, players, stats } = getData();
    if (!teams[teamSlug]) return;
    renderSquad({ contentEl }, teamSlug, teams, players, stats);
    modalEl.hidden = false;
    contentEl.querySelector('#squadCloseBtn')?.addEventListener('click', close);
  }
  function close() {
    modalEl.hidden = true;
  }
  backdropEl.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) close();
  });

  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-squad]');
    if (!trigger) return;
    e.stopPropagation();
    open(trigger.dataset.openSquad);
  });

  return { open, close };
}
