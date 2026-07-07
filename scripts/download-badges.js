#!/usr/bin/env node
/**
 * scripts/download-badges.js --liga=bra-a
 *
 * Baixa os escudos (badgeSourceEspn) para /img/badges/{liga}/{slug}.png e então
 * remove os campos auxiliares de build (badgeSourceEspn, fdName, _reviewNeeded)
 * de teams.json, deixando o schema exatamente como o spec 4.1 define.
 *
 * Roda em ambiente com internet irrestrita (GitHub Actions).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

async function findLeagueLogoUrl(espnSlug) {
  // O standings não costuma trazer o logo da competição; o scoreboard sim,
  // no array top-level "leagues[].logos".
  const scoreboardUrl = `${ESPN_SITE_BASE}/${espnSlug}/scoreboard`;
  const res = await fetch(scoreboardUrl);
  if (res.status === 200) {
    const json = await res.json();
    const url = json?.leagues?.[0]?.logos?.[0]?.href;
    if (url) return url;
  }
  const standingsUrl = `${ESPN_STANDINGS_BASE}/${espnSlug}/standings`;
  const res2 = await fetch(standingsUrl);
  if (res2.status === 200) {
    const json2 = await res2.json();
    return json2?.logos?.[0]?.href || json2?.league?.logos?.[0]?.href || null;
  }
  return null;
}

function argLiga() {
  const arg = process.argv.find((a) => a.startsWith('--liga='));
  return arg ? arg.split('=')[1] : 'bra-a';
}

async function downloadLeagueLogo(liga, cfg) {
  const logoUrl = await findLeagueLogoUrl(cfg.sources.espnSlug);
  if (!logoUrl) {
    console.warn('Nenhum logo de liga encontrado (scoreboard nem standings ESPN) — mantendo /img/leagues/ vazio para revisão manual.');
    return;
  }
  const logoRes = await fetch(logoUrl);
  if (logoRes.status !== 200) {
    console.warn(`Falha ao baixar logo da liga (HTTP ${logoRes.status}) de ${logoUrl}.`);
    return;
  }
  const logosDir = path.join(ROOT, 'img', 'leagues');
  fs.mkdirSync(logosDir, { recursive: true });
  const buf = Buffer.from(await logoRes.arrayBuffer());
  fs.writeFileSync(path.join(logosDir, `${liga}.png`), buf);
  console.log(`Logo da liga baixado de ${logoUrl} para img/leagues/${liga}.png.`);
}

async function main() {
  const liga = argLiga();
  const leagues = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'leagues.json'), 'utf8'));
  await downloadLeagueLogo(liga, leagues[liga]);

  const teamsPath = path.join(ROOT, 'data', liga, 'teams.json');
  const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
  const badgesDir = path.join(ROOT, 'img', 'badges', liga);
  fs.mkdirSync(badgesDir, { recursive: true });

  let downloaded = 0;
  for (const [slug, team] of Object.entries(teams)) {
    if (!team.badgeSourceEspn) continue;
    const res = await fetch(team.badgeSourceEspn);
    if (res.status !== 200) {
      console.warn(`Falha ao baixar badge de ${slug} (HTTP ${res.status}) — mantendo badgeSourceEspn para nova tentativa.`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(badgesDir, `${slug}.png`), buf);
    downloaded += 1;

    delete team.badgeSourceEspn;
    delete team.fdName;
    delete team._reviewNeeded;
  }

  fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2) + '\n');
  console.log(`${downloaded}/${Object.keys(teams).length} badges baixados para ${badgesDir}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
