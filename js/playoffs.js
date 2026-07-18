// Render da aba Playoffs (mata-mata de acesso/rebaixamento fora da fase de
// pontos corridos). Puramente config-driven a partir de leagues.json
// (`rules.playoffs`) — a aba só existe pra ligas que declararem esse bloco,
// então funciona igual pra qualquer campeonato sem precisar de código
// específico por liga (ver CLAUDE.MD: tudo tem que ser dinâmico).
//
// A caixa "Team A x Team B" (quem ocupa cada posição AGORA na classificação)
// sempre aparece, atualizando ao vivo junto com o resto da aba Classificação.
// Quando o confronto já tem jogo de verdade em fixtures.matches (round além
// da fase de pontos corridos, entre os dois times do par), os cards de jogo
// (data, placar, local, link de detalhes) entram embaixo — antes disso
// (fase de pontos corridos ainda rolando) só a caixa aparece mesmo.
import { matchCardHtml } from './matches.js?v=20260718a';

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

// Jogos do confronto: round além da fase de pontos corridos, entre os dois
// times do par (em qualquer mando — ida ou volta). Sem outro marcador em
// fixtures.json pra "isso é playoff", esse é o critério: nenhum jogo da fase
// regular tem round > rules.rounds.
function tieFixtures(fixtures, maxRegularRound, teamA, teamB) {
  if (!fixtures?.matches || !teamA || !teamB) return [];
  return fixtures.matches
    .filter((m) => m.round > maxRegularRound
      && ((m.home === teamA && m.away === teamB) || (m.home === teamB && m.away === teamA)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function renderPlayoffs({ containerEl }, playoffsCfg, standingsTable, teams, matchCtx = {}) {
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

  const { fixtures, homeVenues, liga, maxRegularRound } = matchCtx;
  const cardCtx = { teams, homeVenues, liga };

  const pairsHtml = (playoffsCfg.pairs || []).map(([higher, lower]) => {
    const teamHigher = teamAt(higher);
    const teamLower = teamAt(lower);
    const games = tieFixtures(fixtures, maxRegularRound, teamHigher?.slug, teamLower?.slug);
    const gamesHtml = games.length
      ? `<div class="match-list playoff-tie-games">${games.map((m) => matchCardHtml(m, cardCtx)).join('')}</div>`
      : '';
    return `
      <div class="playoff-tie-group">
        <div class="playoff-tie">
          ${teamCell(teamHigher)}
          <span class="playoff-tie-vs">x</span>
          ${teamCell(teamLower)}
        </div>
        ${gamesHtml}
      </div>
    `;
  }).join('');

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
