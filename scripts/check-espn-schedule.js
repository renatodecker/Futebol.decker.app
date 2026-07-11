#!/usr/bin/env node
/**
 * scripts/check-espn-schedule.js --liga=bra-b [--date=YYYYMMDD]
 *
 * Diagnóstico único (não faz parte do pipeline normal): dá uma olhada crua no
 * scoreboard da ESPN pra descobrir se existe algum campo de rodada/matchday
 * (ex.: "week", "leagues[].calendar", nota por evento) que dê pra usar em vez
 * de inferir rodada por ordem cronológica — o que se mostrou pouco confiável
 * pra ligas com muito jogo adiado/remarcado fora de ordem (ver comentário em
 * scripts/daily-sync.js, assignRoundsByConflict).
 *
 * Também testa se o endpoint aceita range de datas (dates=YYYYMMDD-YYYYMMDD),
 * o que evitaria varrer a temporada dia a dia.
 *
 * Escreve o JSON cru + um resumo em docs/ pra inspeção manual.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

function argVal(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : fallback;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: res.status, json };
}

async function main() {
  const liga = argVal('liga', 'bra-b');
  const date = argVal('date', todayStr());
  const leagues = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'leagues.json'), 'utf8'));
  const cfg = leagues[liga];
  if (!cfg) throw new Error(`Liga ${liga} não encontrada em leagues.json.`);
  const espnSlug = cfg.sources?.espnSlug;
  if (!espnSlug) throw new Error(`Liga ${liga} sem sources.espnSlug configurado.`);

  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });

  // 1. Scoreboard num dia único — inspeciona shape completo (top-level +
  //    primeiro evento), procurando "week"/"calendar"/qualquer nota de rodada.
  const singleUrl = `${ESPN_SITE_BASE}/${espnSlug}/scoreboard?dates=${date}`;
  const single = await getJson(singleUrl);
  fs.writeFileSync(path.join(ROOT, 'docs', `espn-scoreboard-raw-${liga}.json`), JSON.stringify(single.json, null, 2) + '\n');

  const notes = [];
  notes.push(`# Diagnóstico · schedule/round da ESPN — ${cfg.name} (${liga})`);
  notes.push('');
  notes.push(`Gerado em: ${new Date().toISOString()}`);
  notes.push(`espnSlug: \`${espnSlug}\` | data testada: \`${date}\``);
  notes.push('');
  notes.push('## 1. Scoreboard de um dia');
  notes.push('');
  notes.push(`- HTTP ${single.status}, ${single.json?.events?.length ?? 0} evento(s).`);
  notes.push(`- Chaves de topo: ${single.json ? Object.keys(single.json).join(', ') : 'n/a'}`);
  const hasWeek = single.json && 'week' in single.json;
  notes.push(`- Campo "week" no topo: ${hasWeek ? JSON.stringify(single.json.week) : 'ausente'}`);
  const leaguesArr = single.json?.leagues || [];
  notes.push(`- leagues[0] chaves: ${leaguesArr[0] ? Object.keys(leaguesArr[0]).join(', ') : 'n/a'}`);
  const calendar = leaguesArr[0]?.calendar;
  notes.push(`- leagues[0].calendar: ${calendar ? `presente, ${calendar.length} entrada(s) — amostra: ${JSON.stringify(calendar.slice(0, 3))}` : 'ausente'}`);
  if (single.json?.events?.[0]) {
    const ev = single.json.events[0];
    notes.push(`- events[0] chaves: ${Object.keys(ev).join(', ')}`);
    notes.push(`- events[0].week: ${'week' in ev ? JSON.stringify(ev.week) : 'ausente'}`);
    const comp = ev.competitions?.[0];
    notes.push(`- events[0].competitions[0] chaves: ${comp ? Object.keys(comp).join(', ') : 'n/a'}`);
    notes.push(`- events[0].competitions[0].notes: ${comp?.notes ? JSON.stringify(comp.notes) : 'ausente/vazio'}`);
  }
  notes.push('');

  // 2. Testa se dá pra pedir um intervalo de datas de uma vez.
  const rangeStart = date;
  const rangeEndDate = new Date(
    Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + 14,
  );
  const rangeEnd = rangeEndDate.toISOString().slice(0, 10).replace(/-/g, '');
  const rangeUrl = `${ESPN_SITE_BASE}/${espnSlug}/scoreboard?dates=${rangeStart}-${rangeEnd}`;
  const range = await getJson(rangeUrl);
  const rangeDatesSeen = new Set((range.json?.events || []).map((e) => e.date?.slice(0, 10)));
  notes.push('## 2. Range de datas (14 dias)');
  notes.push('');
  notes.push(`- URL: ${rangeUrl}`);
  notes.push(`- HTTP ${range.status}, ${range.json?.events?.length ?? 0} evento(s), ${rangeDatesSeen.size} dia(s) distinto(s) nos eventos.`);
  notes.push(`- Suporta range: ${rangeDatesSeen.size > 1 ? 'PARECE QUE SIM (múltiplos dias num request só)' : 'não confirmado (só 1 dia ou 0 eventos — pode ser range não suportado, ou não ter jogo nesse período)'}`);
  notes.push('');

  const outPath = path.join(ROOT, 'docs', `espn-schedule-notes-${liga}.md`);
  fs.writeFileSync(outPath, notes.join('\n'));
  console.log(`Relatório escrito em ${outPath}`);
  console.log(notes.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
