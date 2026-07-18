// Render da Classificação (spec 6.2.2). Recálculo ao vivo (spec 6.6, Fase 4):
// quando `standings.table[].posDelta` vem preenchido (ver computeLiveStandings
// em app.js), mostra as setas ▲▼ comparando com o standings.json oficial.

function pct(row) {
  const maxPts = row.played * 3;
  if (!maxPts) return '0%';
  return `${Math.round((row.pts / maxPts) * 100)}%`;
}

// Cada bolinha vem de um jogo real (formMatches, ver computeFormMatches em
// app.js) — passar o mouse mostra o placar (title nativo do browser) e
// clicar abre o modal da partida (mesmo data-match/data-liga usados nos
// cards de jogo, o listener global de modal.js já entende os dois).
function formPills(formMatches, liga) {
  return (formMatches || [])
    .map((m) => `<span class="form-pill ${m.result} is-clickable" data-match="${m.id}" data-liga="${liga}" title="${m.label}">${m.result}</span>`)
    .join('');
}

export function renderStandings({ bodyEl, legendEl, badgeEl }, standings, teams, opts = {}) {
  const zoneColor = new Map((standings.zones || []).map((z) => [z.id, z.color]));
  const liveTeams = opts.liveTeams || new Set();

  bodyEl.innerHTML = standings.table.map((row) => {
    const team = teams[row.team];
    const color = row.zone ? zoneColor.get(row.zone) : null;
    const posArrow = row.posDelta > 0 ? '<span class="pos-arrow up">▲</span>'
      : row.posDelta < 0 ? '<span class="pos-arrow down">▼</span>' : '';
    const isLive = liveTeams.has(row.team);
    return `
      <tr class="${row.zone ? 'zone-row' : ''} ${isLive ? 'is-live-row' : ''}" style="${color ? `--zone-color:${color}` : ''}" data-team="${row.team}">
        <td class="col-pos">${row.pos}${posArrow}</td>
        <td class="col-team" data-open-squad="${row.team}">
          <img src="${team?.badge || ''}" alt="" loading="lazy" />
          <span>${team?.name || row.team}</span>
          ${isLive ? '<span class="live-indicator" title="Jogo em andamento"></span>' : ''}
        </td>
        <td>${row.pts}</td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td>${row.gd > 0 ? '+' : ''}${row.gd}</td>
        <td>${pct(row)}</td>
        <td class="col-form">${formPills(row.formMatches, opts.liga)}</td>
      </tr>
    `;
  }).join('');

  if (legendEl) {
    legendEl.innerHTML = (standings.zones || []).map((z) => `
      <li><span class="swatch" style="background:${z.color || '#888'}"></span>${z.label}</li>
    `).join('');
  }

  if (badgeEl) {
    if (opts.partial) {
      badgeEl.hidden = false;
      badgeEl.textContent = 'Parcial — jogos em andamento';
    } else {
      badgeEl.hidden = true;
    }
  }
}
