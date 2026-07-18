// Render da aba Playoffs (mata-mata de acesso/rebaixamento fora da fase de
// pontos corridos). Puramente config-driven a partir de leagues.json
// (`rules.playoffs`) — a aba só existe pra ligas que declararem esse bloco,
// então funciona igual pra qualquer campeonato sem precisar de código
// específico por liga (ver CLAUDE.MD: tudo tem que ser dinâmico).
//
// Hoje só existe fixture real de playoff depois do fim da fase de pontos
// corridos (ex.: Série B 2026, jogos em 21 e 28/11) — até lá, o bracket é
// "provisório": mostra quem ocupa cada posição AGORA na classificação,
// atualizando ao vivo junto com o resto da aba Classificação.

function teamCell(team) {
  if (!team) {
    return '<div class="playoff-team playoff-team-tbd"><span class="playoff-team-name">A definir</span></div>';
  }
  return `
    <div class="playoff-team" data-open-squad="${team.slug}">
      <img src="${team.badge || ''}" alt="" loading="lazy" />
      <span class="playoff-team-name">${team.name}</span>
      <span class="playoff-team-pos">${team.pos}º</span>
    </div>
  `;
}

export function renderPlayoffs({ containerEl }, playoffsCfg, standingsTable, teams) {
  if (!playoffsCfg) {
    containerEl.innerHTML = '';
    return;
  }

  const byPos = new Map((standingsTable || []).map((r) => [r.pos, r]));
  const teamAt = (pos) => {
    const row = byPos.get(pos);
    if (!row) return null;
    const team = teams[row.team];
    return { slug: row.team, name: team?.name || row.team, badge: team?.badge, pos };
  };

  const pairsHtml = (playoffsCfg.pairs || []).map(([higher, lower]) => `
    <div class="playoff-tie">
      ${teamCell(teamAt(higher))}
      <span class="playoff-tie-vs">x</span>
      ${teamCell(teamAt(lower))}
    </div>
  `).join('');

  containerEl.innerHTML = `
    <div class="playoff-intro">
      <h3>${playoffsCfg.label}</h3>
      <p>${playoffsCfg.description}</p>
      ${playoffsCfg.note ? `<p class="playoff-note">${playoffsCfg.note}</p>` : ''}
      ${playoffsCfg.dates ? `<p class="playoff-dates">Datas previstas: ${playoffsCfg.dates}</p>` : ''}
    </div>
    <div class="playoff-bracket">
      <p class="playoff-bracket-label">Confrontos (provisório, conforme classificação atual)</p>
      ${pairsHtml}
    </div>
  `;
}
