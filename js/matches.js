// Utilidades de exibição de jogos compartilhadas entre a Home/Rodadas/Meses
// (app.js) e as abas de Resultados/Calendário do modal de elenco (squad.js) —
// garante que todo lugar do site mostre jogo com o mesmo padrão: data,
// rodada, local, placar e link de detalhes.

export function fmtDateTime(iso) {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false }).format(d),
    full: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d),
  };
}

export function fmtAttendance(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// fixtures só ganham venue confirmado perto da rodada (via ESPN). Até lá,
// usamos o estádio mais frequente do mandante nas partidas já disputadas na
// temporada como palpite ("provável"), pra nenhum card de jogo agendado
// ficar sem local nenhum.
export function matchVenue(m, homeVenues) {
  if (m.venue) return { venue: m.venue, isProbable: false };
  const probable = homeVenues?.[m.home];
  return probable ? { venue: probable, isProbable: true } : { venue: null, isProbable: false };
}

export function venueLineHtml(m, homeVenues) {
  const { venue, isProbable } = matchVenue(m, homeVenues);
  if (!venue) return '<span></span>';
  const attendance = typeof m.attendance === 'number' && m.attendance > 0
    ? ` · público: ${fmtAttendance(m.attendance)}`
    : '';
  const suffix = isProbable ? ' (provável)' : '';
  return `<span class="venue${isProbable ? ' is-probable' : ''}">🏟️ ${venue}${suffix}${attendance}</span>`;
}

// Regra geral: todo card de jogo (Home, Rodadas, Meses, abas do modal de
// elenco) sempre mostra rodada, data, horário e local — sem depender de qual
// aba está renderizando, pra não ter card "incompleto" em lugar nenhum. No
// hub (cross-liga), o rótulo de rodada também leva o nome do campeonato, já
// que ali os jogos vêm misturados.
export function matchCardHtml(m, ctx) {
  const home = ctx.teams[m.home];
  const away = ctx.teams[m.away];
  const { date, time } = fmtDateTime(m.date);
  const isLive = m.status === 'live';
  const liveBadge = '<span class="live-badge"></span>';
  const scoreHtml = m.status === 'finished' || isLive
    ? `<span class="score">${isLive ? liveBadge : ''}${m.score?.home ?? 0} x ${m.score?.away ?? 0}</span><span class="score-date">${date} · ${time}</span>`
    : `<span class="datetime">${date}<br>${time}</span>`;
  const roundLabel = ctx.leagueLabel ? `${ctx.leagueLabel} · Rodada ${m.round}` : `Rodada ${m.round}`;
  const homeSquadAttr = ctx.enableSquad === false ? '' : `data-open-squad="${m.home}"`;
  const awaySquadAttr = ctx.enableSquad === false ? '' : `data-open-squad="${m.away}"`;

  return `
    <div class="match-card is-clickable ${isLive ? 'is-live' : ''}" data-match="${m.id}" data-liga="${ctx.liga}">
      <span class="round-label">${roundLabel}</span>
      <div class="team home" ${homeSquadAttr}>
        <img src="${home?.badge || ''}" alt="" />
        <span class="team-name">${home?.abbrev || m.home}</span>
      </div>
      <div class="center">${scoreHtml}</div>
      <div class="team away" ${awaySquadAttr}>
        <span class="team-name">${away?.abbrev || m.away}</span>
        <img src="${away?.badge || ''}" alt="" />
      </div>
      <div class="match-card-footer">
        ${venueLineHtml(m, ctx.homeVenues)}
        <span class="match-card-link">Ver detalhes ›</span>
      </div>
    </div>
  `;
}

// Quebra os cards por dia (rodada sempre aparece no card, mas quem manda na
// ordem/agrupamento é a data do jogo — uma rodada pode virar dois cabeçalhos
// de dia se os jogos foram remarcados para datas diferentes).
export function fmtDayLabel(day) {
  const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    .format(new Date(`${day}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function matchesByDayHtml(matches, ctx) {
  const days = [];
  let lastDay = null;
  for (const m of matches) {
    const day = m.date.slice(0, 10);
    if (day !== lastDay) {
      days.push([day, []]);
      lastDay = day;
    }
    days[days.length - 1][1].push(m);
  }
  return days.map(([day, dayMatches]) => `
    <div class="accordion-day-label">${fmtDayLabel(day)}</div>
    ${dayMatches.map((m) => matchCardHtml(m, ctx)).join('')}
  `).join('');
}

// Wiring dos tabs genéricos usados nos modais fullscreen (partida e elenco):
// mesma marcação (.match-modal-tab-btn / [data-modal-tab-panel]) nos dois,
// então o comportamento de troca de aba é compartilhado.
export function wireModalTabs(contentEl) {
  contentEl.querySelectorAll('.match-modal-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      contentEl.querySelectorAll('.match-modal-tab-btn').forEach((b) => b.classList.remove('is-active'));
      contentEl.querySelectorAll('.match-modal-tab-panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      contentEl.querySelector(`[data-modal-tab-panel="${btn.dataset.modalTab}"]`).classList.add('is-active');
    });
  });
}
