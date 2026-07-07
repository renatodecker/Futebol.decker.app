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

function argLiga() {
  const arg = process.argv.find((a) => a.startsWith('--liga='));
  return arg ? arg.split('=')[1] : 'bra-a';
}

async function main() {
  const liga = argLiga();
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
