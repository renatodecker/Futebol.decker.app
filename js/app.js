// Query string de cache-busting (?v=...) tem que bater exatamente com a das
// tags <script> em index.html — senão o módulo acaba carregado duas vezes
// sob URLs diferentes (uma vez pela tag, outra por este import), cada uma
// com sua própria instância/cache.
import * as Theme from './theme.js?v=20260712a';
import { renderStandings } from './standings.js?v=20260712a';
import { initSquadModal } from './squad.js?v=20260712a';
import { initLive } from './live.js?v=20260712a';
import { initMatchModal } from './modal.js?v=20260712a';

const state = {
  leagues: null,
  liga: null,
  teams: null,
  fixtures: null,
  standings: null,
  meta: null,
  players: {},
  stats: { players: {}, teams: {} },
  team: null, // slug do time selecionado (skin), ou null
  homeVenues: {}, // slug do mandante -> estádio mais frequente na temporada (fallback de venue)
};

const qs = new URLSearchParams(location.search);

// ---------------------------------------------------------------------
// Debug de livetiming via URL (não afeta produção — só ativa com os
// parâmetros presentes):
//   ?debugNow=2026-07-12T21:30:00Z  -> finge que "agora" é esse instante pra
//     decidir se está dentro da janela ao vivo (meta.liveWindows) — útil pra
//     testar a borda do gate (antes/depois do kickoff) sem esperar o horário
//     real. Só funciona se a janela daquele dia já existir em meta.json.
//   ?debugForceLive=r19-fla-pal  -> força essa partida (por id) como 'live'
//     na hora, direto em memória — não depende de horário nem de dado real
//     da ESPN, serve pra testar o visual (badge, barra "Ao vivo", parcial da
//     classificação, auto-refresh do modal) sem precisar de jogo real rolando.
//   ?debugClock=78'  -> texto do cronômetro usado junto com debugForceLive
//     (default "45'").
// Nunca grava nada — tudo em memória, some com F5 sem os parâmetros.
function debugNowMs() {
  const raw = qs.get('debugNow');
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function debugForceLiveId() {
  return qs.get('debugForceLive');
}

function applyDebugForceLive() {
  const matchId = debugForceLiveId();
  if (!matchId || !state.fixtures) return;
  const m = state.fixtures.matches.find((x) => x.id === matchId);
  if (!m) {
    console.warn(`debugForceLive: partida "${matchId}" não encontrada em fixtures.matches.`);
    return;
  }
  m.status = 'live';
  m.liveClock = qs.get('debugClock') || "45'";
  if (!m.score) m.score = { home: 0, away: 0 };
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false }).format(d),
    full: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d),
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);
  return res.json();
}

// players.json/stats.json só existem depois que post-match.js/roster-sync.js
// rodarem pela primeira vez (Fase 3) — degrada graciosamente até lá.
async function fetchJsonOptional(url, fallback) {
  try {
    return await fetchJson(url);
  } catch (_) {
    return fallback;
  }
}

function updateQuery(params) {
  const next = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) next.delete(k);
    else next.set(k, v);
  }
  history.replaceState(null, '', `${location.pathname}?${next.toString()}`);
}

// ---------------------------------------------------------------------
// Seletor de liga
// ---------------------------------------------------------------------

// Seletor de liga é um modal (mesmo padrão visual do elenco/partida) em vez
// de um dropdown embutido no header: com o botão no canto direito e a lista
// de ligas ocupando a largura inteira abaixo, o dropdown ficava visualmente
// desconectado de onde o usuário clicou — um modal centralizado (ou bottom
// sheet no mobile) sempre aparece ancorado corretamente, em qualquer largura.
function renderLeaguePicker() {
  const list = document.getElementById('leagueModalList');
  const entries = Object.entries(state.leagues).filter(([, cfg]) => cfg.status !== 'hidden');
  list.innerHTML = entries.map(([slug, cfg]) => {
    const disabled = cfg.status !== 'active';
    const isCurrent = slug === state.liga;
    return `
      <button class="league-modal-option ${isCurrent ? 'is-active' : ''}" data-liga="${slug}" ${disabled ? 'disabled' : ''}>
        ${cfg.logo ? `<img src="${cfg.logo}" alt="" />` : '<span class="league-modal-option-noimg"></span>'}
        <span class="league-modal-option-name">${cfg.shortName || cfg.name}</span>
        ${disabled ? '<span class="soon-badge">em breve</span>' : isCurrent ? '<span class="league-modal-check">✓</span>' : ''}
      </button>
    `;
  }).join('');

  list.querySelectorAll('.league-modal-option:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeLeagueModal();
      if (btn.dataset.liga !== state.liga) {
        loadLiga(btn.dataset.liga, { resetTeam: true });
      }
    });
  });
}

function openLeagueModal() {
  document.getElementById('leagueModal').hidden = false;
}

function closeLeagueModal() {
  document.getElementById('leagueModal').hidden = true;
}

// Presa uma única vez (chamado só em main()).
function wireLeagueModal() {
  document.getElementById('leaguePickerToggle').addEventListener('click', openLeagueModal);
  document.getElementById('leagueModalCloseBtn').addEventListener('click', closeLeagueModal);
  document.getElementById('leagueModalBackdrop').addEventListener('click', closeLeagueModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('leagueModal').hidden) closeLeagueModal();
  });
}

function updateHeaderForLiga(cfg) {
  document.getElementById('currentLeagueName').textContent = cfg.shortName || cfg.name;
  const logo = document.getElementById('currentLeagueLogo');
  if (cfg.logo) {
    logo.src = cfg.logo;
    logo.hidden = false;
  } else {
    logo.hidden = true;
  }
}

// ---------------------------------------------------------------------
// Home: frame de skin + últimos resultados + próximos jogos
// ---------------------------------------------------------------------

function orderedTeamEntries() {
  const entries = Object.entries(state.teams)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'));
  const pinnedIndex = entries.findIndex(([slug]) => slug === 'gre');
  if (pinnedIndex > 0) {
    const [pinned] = entries.splice(pinnedIndex, 1);
    entries.unshift(pinned);
  }
  return entries;
}

function renderTeamFrame() {
  const frame = document.getElementById('teamFrame');
  frame.innerHTML = orderedTeamEntries().map(([slug, team]) => `
    <button class="team-frame-item ${slug === state.team ? 'is-active' : ''}" data-team="${slug}" title="${team.name}">
      <img src="${team.badge}" alt="${team.name}" loading="lazy" />
    </button>
  `).join('');

  frame.querySelectorAll('.team-frame-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.team;
      selectTeamSkin(state.team === slug ? null : slug);
    });
  });
}

function selectTeamSkin(slug) {
  state.team = slug;
  updateQuery({ time: slug });
  if (slug) {
    Theme.applyTeamSkin(state.teams[slug].skin);
  } else {
    Theme.applyLeagueTheme(state.leagues[state.liga].identity);
  }
  document.getElementById('skinResetBtn').hidden = !slug;
  renderTeamFrame();
}

// ---------------------------------------------------------------------
// Home: destaques do campeonato (logo, artilheiros, líderes, curiosidades)
// ---------------------------------------------------------------------

function renderLeagueHero() {
  const cfg = state.leagues[state.liga];
  // season pode não existir ainda em leagues.json pra ligas recém-ativadas
  // (bra-a é a única com o campo hoje) — cai pro season de fixtures.json, e
  // some a linha de temporada de vez se nenhum dos dois tiver o dado, em vez
  // de imprimir "Temporada undefined".
  const season = cfg.season ?? state.fixtures?.season ?? null;
  document.getElementById('leagueHero').innerHTML = `
    ${cfg.logo ? `<img src="${cfg.logo}" alt="${cfg.name}" class="league-hero-logo" />` : ''}
    <div class="league-hero-text">
      <h1>${cfg.name}</h1>
      ${season ? `<span>Temporada ${season}</span>` : ''}
    </div>
  `;
}

function topScorers(n) {
  return Object.entries(state.stats.players || {})
    .map(([pid, s]) => {
      const identity = state.players[pid];
      if (!identity) return null;
      return { pid, ...s, identity };
    })
    .filter((r) => r && r.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, n);
}

function topStandings(n) {
  return [...(state.standings.table || [])].sort((a, b) => a.pos - b.pos).slice(0, n);
}

function biggestWin() {
  return state.fixtures.matches
    .filter((m) => m.status === 'finished' && m.score)
    .reduce((best, m) => {
      const diff = Math.abs(m.score.home - m.score.away);
      return (!best || diff > best.diff) ? { ...m, diff } : best;
    }, null);
}

function biggestAttendance() {
  return state.fixtures.matches
    .filter((m) => typeof m.attendance === 'number' && m.attendance > 0)
    .reduce((best, m) => (!best || m.attendance > best.attendance ? m : best), null);
}

function highlightListHtml(items) {
  return `<ol class="highlight-list">${items.map(({ team, name, value }) => `
    <li data-open-squad="${team}">
      <img src="${state.teams[team]?.badge || ''}" alt="" loading="lazy" />
      <span class="highlight-name">${name}</span>
      <strong>${value}</strong>
    </li>
  `).join('')}</ol>`;
}

function renderHighlights() {
  const scorers = topScorers(5);
  const leaders = topStandings(5);
  const win = biggestWin();
  const attendanceRecord = biggestAttendance();

  const scorersHtml = scorers.length ? `
    <div class="highlight-card">
      <h3>Artilheiros</h3>
      ${highlightListHtml(scorers.map((r) => ({
        team: r.identity.team,
        name: r.identity.shirtName || r.identity.fullName,
        value: r.goals,
      })))}
    </div>
  ` : '';

  const leadersHtml = leaders.length ? `
    <div class="highlight-card">
      <h3>Líderes</h3>
      ${highlightListHtml(leaders.map((r) => ({
        team: r.team,
        name: state.teams[r.team]?.name || r.team,
        value: `${r.pts} pts`,
      })))}
    </div>
  ` : '';

  const facts = [];
  if (win) {
    const home = state.teams[win.home];
    const away = state.teams[win.away];
    facts.push(`Maior goleada: <strong>${home?.abbrev || win.home} ${win.score.home} x ${win.score.away} ${away?.abbrev || win.away}</strong> (Rodada ${win.round})`);
  }
  if (attendanceRecord) {
    const home = state.teams[attendanceRecord.home];
    const away = state.teams[attendanceRecord.away];
    facts.push(`Maior público: <strong>${fmtAttendance(attendanceRecord.attendance)}</strong> em ${home?.abbrev || attendanceRecord.home} x ${away?.abbrev || attendanceRecord.away}${attendanceRecord.venue ? ` (${attendanceRecord.venue})` : ''}`);
  }
  const curiosidadesHtml = facts.length ? `
    <div class="highlight-card">
      <h3>Curiosidades</h3>
      <ul class="highlight-facts">${facts.map((f) => `<li>${f}</li>`).join('')}</ul>
    </div>
  ` : '';

  document.getElementById('highlightsGrid').innerHTML = scorersHtml + leadersHtml + curiosidadesHtml
    || '<p class="empty-state">Destaques em breve.</p>';
}

function fmtAttendance(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// fixtures só ganham venue confirmado perto da rodada (via ESPN). Até lá,
// usamos o estádio mais frequente do mandante nas partidas já disputadas na
// temporada como palpite ("provável"), pra nenhum card de jogo agendado
// ficar sem local nenhum.
function computeHomeVenues(fixtures) {
  const counts = {};
  for (const m of fixtures.matches) {
    if (!m.venue) continue;
    counts[m.home] = counts[m.home] || {};
    counts[m.home][m.venue] = (counts[m.home][m.venue] || 0) + 1;
  }
  const map = {};
  for (const [team, venues] of Object.entries(counts)) {
    map[team] = Object.entries(venues).sort((a, b) => b[1] - a[1])[0][0];
  }
  return map;
}

function matchVenue(m) {
  if (m.venue) return { venue: m.venue, isProbable: false };
  const probable = state.homeVenues?.[m.home];
  return probable ? { venue: probable, isProbable: true } : { venue: null, isProbable: false };
}

function venueLineHtml(m) {
  const { venue, isProbable } = matchVenue(m);
  if (!venue) return '<span></span>';
  const attendance = typeof m.attendance === 'number' && m.attendance > 0
    ? ` · público: ${fmtAttendance(m.attendance)}`
    : '';
  const suffix = isProbable ? ' (provável)' : '';
  return `<span class="venue${isProbable ? ' is-probable' : ''}">🏟️ ${venue}${suffix}${attendance}</span>`;
}

// Regra geral: todo card de jogo (Home, Rodadas, Meses) sempre mostra rodada,
// data, horário e local — sem depender de qual aba está renderizando, pra não
// ter card "incompleto" em lugar nenhum.
function matchCardHtml(m) {
  const home = state.teams[m.home];
  const away = state.teams[m.away];
  const { date, time } = fmtDateTime(m.date);
  const isLive = m.status === 'live';
  const liveBadge = '<span class="live-badge"></span>';
  const scoreHtml = m.status === 'finished' || isLive
    ? `<span class="score">${isLive ? liveBadge : ''}${m.score?.home ?? 0} x ${m.score?.away ?? 0}</span><span class="score-date">${date} · ${time}</span>`
    : `<span class="datetime">${date}<br>${time}</span>`;

  return `
    <div class="match-card is-clickable ${isLive ? 'is-live' : ''}" data-match="${m.id}">
      <span class="round-label">Rodada ${m.round}</span>
      <div class="team home" data-open-squad="${m.home}">
        <img src="${home?.badge || ''}" alt="" />
        <span class="team-name">${home?.abbrev || m.home}</span>
      </div>
      <div class="center">${scoreHtml}</div>
      <div class="team away" data-open-squad="${m.away}">
        <span class="team-name">${away?.abbrev || m.away}</span>
        <img src="${away?.badge || ''}" alt="" />
      </div>
      <div class="match-card-footer">
        ${venueLineHtml(m)}
        <span class="match-card-link">Ver detalhes ›</span>
      </div>
    </div>
  `;
}

function renderHomeLists() {
  const finished = state.fixtures.matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  const upcoming = state.fixtures.matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10);

  document.getElementById('recentResults').innerHTML = finished.map(matchCardHtml).join('')
    || '<p class="empty-state">Nenhum resultado ainda.</p>';
  document.getElementById('upcomingFixtures').innerHTML = upcoming.map(matchCardHtml).join('')
    || '<p class="empty-state">Nenhum jogo agendado.</p>';
}

// Seção "Ao vivo" na Home, acima de "Últimos resultados" — só aparece
// enquanto há jogo com status 'live' (nunca persistido, só existe em memória
// via live.js ou via ?debugForceLive). Reconstrói do zero a cada chamada
// (chamado no load inicial e a cada tick de onLiveUpdate), diferente do
// patchLiveMatchCards, que só atualiza placar de cards já existentes — aqui
// o próprio conjunto de jogos pode entrar/sair a qualquer momento.
function renderLiveMatches() {
  const section = document.getElementById('liveMatchesSection');
  const live = state.fixtures.matches
    .filter((m) => m.status === 'live')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  section.hidden = live.length === 0;
  if (live.length > 0) {
    document.getElementById('liveMatches').innerHTML = live.map(matchCardHtml).join('');
  }
}

// ---------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------

function isWithinLiveWindow() {
  if (debugForceLiveId()) return true; // debug: partida forçada não depende da janela real
  const windows = state.meta?.liveWindows || [];
  const now = debugNowMs() ?? Date.now();
  return windows.some((w) => now >= new Date(w.start).getTime() && now <= new Date(w.end).getTime());
}

function zoneForPosition(pos, zoneBands) {
  const band = (zoneBands || []).find((z) => pos >= z.from && pos <= z.to);
  return band ? band.id : null;
}

// Recalcula a tabela a partir de fixtures.matches (finished + live), pra
// mostrar uma classificação "parcial" enquanto há jogos em andamento. Forma
// continua vindo do standings.json oficial (não muda intra-jogo), mas a zona
// é recalculada pela posição ao vivo — senão um time que sobe/desce de zona
// durante os jogos ainda apareceria pintado com a zona antiga.
function computeLiveStandings() {
  const acc = {};
  for (const slug of Object.keys(state.teams)) {
    acc[slug] = { team: slug, pts: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
  }
  for (const m of state.fixtures.matches) {
    if ((m.status !== 'finished' && m.status !== 'live') || !m.score) continue;
    const h = acc[m.home];
    const a = acc[m.away];
    if (!h || !a) continue;
    h.played += 1; a.played += 1;
    h.gf += m.score.home; h.ga += m.score.away;
    a.gf += m.score.away; a.ga += m.score.home;
    if (m.score.home > m.score.away) { h.won += 1; h.pts += 3; a.lost += 1; }
    else if (m.score.home < m.score.away) { a.won += 1; a.pts += 3; h.lost += 1; }
    else { h.drawn += 1; a.drawn += 1; h.pts += 1; a.pts += 1; }
  }

  const tiebreakers = state.leagues[state.liga].rules?.liveTiebreakers || ['pts', 'won', 'gd', 'gf'];
  const rows = Object.values(acc).map((r) => ({ ...r, gd: r.gf - r.ga }));
  rows.sort((x, y) => {
    for (const key of tiebreakers) {
      if (y[key] !== x[key]) return y[key] - x[key];
    }
    return 0;
  });

  const zoneBands = state.leagues[state.liga].rules?.zoneBands || [];
  const officialByTeam = new Map((state.standings.table || []).map((r) => [r.team, r]));
  rows.forEach((r, i) => {
    r.pos = i + 1;
    const off = officialByTeam.get(r.team);
    r.posDelta = off ? off.pos - r.pos : 0; // positivo = subiu
    r.zone = zoneForPosition(r.pos, zoneBands);
    r.form = off?.form ?? [];
  });

  return { table: rows, zones: state.standings.zones || [] };
}

function renderClassificacao() {
  const live = isWithinLiveWindow();
  const data = live ? computeLiveStandings() : state.standings;
  renderStandings({
    bodyEl: document.getElementById('standingsBody'),
    legendEl: document.getElementById('zonesLegend'),
    badgeEl: document.getElementById('standingsBadge'),
  }, data, state.teams, { partial: live });
}

// ---------------------------------------------------------------------
// Estatísticas
// ---------------------------------------------------------------------

const statsSortState = { key: 'goals', dir: 'desc' };

function playerStatsRows(teamFilter) {
  return Object.entries(state.stats.players || {})
    .map(([pid, s]) => {
      const identity = state.players[pid];
      if (!identity) return null;
      if (teamFilter && identity.team !== teamFilter) return null;
      return { pid, ...s, identity };
    })
    .filter(Boolean);
}

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]));
}

function statsRowHtml(row) {
  const team = state.teams[row.identity.team];
  return `
    <tr>
      <td class="col-team" data-open-squad="${row.identity.team}">
        <img src="${team?.badge || ''}" alt="" loading="lazy" />
        <span>${row.identity.shirtName || row.identity.fullName}</span>
      </td>
      <td>${row.goals}</td>
      <td>${row.assists}</td>
      <td>${row.yellow}</td>
      <td>${row.red}</td>
    </tr>
  `;
}

function renderStatsFullTable(teamFilter) {
  const rows = sortRows(playerStatsRows(teamFilter), statsSortState.key, statsSortState.dir);
  document.getElementById('statsBody').innerHTML = rows.map(statsRowHtml).join('')
    || '<tr><td colspan="5" class="empty-state">Sem estatísticas ainda.</td></tr>';

  document.querySelectorAll('#statsTable th[data-sort]').forEach((th) => {
    th.classList.toggle('is-active', th.dataset.sort === statsSortState.key);
  });
}

function renderStatsTop20() {
  const categories = [
    ['goals', 'Gols'],
    ['assists', 'Assistências'],
    ['yellow', 'Cartões amarelos'],
    ['red', 'Cartões vermelhos'],
  ];
  const allRows = playerStatsRows(null);
  const html = categories.map(([key, label]) => {
    const top = sortRows(allRows, key, 'desc').slice(0, 20);
    return `
      <div class="top20-group">
        <h4>${label}</h4>
        <div class="table-scroll">
          <table class="stats-table">
            <tbody>${top.map((row) => `
              <tr>
                <td class="col-team" data-open-squad="${row.identity.team}">
                  <img src="${state.teams[row.identity.team]?.badge || ''}" alt="" loading="lazy" />
                  <span>${row.identity.shirtName || row.identity.fullName}</span>
                </td>
                <td>${row[key]}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('statsTop20View').innerHTML = html;
}

function renderTeamStatsBlock(teamFilter) {
  const block = document.getElementById('statsTeamBlock');
  if (!teamFilter) {
    block.hidden = true;
    return;
  }
  const s = state.stats.teams[teamFilter] || { goals: 0, conceded: 0, yellow: 0, red: 0 };
  block.hidden = false;
  block.innerHTML = `
    <div><strong>${s.goals}</strong><span>Gols pró</span></div>
    <div><strong>${s.conceded}</strong><span>Gols sofridos</span></div>
    <div><strong>${s.yellow}</strong><span>Cartões amarelos</span></div>
    <div><strong>${s.red}</strong><span>Cartões vermelhos</span></div>
  `;
}

function renderEstatisticas() {
  const teamFilter = document.getElementById('statsTeamFilter').value || null;
  renderTeamStatsBlock(teamFilter);
  renderStatsFullTable(teamFilter);
  renderStatsTop20();
}

function refreshStatsTeamOptions() {
  const teamSelect = document.getElementById('statsTeamFilter');
  const previous = teamSelect.value;
  teamSelect.innerHTML = '<option value="">Todos os times</option>'
    + orderedTeamEntries().map(([slug, team]) => `<option value="${slug}">${team.name}</option>`).join('');
  if (state.teams[previous]) teamSelect.value = previous;
}

// Listeners são presos uma única vez (chamado em main()); troca de liga só
// atualiza as opções do select e re-renderiza os dados via renderEstatisticas.
function wireEstatisticas() {
  const teamSelect = document.getElementById('statsTeamFilter');
  teamSelect.addEventListener('change', renderEstatisticas);

  document.querySelectorAll('#statsTable th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      statsSortState.dir = statsSortState.key === key && statsSortState.dir === 'desc' ? 'asc' : 'desc';
      statsSortState.key = key;
      renderStatsFullTable(teamSelect.value || null);
    });
  });

  const top20Toggle = document.getElementById('statsTop20Toggle');
  top20Toggle.addEventListener('click', () => {
    const showingTop20 = top20Toggle.classList.toggle('is-active');
    document.getElementById('statsFullView').hidden = showingTop20;
    document.getElementById('statsTop20View').hidden = !showingTop20;
  });
}

// ---------------------------------------------------------------------
// Rodadas (sanfona por rodada)
// ---------------------------------------------------------------------

function buildAccordion(container, groups, { openKey, scrollIntoView }) {
  container.innerHTML = groups.map(([key, label, matches]) => `
    <div class="accordion-item ${key === openKey ? 'is-open' : ''}" data-key="${key}">
      <button class="accordion-header" data-toggle="${key}">
        <span>${label}</span>
        <span class="chevron">▾</span>
      </button>
      <div class="accordion-body">${matches}</div>
    </div>
  `).join('');

  container.querySelectorAll('.accordion-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.accordion-item').classList.toggle('is-open');
    });
  });

  if (scrollIntoView && openKey) {
    const el = container.querySelector(`.accordion-item[data-key="${openKey}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
}

function renderRodadas() {
  const byRound = new Map();
  for (const m of state.fixtures.matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round).push(m);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const groups = rounds.map((r) => {
    const matches = byRound.get(r).sort((a, b) => new Date(a.date) - new Date(b.date));
    return [String(r), `Rodada ${r}`, matches.map(matchCardHtml).join('')];
  });
  buildAccordion(document.getElementById('rodadasAccordion'), groups, {
    openKey: String(state.fixtures.currentRound),
    scrollIntoView: true,
  });
}

// ---------------------------------------------------------------------
// Meses (sanfona por mês, agrupado por dia)
// ---------------------------------------------------------------------

function renderMeses() {
  const byMonth = new Map(); // "2026-01" -> Map(day -> matches[])
  for (const m of state.fixtures.matches) {
    const ym = m.date.slice(0, 7);
    const day = m.date.slice(0, 10);
    if (!byMonth.has(ym)) byMonth.set(ym, new Map());
    const days = byMonth.get(ym);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(m);
  }
  const months = [...byMonth.keys()].sort();
  const nowYm = new Date(debugNowMs() ?? Date.now()).toISOString().slice(0, 7);

  const groups = months.map((ym) => {
    const days = byMonth.get(ym);
    const dayKeys = [...days.keys()].sort();
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .format(new Date(`${ym}-15T12:00:00Z`));
    const body = dayKeys.map((day) => {
      const matches = days.get(day).sort((a, b) => new Date(a.date) - new Date(b.date));
      const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
        .format(new Date(`${day}T12:00:00Z`));
      return `<div class="accordion-day-label">${dayLabel}</div>${matches.map(matchCardHtml).join('')}`;
    }).join('');
    return [ym, label.charAt(0).toUpperCase() + label.slice(1), body];
  });

  buildAccordion(document.getElementById('mesesAccordion'), groups, {
    openKey: months.includes(nowYm) ? nowYm : null,
    scrollIntoView: true,
  });
}

// ---------------------------------------------------------------------
// Modo live
// ---------------------------------------------------------------------

let matchModal = null;
let liveController = null;

function updateLiveBar(liveMatchIds) {
  const bar = document.getElementById('liveBar');
  const text = document.getElementById('liveBarText');
  const count = (liveMatchIds || []).length;
  if (count === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  text.textContent = count === 1 ? '1 jogo ao vivo agora' : `${count} jogos ao vivo agora`;
}

// Atualiza só o placar/estado dos cards já na tela (Home/Rodadas/Meses
// compartilham a mesma marcação .match-card[data-match]), sem reconstruir o
// DOM — isso preserva o estado aberto/fechado das sanfonas de Rodadas/Meses.
function patchLiveMatchCards() {
  document.querySelectorAll('.match-card[data-match]').forEach((el) => {
    const m = state.fixtures.matches.find((x) => x.id === el.dataset.match);
    if (!m) return;
    const isLive = m.status === 'live';
    el.classList.toggle('is-live', isLive);
    const center = el.querySelector('.center');
    if (!center || (m.status !== 'finished' && !isLive)) return;
    const liveBadge = isLive ? '<span class="live-badge"></span>' : '';
    const { date, time } = fmtDateTime(m.date);
    center.innerHTML = `<span class="score">${liveBadge}${m.score?.home ?? 0} x ${m.score?.away ?? 0}</span><span class="score-date">${date} · ${time}</span>`;
  });
}

function onLiveUpdate({ liveMatchIds }) {
  patchLiveMatchCards();
  renderLiveMatches();
  renderClassificacao();
  updateLiveBar(liveMatchIds);
  matchModal?.refreshIfLive(liveMatchIds);
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('is-active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('is-active');
    });
  });
}

// ---------------------------------------------------------------------
// Carregamento de liga
// ---------------------------------------------------------------------

async function loadLiga(slug, { resetTeam } = {}) {
  const cfg = state.leagues[slug];
  if (!cfg || cfg.status !== 'active') return; // fallback silencioso (edge case 9)

  state.liga = slug;
  state.team = resetTeam ? null : (qs.get('time') || null);
  updateQuery({ liga: slug, time: state.team });
  updateHeaderForLiga(cfg);
  renderLeaguePicker();

  const base = `data/${slug}`;
  const [teams, fixtures, standings, meta, players, stats] = await Promise.all([
    fetchJson(`${base}/teams.json`),
    fetchJson(`${base}/fixtures.json`),
    fetchJson(`${base}/standings.json`),
    fetchJson(`${base}/meta.json`),
    fetchJsonOptional(`${base}/players.json`, {}),
    fetchJsonOptional(`${base}/stats.json`, { players: {}, teams: {} }),
  ]);
  state.teams = teams;
  state.fixtures = fixtures;
  state.homeVenues = computeHomeVenues(fixtures);
  state.standings = standings;
  state.meta = meta;
  state.players = players;
  state.stats = stats;
  applyDebugForceLive();

  if (state.team && !teams[state.team]) state.team = null; // ?time= inválido -> default

  if (state.team) {
    Theme.applyTeamSkin(teams[state.team].skin);
  } else {
    Theme.applyLeagueTheme(cfg.identity);
  }
  document.getElementById('skinResetBtn').hidden = !state.team;
  document.getElementById('skinResetBtn').onclick = () => selectTeamSkin(null);

  renderLeagueHero();
  renderTeamFrame();
  renderLiveMatches();
  renderHomeLists();
  renderHighlights();
  renderClassificacao();
  renderRodadas();
  renderMeses();
  refreshStatsTeamOptions();
  renderEstatisticas();

  liveController?.stop();
  liveController = initLive(
    () => ({
      liga: state.liga,
      leagues: state.leagues,
      fixtures: state.fixtures,
      meta: state.meta,
      now: debugNowMs() ?? undefined,
    }),
    onLiveUpdate,
  );
}

async function main() {
  initTabs();
  wireEstatisticas();
  initSquadModal(
    {
      modalEl: document.getElementById('squadModal'),
      backdropEl: document.getElementById('squadModalBackdrop'),
      contentEl: document.getElementById('squadModalContent'),
    },
    () => ({ teams: state.teams, players: state.players, stats: state.stats }),
  );
  matchModal = initMatchModal(
    {
      modalEl: document.getElementById('matchModal'),
      backdropEl: document.getElementById('matchModalBackdrop'),
      contentEl: document.getElementById('matchModalContent'),
    },
    () => ({ teams: state.teams, fixtures: state.fixtures, leagues: state.leagues, liga: state.liga, homeVenues: state.homeVenues }),
  );

  state.leagues = await fetchJson('data/leagues.json');
  renderLeaguePicker();
  wireLeagueModal();

  const requested = qs.get('liga');
  const firstActive = Object.keys(state.leagues).find((k) => state.leagues[k].status === 'active');
  const target = (requested && state.leagues[requested]?.status === 'active') ? requested : firstActive;

  if (!target) {
    document.getElementById('app').innerHTML = '<p class="empty-state">Nenhuma liga disponível.</p>';
    return;
  }
  await loadLiga(target);
}

main().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML = '<p class="empty-state">Falha ao carregar dados. Tente novamente mais tarde.</p>';
});
