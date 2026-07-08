// Modal de partida (spec Fase 4). Timeline de gols/cartões/subs + escalação,
// a partir do summary da ESPN. Schema validado na Fase 0 (docs/fase0-bra-a.md):
// keyEvents[].participants[0] = autor, participants[1] = assistência (gol) ou
// quem saiu (substituição); scoringPlay:true marca gol de fato (incl. pênalti
// convertido); type.type dá o slug limpo do evento.

const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

function fmtDateTime(iso) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false }).format(d),
  };
}

async function fetchSummary(liga, espnSlug, espnEventId, isLive) {
  if (!espnEventId) return null;
  if (!isLive) {
    try {
      const res = await fetch(`data/${liga}/raw/summaries/${espnEventId}.json`);
      if (res.ok) return await res.json();
    } catch (_) {
      // sem cache local, cai pro fetch direto abaixo
    }
  }
  try {
    const res = await fetch(`${ESPN_SITE_BASE}/${espnSlug}/summary?event=${espnEventId}`);
    if (res.ok) return await res.json();
  } catch (_) {
    // segue sem summary
  }
  return null;
}

function eventIcon(kind) {
  switch (kind) {
    case 'goal': return '⚽';
    case 'yellow': return '🟨';
    case 'red': return '🟥';
    case 'sub': return '⇄';
    default: return '•';
  }
}

function extractTimeline(summary, homeEspnId, awayEspnId) {
  const items = [];
  for (const ke of summary?.keyEvents || []) {
    const slug = ke.type?.type || '';
    const minute = ke.clock?.displayValue || '';
    const actor = ke.participants?.[0]?.athlete;
    const other = ke.participants?.[1]?.athlete;
    const teamId = ke.team?.id;
    const side = String(teamId) === String(homeEspnId) ? 'home' : String(teamId) === String(awayEspnId) ? 'away' : null;
    if (!side) continue;

    const actorName = actor?.shortName || actor?.displayName;
    const otherName = other?.shortName || other?.displayName;

    if (ke.scoringPlay === true) {
      const isOwnGoal = /own/i.test(slug);
      const isPenalty = /penalty/i.test(slug);
      let text = actorName || 'Gol';
      if (isOwnGoal) text += ' (contra)';
      else if (isPenalty) text += ' (pên.)';
      else if (otherName) text += ` (${otherName})`;
      items.push({ minute, kind: 'goal', text, side });
    } else if (slug === 'yellow-card') {
      items.push({ minute, kind: 'yellow', text: actorName || '', side });
    } else if (slug === 'red-card' || slug === 'yellow-red-card') {
      items.push({ minute, kind: 'red', text: actorName || '', side });
    } else if (slug === 'substitution') {
      items.push({ minute, kind: 'sub', text: `▲${actorName || '?'} ▼${otherName || '?'}`, side });
    }
  }
  return items;
}

function timelineRowHtml(item) {
  const icon = `<span class="timeline-icon">${eventIcon(item.kind)}</span>`;
  const text = `<span class="timeline-text">${item.text}</span>`;
  const minute = `<span class="timeline-minute">${item.minute}</span>`;
  const home = item.side === 'home' ? `${icon}${text}` : '';
  const away = item.side === 'away' ? `${text}${icon}` : '';
  return `
    <div class="timeline-row">
      <div class="timeline-side home">${home}</div>
      ${minute}
      <div class="timeline-side away">${away}</div>
    </div>
  `;
}

function extractLineup(summary, espnTeamId) {
  const rosterEntry = (summary?.rosters || []).find((r) => String(r.team?.id) === String(espnTeamId));
  const players = rosterEntry?.roster || [];
  const starters = players.filter((p) => p.starter).sort((a, b) => (a.jersey ?? 99) - (b.jersey ?? 99));
  const bench = players.filter((p) => !p.starter).sort((a, b) => (a.jersey ?? 99) - (b.jersey ?? 99));
  return { starters, bench };
}

function lineupListHtml(players) {
  return players.map((p) => `
    <li>
      <span class="lineup-jersey">${p.jersey ?? '—'}</span>
      <span>${p.athlete?.shortName || p.athlete?.displayName || '?'}</span>
    </li>
  `).join('') || '<li class="empty-state">—</li>';
}

function renderMatchModal({ contentEl }, m, teams, cfg, liga, summary) {
  const home = teams[m.home];
  const away = teams[m.away];
  const { date, time } = fmtDateTime(m.date);
  const isLive = m.status === 'live';
  const showScore = m.status === 'finished' || isLive;

  const timelineHtml = summary
    ? extractTimeline(summary, home?.espnId, away?.espnId).map(timelineRowHtml).join('')
    : '';

  const lineupsHtml = summary ? `
    <div class="match-modal-lineups">
      <div>
        <h4 class="squad-position-label">Titulares — ${home?.abbrev || m.home}</h4>
        <ul class="lineup-list">${lineupListHtml(extractLineup(summary, home?.espnId).starters)}</ul>
      </div>
      <div>
        <h4 class="squad-position-label">Titulares — ${away?.abbrev || m.away}</h4>
        <ul class="lineup-list">${lineupListHtml(extractLineup(summary, away?.espnId).starters)}</ul>
      </div>
    </div>
  ` : '';

  contentEl.innerHTML = `
    <button class="squad-close-btn" id="matchModalCloseBtn" aria-label="Fechar">✕</button>
    <div class="match-modal-header">
      <div class="match-modal-team home">
        <img src="${home?.badge || ''}" alt="" />
        <span>${home?.name || m.home}</span>
      </div>
      <div class="match-modal-score">
        ${showScore
          ? `<div class="big-score">${isLive ? '<span class="live-badge"></span>' : ''}${m.score?.home ?? 0} x ${m.score?.away ?? 0}</div>`
          : `<div class="big-score">${date}<br>${time}</div>`}
        <div class="match-modal-meta">Rodada ${m.round}${isLive && m.liveClock ? ` · ${m.liveClock}` : ''}</div>
      </div>
      <div class="match-modal-team away">
        <span>${away?.name || m.away}</span>
        <img src="${away?.badge || ''}" alt="" />
      </div>
    </div>
    ${summary
      ? `<div class="match-modal-timeline">${timelineHtml || '<p class="empty-state">Sem lances registrados.</p>'}</div>${lineupsHtml}`
      : '<p class="empty-state">Detalhes da partida ainda não disponíveis.</p>'}
  `;
}

export function initMatchModal({ modalEl, backdropEl, contentEl }, getData) {
  let currentMatchId = null;

  async function open(matchId) {
    const { teams, fixtures, leagues, liga } = getData();
    const m = fixtures?.matches?.find((x) => x.id === matchId);
    if (!m) return;
    currentMatchId = matchId;

    const cfg = leagues[liga];
    modalEl.hidden = false;
    contentEl.innerHTML = '<p class="empty-state">Carregando…</p>';

    const summary = await fetchSummary(liga, cfg.sources.espnSlug, m.espnEventId, m.status === 'live');
    if (currentMatchId !== matchId || modalEl.hidden) return; // fechou/trocou enquanto buscava
    renderMatchModal({ contentEl }, m, teams, cfg, liga, summary);
    contentEl.querySelector('#matchModalCloseBtn')?.addEventListener('click', close);
  }

  function close() {
    modalEl.hidden = true;
    currentMatchId = null;
  }

  function refreshIfLive(liveMatchIds) {
    if (currentMatchId && (liveMatchIds || []).includes(currentMatchId)) {
      open(currentMatchId);
    }
  }

  backdropEl.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) close();
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-squad]')) return;
    const trigger = e.target.closest('[data-match]');
    if (!trigger) return;
    open(trigger.dataset.match);
  });

  return { open, close, refreshIfLive };
}
