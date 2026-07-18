// View de elenco (spec 6.4). Modal fullscreen no mobile, nunca troca skin.
// 3 abas: Elenco (atual), Resultados (jogos já disputados pelo time na
// temporada) e Calendário (jogos que faltam) — mesmos match-modal-tab-btn/
// -panel do modal de partida, e os jogos usam o mesmo card do restante do
// site (matchCardHtml/matchesByDayHtml), com data, rodada, local, placar e
// link de detalhes.
import { matchesByDayHtml, wireModalTabs } from './matches.js?v=20260718a';

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

function playerRowHtml(pid, p, playerStats) {
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
      <td>${playerStats?.yellow || 0}</td>
      <td>${playerStats?.red || 0}</td>
    </tr>
  `;
}

export function renderSquad({ contentEl }, teamSlug, teams, players, stats, fixtures, homeVenues, liga) {
  const team = teams[teamSlug];
  const teamStats = stats?.teams?.[teamSlug] || { goals: 0, conceded: 0, yellow: 0, red: 0 };
  // active === false = já saiu do clube (roster-sync não encontra mais o
  // jogador no roster atual do time) — fica fora do elenco exibido, mas os
  // gols/jogos que ele fez nesta temporada continuam contando em stats.json.
  // Sem o "!== false" excluiria por engano quem post-match.js ainda não
  // tocou (nunca sincronizado, active undefined).
  const roster = Object.entries(players || {}).filter(([, p]) => p.team === teamSlug && p.active !== false);

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
            <th>Nac.</th><th>Jogos</th><th>Gols</th><th>Amarelos</th><th>Vermelhos</th>
          </tr>
        </thead>
        <tbody>${byPosition.get(pos).map(([pid, p]) => playerRowHtml(pid, p, stats?.players?.[pid])).join('')}</tbody>
      </table>
    `).join('');

  // Resultados = jogos já disputados (finished/live), mais recente primeiro;
  // Calendário = jogos que faltam (scheduled), mais próximo primeiro — mesmo
  // agrupamento por dia e mesmo card usado em Home/Rodadas/Meses.
  const teamMatches = (fixtures?.matches || []).filter((m) => m.home === teamSlug || m.away === teamSlug);
  const played = teamMatches
    .filter((m) => m.status === 'finished' || m.status === 'live')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const remaining = teamMatches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const matchCtx = { teams, homeVenues, liga };
  const resultadosHtml = matchesByDayHtml(played, matchCtx) || '<p class="empty-state">Nenhum jogo disputado ainda.</p>';
  const calendarioHtml = matchesByDayHtml(remaining, matchCtx) || '<p class="empty-state">Nenhum jogo restante.</p>';

  contentEl.innerHTML = `
    <button class="squad-close-btn" id="squadCloseBtn" aria-label="Fechar">✕</button>
    <div class="squad-header">
      <img src="${team?.badge || ''}" alt="" />
      <h3>${team?.name || teamSlug}</h3>
    </div>
    <div class="match-modal-tabs">
      <button class="match-modal-tab-btn is-active" data-modal-tab="elenco">Elenco</button>
      <button class="match-modal-tab-btn" data-modal-tab="resultados">Resultados</button>
      <button class="match-modal-tab-btn" data-modal-tab="calendario">Calendário</button>
    </div>
    <div class="match-modal-tab-panel is-active" data-modal-tab-panel="elenco">
      <div class="squad-team-stats">
        <div><strong>${teamStats.goals}</strong><span>Gols pró</span></div>
        <div><strong>${teamStats.conceded}</strong><span>Gols sofridos</span></div>
        <div><strong>${teamStats.yellow}</strong><span>Cartões amarelos</span></div>
        <div><strong>${teamStats.red}</strong><span>Cartões vermelhos</span></div>
      </div>
      ${sections || '<p class="empty-state">Elenco ainda não disponível.</p>'}
    </div>
    <div class="match-modal-tab-panel" data-modal-tab-panel="resultados">${resultadosHtml}</div>
    <div class="match-modal-tab-panel" data-modal-tab-panel="calendario">${calendarioHtml}</div>
  `;

  wireModalTabs(contentEl);
}

export function initSquadModal({ modalEl, backdropEl, contentEl }, getData) {
  function open(teamSlug) {
    const { teams, players, stats, fixtures, homeVenues, liga } = getData();
    if (!teams[teamSlug]) return;
    renderSquad({ contentEl }, teamSlug, teams, players, stats, fixtures, homeVenues, liga);
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
