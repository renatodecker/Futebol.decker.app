#!/usr/bin/env node
/**
 * scripts/build-teams.js --liga=bra-a
 *
 * Gera um esqueleto de /data/{liga}/teams.json a partir da classificação ESPN
 * (nomes oficiais + espnId + logo). Cores (skin) e o cruzamento com o id da
 * fonte canônica (fdId) são preenchidos manualmente por revisão humana — o
 * spec (seção 4.1) exige revisão à mão para contraste e coerência de cores.
 *
 * Roda em ambiente com internet irrestrita (GitHub Actions); ESPN não exige
 * chave para este endpoint.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';

function argLiga() {
  const arg = process.argv.find((a) => a.startsWith('--liga='));
  return arg ? arg.split('=')[1] : 'bra-a';
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  const liga = argLiga();
  const leaguesPath = path.join(ROOT, 'data', 'leagues.json');
  const leagues = JSON.parse(fs.readFileSync(leaguesPath, 'utf8'));
  const cfg = leagues[liga];
  if (!cfg) throw new Error(`Liga desconhecida em leagues.json: ${liga}`);
  const espnSlug = cfg.sources.espnSlug;

  const url = `${ESPN_STANDINGS_BASE}/${espnSlug}/standings`;
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error(`Falha ao buscar standings ESPN (HTTP ${res.status}) em ${url}`);
  }
  const json = await res.json();

  const entries = json?.children?.[0]?.standings?.entries || json?.standings?.entries || [];
  if (entries.length === 0) {
    throw new Error('Nenhuma entrada de standings encontrada — revisar shape da resposta ESPN.');
  }

  const teamsDir = path.join(ROOT, 'data', liga);
  fs.mkdirSync(teamsDir, { recursive: true });
  const badgesDir = path.join(ROOT, 'img', 'badges', liga);
  fs.mkdirSync(badgesDir, { recursive: true });

  const skeleton = {};
  const usedSlugs = new Set();
  for (const entry of entries) {
    const team = entry.team;
    let slug = slugify(team.abbreviation || team.shortDisplayName || team.name).slice(0, 3);
    if (!slug || usedSlugs.has(slug)) {
      slug = slugify(team.displayName).slice(0, 3) + (usedSlugs.size % 10);
    }
    usedSlugs.add(slug);
    skeleton[slug] = {
      name: team.displayName,
      abbrev: team.abbreviation || null,
      espnId: team.id,
      fdId: null,
      badge: `/img/badges/${liga}/${slug}.png`,
      badgeSourceEspn: team.logos?.[0]?.href || null,
      skin: { primary: null, secondary: null, text: null },
      _reviewNeeded: 'Preencher fdId (cruzar com football-data.org quando o token existir), cores skin (revisão manual, contraste AA) e baixar badge para o caminho indicado.',
    };
  }

  const outPath = path.join(teamsDir, 'teams.json');
  fs.writeFileSync(outPath, JSON.stringify(skeleton, null, 2) + '\n');
  console.log(`Esqueleto de teams.json escrito em ${outPath} com ${Object.keys(skeleton).length} clubes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
