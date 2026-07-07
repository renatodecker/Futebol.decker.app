#!/usr/bin/env node
/**
 * scripts/build-teams.js --liga=bra-a
 *
 * Gera um esqueleto de /data/{liga}/teams.json cruzando a classificação ESPN
 * (nomes oficiais + espnId + logo) com o /teams da fonte canônica (football-data,
 * quando FOOTBALL_DATA_TOKEN existir) por nome normalizado, conforme spec 4.1.
 * Cores (skin) e badges baixados continuam exigindo revisão manual — o spec
 * pede contraste AA revisado à mão, isso não é automatizável com segurança.
 *
 * Roda em ambiente com internet irrestrita (GitHub Actions).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';
const FD_BASE = 'https://api.football-data.org/v4';

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

const STOPWORDS = new Set([
  'futebol', 'clube', 'esporte', 'de', 'regatas', 'sociedade', 'esportiva',
  'associacao', 'foot', 'ball', 'ec', 'fc', 'sc', 'cr', 'ac',
  'e', 'do', 'da', 'dos', 'das',
]);

function nameTokens(name) {
  const norm = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return norm.split(' ').filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function matchFdTeam(espnName, fdTeams, taken) {
  const espnTokens = new Set(nameTokens(espnName));
  let best = null;
  let bestScore = 0;
  for (const fd of fdTeams) {
    if (taken.has(fd.id)) continue;
    const fdTokens = new Set([...nameTokens(fd.name), ...nameTokens(fd.shortName || '')]);
    let score = 0;
    for (const t of espnTokens) if (fdTokens.has(t)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = fd;
    }
  }
  return bestScore > 0 ? best : null;
}

async function fetchFdTeams(cfg) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token || !cfg.sources.canonicalCode) return null;
  const url = `${FD_BASE}/competitions/${cfg.sources.canonicalCode}/teams`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': token } });
  if (res.status !== 200) {
    console.warn(`Aviso: football-data /teams retornou HTTP ${res.status}; seguindo só com ESPN.`);
    return null;
  }
  const json = await res.json();
  return json?.teams || [];
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

  const fdTeams = await fetchFdTeams(cfg);
  const takenFdIds = new Set();

  const teamsDir = path.join(ROOT, 'data', liga);
  fs.mkdirSync(teamsDir, { recursive: true });
  const badgesDir = path.join(ROOT, 'img', 'badges', liga);
  fs.mkdirSync(badgesDir, { recursive: true });

  const skeleton = {};
  const usedSlugs = new Set();
  let fdMatched = 0;
  for (const entry of entries) {
    const team = entry.team;
    let slug = slugify(team.abbreviation || team.shortDisplayName || team.name).slice(0, 3);
    if (!slug || usedSlugs.has(slug)) {
      slug = slugify(team.displayName).slice(0, 3) + (usedSlugs.size % 10);
    }
    usedSlugs.add(slug);

    let fdId = null;
    let fdName = null;
    if (fdTeams) {
      const match = matchFdTeam(team.displayName, fdTeams, takenFdIds);
      if (match) {
        fdId = match.id;
        fdName = match.name;
        takenFdIds.add(match.id);
        fdMatched += 1;
      }
    }

    skeleton[slug] = {
      name: team.displayName,
      abbrev: team.abbreviation || null,
      espnId: team.id,
      fdId,
      fdName,
      badge: `/img/badges/${liga}/${slug}.png`,
      badgeSourceEspn: team.logos?.[0]?.href || null,
      skin: { primary: null, secondary: null, text: null },
      _reviewNeeded: fdId
        ? 'Confirmar o match fdName acima e preencher cores skin (revisão manual, contraste AA) e baixar badge para o caminho indicado.'
        : 'fdId não casou automaticamente — cruzar manualmente com football-data.org. Preencher cores skin (revisão manual, contraste AA) e baixar badge.',
    };
  }

  const outPath = path.join(teamsDir, 'teams.json');
  fs.writeFileSync(outPath, JSON.stringify(skeleton, null, 2) + '\n');
  console.log(`Esqueleto de teams.json escrito em ${outPath} com ${Object.keys(skeleton).length} clubes.`);
  console.log(fdTeams
    ? `Cruzamento football-data: ${fdMatched}/${Object.keys(skeleton).length} casaram automaticamente.`
    : 'football-data não consultado (sem token ou sem canonicalCode) — fdId ficou null para todos.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
