#!/usr/bin/env node
/**
 * scripts/check-espn-zones.js [--liga=bra-a]
 *
 * Diagnóstico único (não faz parte do pipeline normal): verifica se o
 * endpoint de standings da ESPN manda alguma anotação de zona/qualificação
 * por posição (ex.: "Promotion", "Champions League"), que é como outros
 * esportes da ESPN costumam marcar isso. Se existir e for confiável, dá pra
 * ler a zona direto da fonte em vez de cravar faixas de posição manualmente
 * em leagues.json (que muda por liga e por temporada).
 *
 * Escreve o JSON cru + um resumo em docs/ pra inspeção manual.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';

async function main() {
  const liga = process.argv.find((a) => a.startsWith('--liga='))?.split('=')[1] || 'bra-a';
  const leagues = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/leagues.json'), 'utf8'));
  const cfg = leagues[liga];
  if (!cfg) throw new Error(`Liga ${liga} não encontrada em leagues.json.`);
  const espnSlug = cfg.sources?.espnSlug;
  if (!espnSlug) throw new Error(`Liga ${liga} sem sources.espnSlug configurado.`);

  const url = `${ESPN_STANDINGS_BASE}/${espnSlug}/standings`;
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} em ${url}`);
  const json = await res.json();

  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', `espn-standings-raw-${liga}.json`), JSON.stringify(json, null, 2) + '\n');

  const groups = json?.children || (json?.standings ? [{ standings: json.standings }] : []);
  const summary = [];
  for (const group of groups) {
    const entries = group?.standings?.entries || [];
    for (const e of entries) {
      const rank = (e.stats || []).find((s) => s.name === 'rank')?.value ?? null;
      summary.push({
        team: e.team?.displayName,
        rank,
        note: e.note || null, // { color, description, rank } se a ESPN mandar
      });
    }
  }
  fs.writeFileSync(path.join(ROOT, 'docs', `espn-standings-notes-${liga}.json`), JSON.stringify(summary, null, 2) + '\n');

  const withNote = summary.filter((s) => s.note);
  console.log(`[${liga}] ${summary.length} time(s) no standings ESPN, ${withNote.length} com campo "note" preenchido.`);
  console.log(JSON.stringify(withNote.slice(0, 5), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
