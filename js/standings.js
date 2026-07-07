// Render da Classificação (spec 6.2.2). Recálculo ao vivo (6.6) chega na Fase 4.

function pct(row) {
  const maxPts = row.played * 3;
  if (!maxPts) return '0%';
  return `${Math.round((row.pts / maxPts) * 100)}%`;
}

function formPills(form) {
  return (form || [])
    .slice(-5)
    .map((r) => `<span class="form-pill ${r}">${r}</span>`)
    .join('');
}

export function renderStandings({ bodyEl, legendEl, badgeEl }, standings, teams, opts = {}) {
  const zoneColor = new Map((standings.zones || []).map((z) => [z.id, z.color]));

  bodyEl.innerHTML = standings.table.map((row) => {
    const team = teams[row.team];
    const color = row.zone ? zoneColor.get(row.zone) : null;
    return `
      <tr class="${row.zone ? 'zone-row' : ''}" style="${color ? `--zone-color:${color}` : ''}" data-team="${row.team}">
        <td class="col-pos">${row.pos}</td>
        <td class="col-team" data-open-squad="${row.team}">
          <img src="${team?.badge || ''}" alt="" loading="lazy" />
          <span>${team?.name || row.team}</span>
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
        <td class="col-form">${formPills(row.form)}</td>
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
