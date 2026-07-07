import * as Theme from './theme.js';
import { renderStandings } from './standings.js';

const state = {
  leagues: null,
  liga: null,
  teams: null,
  fixtures: null,
  standings: null,
  meta: null,
  team: null, // slug do time selecionado (skin), ou null
};

const qs = new URLSearchParams(location.search);

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

function renderLeaguePicker() {
  const picker = document.getElementById('leaguePicker');
  const entries = Object.entries(state.leagues).filter(([, cfg]) => cfg.status !== 'hidden');
  picker.innerHTML = entries.map(([slug, cfg]) => {
    const disabled = cfg.status !== 'active';
    return `
      <button class="league-option" data-liga="${slug}" ${disabled ? 'disabled' : ''}>
        ${cfg.logo ? `<img src="${cfg.logo}" alt="" />` : ''}
        <span>${cfg.shortName || cfg.name}</span>
        ${disabled ? '<span class="soon-badge">em breve</span>' : ''}
      </button>
    `;
  }).join('');

  picker.querySelectorAll('.league-option:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      picker.hidden = true;
      document.getElementById('leaguePickerToggle').setAttribute('aria-expanded', 'false');
      if (btn.dataset.liga !== state.liga) {
        loadLiga(btn.dataset.liga, { resetTeam: true });
      }
    });
  });

  document.getElementById('leaguePickerToggle').addEventListener('click', () => {
    const expanded = document.getElementById('leaguePickerToggle').getAttribute('aria-expanded') === 'true';
    picker.hidden = expanded;
    document.getElementById('leaguePickerToggle').setAttribute('aria-expanded', String(!expanded));
  }, { once: true });
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

function matchCardHtml(m, { showRound = false } = {}) {
  const home = state.teams[m.home];
  const away = state.teams[m.away];
  const { date, time } = fmtDateTime(m.date);
  const isLive = m.status === 'live';
  const liveBadge = '<span class="live-badge"></span>';
  const scoreHtml = m.status === 'finished' || isLive
    ? `<span class="score">${isLive ? liveBadge : ''}${m.score?.home ?? 0} x ${m.score?.away ?? 0}</span>`
    : `<span class="datetime">${date}<br>${time}</span>`;
  const roundHtml = showRound ? `<span class="round-label">Rodada ${m.round}</span>` : '';

  return `
    <div class="match-card ${isLive ? 'is-live' : ''}" data-match="${m.id}">
      ${roundHtml}
      <div class="team home">
        <img src="${home?.badge || ''}" alt="" />
        <span class="team-name">${home?.abbrev || m.home}</span>
      </div>
      <div class="center">${scoreHtml}</div>
      <div class="team away">
        <span class="team-name">${away?.abbrev || m.away}</span>
        <img src="${away?.badge || ''}" alt="" />
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

// ---------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------

function renderClassificacao() {
  renderStandings({
    bodyEl: document.getElementById('standingsBody'),
    legendEl: document.getElementById('zonesLegend'),
    badgeEl: document.getElementById('standingsBadge'),
  }, state.standings, state.teams);
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
  const nowYm = new Date().toISOString().slice(0, 7);

  const groups = months.map((ym) => {
    const days = byMonth.get(ym);
    const dayKeys = [...days.keys()].sort();
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .format(new Date(`${ym}-15T12:00:00Z`));
    const body = dayKeys.map((day) => {
      const matches = days.get(day).sort((a, b) => new Date(a.date) - new Date(b.date));
      const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
        .format(new Date(`${day}T12:00:00Z`));
      return `<div class="accordion-day-label">${dayLabel}</div>${matches.map((m) => matchCardHtml(m, { showRound: true })).join('')}`;
    }).join('');
    return [ym, label.charAt(0).toUpperCase() + label.slice(1), body];
  });

  buildAccordion(document.getElementById('mesesAccordion'), groups, {
    openKey: months.includes(nowYm) ? nowYm : null,
    scrollIntoView: true,
  });
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

  const base = `data/${slug}`;
  const [teams, fixtures, standings, meta] = await Promise.all([
    fetchJson(`${base}/teams.json`),
    fetchJson(`${base}/fixtures.json`),
    fetchJson(`${base}/standings.json`),
    fetchJson(`${base}/meta.json`),
  ]);
  state.teams = teams;
  state.fixtures = fixtures;
  state.standings = standings;
  state.meta = meta;

  if (state.team && !teams[state.team]) state.team = null; // ?time= inválido -> default

  if (state.team) {
    Theme.applyTeamSkin(teams[state.team].skin);
  } else {
    Theme.applyLeagueTheme(cfg.identity);
  }
  document.getElementById('skinResetBtn').hidden = !state.team;
  document.getElementById('skinResetBtn').onclick = () => selectTeamSkin(null);

  renderTeamFrame();
  renderHomeLists();
  renderClassificacao();
  renderRodadas();
  renderMeses();
}

async function main() {
  initTabs();
  state.leagues = await fetchJson('data/leagues.json');
  renderLeaguePicker();

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
