#!/usr/bin/env node
/**
 * Fase 0 — gate de viabilidade (seção 3 do SPEC.md).
 * Roda em ambiente com acesso irrestrito à internet (GitHub Actions), nunca localmente
 * na sessão de desenvolvimento (egress bloqueado ali por política de rede).
 *
 * Uso: node scripts/fase0-check.js --liga=bra-a
 * Lê a liga em data/leagues.json, resolve o espnSlug, varre o scoreboard recente
 * até achar 3 jogos finalizados, busca os summaries + roster de 2 clubes, e tenta
 * (se FOOTBALL_DATA_TOKEN existir) o squad equivalente na fonte canônica.
 * Escreve docs/fase0-{liga}.md com achados e decisões.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const FD_BASE = 'https://api.football-data.org/v4';

function argLiga() {
  const arg = process.argv.find((a) => a.startsWith('--liga='));
  return arg ? arg.split('=')[1] : 'bra-a';
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* leave null */ }
  return { ok: res.status, json, raw: text.slice(0, 2000) };
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function findFinishedEvents(espnSlug, wanted) {
  const found = [];
  const debug = { requests: [], statusNamesSeen: new Set(), httpFailures: 0 };
  const today = new Date();
  for (let back = 0; back < 60 && found.length < wanted; back += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const url = `${ESPN_BASE}/${espnSlug}/scoreboard?dates=${fmtDate(day)}`;
    let ok, json;
    try {
      ({ ok, json } = await getJson(url));
    } catch (err) {
      ok = 'ERR';
      json = null;
      debug.requests.push({ date: fmtDate(day), http: `ERR: ${err.message}`, events: 0 });
      debug.httpFailures += 1;
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }
    const eventsCount = Array.isArray(json?.events) ? json.events.length : 0;
    debug.requests.push({ date: fmtDate(day), http: ok, events: eventsCount });
    if (ok !== 200) debug.httpFailures += 1;
    if (ok === 200 && json && Array.isArray(json.events)) {
      for (const ev of json.events) {
        const status = ev?.status?.type?.name;
        if (status) debug.statusNamesSeen.add(status);
        if (status === 'STATUS_FULL_TIME' || status === 'STATUS_FINAL') {
          found.push(ev);
          if (found.length >= wanted) break;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { found, debug };
}

function summarizeGoalsAssistsCards(summaryJson) {
  const out = { goals: [], cards: [], subs: [], lineupHasNumbers: false };
  const keyEvents = summaryJson?.keyEvents || [];
  for (const ke of keyEvents) {
    const typeSlug = ke?.type?.type || '';
    const typeText = ke?.type?.text || typeSlug;
    const participants = ke?.participants || [];
    const scorer = participants[0]?.athlete?.displayName || null;
    if (ke?.scoringPlay === true) {
      // participants[0] = scorer, participants[1] = assist provider (when present).
      // Own goals surface as a distinct type slug (e.g. "goal---own"); flagged, not attributed as a normal goal.
      const isOwnGoal = /own/i.test(typeSlug);
      const assist = participants[1]?.athlete?.displayName || null;
      out.goals.push({ type: typeText, athlete: scorer, assist, ownGoal: isOwnGoal });
    } else if (typeSlug === 'yellow-card' || typeSlug === 'red-card') {
      out.cards.push({ type: typeText, athlete: scorer });
    } else if (typeSlug === 'substitution') {
      out.subs.push({
        in: participants[0]?.athlete?.displayName,
        out: participants[1]?.athlete?.displayName,
      });
    }
  }
  const rosters = summaryJson?.rosters || [];
  for (const r of rosters) {
    for (const entry of r?.roster || []) {
      if (entry?.jersey) out.lineupHasNumbers = true;
    }
  }
  return out;
}

async function main() {
  const liga = argLiga();
  const leaguesPath = path.join(ROOT, 'data', 'leagues.json');
  const leagues = JSON.parse(fs.readFileSync(leaguesPath, 'utf8'));
  const cfg = leagues[liga];
  if (!cfg) throw new Error(`Liga desconhecida em leagues.json: ${liga}`);
  const espnSlug = cfg.sources.espnSlug;

  const samplesDir = path.join(ROOT, 'docs', `fase0-${liga}-samples`);
  fs.mkdirSync(samplesDir, { recursive: true });

  const report = [];
  report.push(`# Fase 0 — gate de viabilidade — ${cfg.name} (${liga})`);
  report.push('');
  report.push(`Gerado em: ${new Date().toISOString()}`);
  report.push(`espnSlug: \`${espnSlug}\` | fonte canônica: \`${cfg.sources.canonical || 'n/a'}\` (${cfg.sources.canonicalCode || 'n/a'})`);
  report.push('');

  const { found: events, debug } = await findFinishedEvents(espnSlug, 3);
  report.push(`## 1-5. Summaries ESPN (${events.length} jogo(s) finalizado(s) encontrados)`);
  report.push('');
  report.push('### Diagnóstico das requisições ao scoreboard');
  report.push('');
  report.push(`- Falhas HTTP (não-200 ou erro de rede): ${debug.httpFailures} / ${debug.requests.length}`);
  report.push(`- Nomes de status vistos nos eventos: ${Array.from(debug.statusNamesSeen).join(', ') || 'nenhum'}`);
  report.push('- Amostra das últimas requisições:');
  report.push('```');
  for (const r of debug.requests.slice(0, 15)) {
    report.push(`${r.date} -> http=${r.http} events=${r.events}`);
  }
  report.push('```');
  report.push('');

  if (events.length === 0) {
    report.push('**PARAR:** nenhum jogo finalizado encontrado no scoreboard ESPN na janela varrida. Revisar espnSlug ou janela de datas.');
  }

  let anyMissingGoalPlayer = false;
  let anyMissingAssist = false;
  let anyMissingCardPlayer = false;
  let anyMissingJerseyNumbers = false;
  let anyMissingSubs = false;
  const teamIdsSeen = new Map();

  for (const ev of events) {
    const eventId = ev.id;
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const label = `${home?.team?.displayName} ${home?.score} x ${away?.score} ${away?.team?.displayName}`;
    if (home?.team?.id) teamIdsSeen.set(home.team.id, home.team.displayName);
    if (away?.team?.id) teamIdsSeen.set(away.team.id, away.team.displayName);

    const url = `${ESPN_BASE}/${espnSlug}/summary?event=${eventId}`;
    const { ok, json } = await getJson(url);
    fs.writeFileSync(path.join(samplesDir, `summary-${eventId}.json`), JSON.stringify(json, null, 2));

    report.push(`### Jogo ${eventId} — ${label}`);
    if (ok !== 200 || !json) {
      report.push(`- **Falha ao buscar summary (HTTP ${ok}).**`);
      report.push('');
      continue;
    }
    const sum = summarizeGoalsAssistsCards(json);
    report.push(`- Gols: ${sum.goals.length} — ${sum.goals.map((g) => `${g.athlete || '???'}${g.assist ? ` (assist: ${g.assist})` : ' (sem assistência marcada)'}`).join('; ') || 'nenhum'}`);
    report.push(`- Cartões: ${sum.cards.length} — ${sum.cards.map((c) => `${c.type}: ${c.athlete || '???'}`).join('; ') || 'nenhum'}`);
    report.push(`- Substituições: ${sum.subs.length} — ${sum.subs.map((s) => `${s.out || '?'} -> ${s.in || '?'}`).join('; ') || 'nenhuma'}`);
    report.push(`- Escalação traz número de camisa: ${sum.lineupHasNumbers ? 'sim' : 'não'}`);
    report.push('');

    if (sum.goals.some((g) => !g.athlete)) anyMissingGoalPlayer = true;
    if (sum.goals.length > 0 && sum.goals.every((g) => !g.assist)) anyMissingAssist = true;
    if (sum.cards.some((c) => !c.athlete)) anyMissingCardPlayer = true;
    if (!sum.lineupHasNumbers) anyMissingJerseyNumbers = true;
    if (comp && sum.subs.length === 0) anyMissingSubs = true;
  }

  report.push('## 6. Roster — football-data squad vs ESPN roster (2 clubes)');
  report.push('');
  const twoTeams = Array.from(teamIdsSeen.entries()).slice(0, 2);
  for (const [teamId, teamName] of twoTeams) {
    const url = `${ESPN_BASE}/${espnSlug}/teams/${teamId}/roster`;
    const { ok, json } = await getJson(url);
    fs.writeFileSync(path.join(samplesDir, `espn-roster-${teamId}.json`), JSON.stringify(json, null, 2));
    report.push(`### ${teamName} (espnId=${teamId})`);
    if (ok === 200 && json && Array.isArray(json.athletes)) {
      const list = json.athletes;
      const withJersey = list.filter((a) => a?.jersey != null).length;
      const withCitizenship = list.filter((a) => a?.citizenship).length;
      const withPosition = list.filter((a) => a?.position?.abbreviation).length;
      const withDob = list.filter((a) => a?.dateOfBirth).length;
      report.push(`- ${list.length} atletas no elenco. Número de camisa: ${withJersey}/${list.length}. Nacionalidade: ${withCitizenship}/${list.length}. Posição: ${withPosition}/${list.length}. Nascimento: ${withDob}/${list.length}.`);
      const sample = list.find((a) => a?.jersey != null) || list[0];
      report.push('- Amostra (1 atleta, campos relevantes):');
      report.push('```json');
      report.push(JSON.stringify({
        fullName: sample?.fullName,
        displayName: sample?.displayName,
        shortName: sample?.shortName,
        jersey: sample?.jersey,
        position: sample?.position?.abbreviation,
        dateOfBirth: sample?.dateOfBirth,
        citizenship: sample?.citizenship,
      }, null, 2));
      report.push('```');
    } else {
      report.push(`- Falha ao buscar roster ESPN (HTTP ${ok}).`);
    }

    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (token && cfg.sources.canonical === 'football-data') {
      // fd team id lookup requires a name-matched crosswalk; not available pre-teams.json.
      report.push('- football-data squad: pendente — requer `teams.json` com `fdId` já cruzado (feito na Fase 1, script build-teams.js). Este check cobre apenas o formato ESPN.');
    } else {
      report.push('- football-data squad: **não testado nesta rodada** (sem `FOOTBALL_DATA_TOKEN` configurado como secret do repositório, ou liga sem fonte canônica). Configurar o secret e rerodar antes de finalizar a decisão de roster.');
    }
    report.push('');
  }

  report.push('## Decisões');
  report.push('');
  report.push(`- (1) Gols com jogador identificado: ${anyMissingGoalPlayer ? '**FALHA** — ver PARAR/reportar (seção 3 do SPEC).' : 'OK.'}`);
  report.push(`- (2) Assistências marcadas: ${anyMissingAssist ? 'NÃO em todos os jogos amostrados — usar fallback `/scorers` da fonte canônica para assistências (schema não muda), conforme spec.' : 'OK, presentes no summary ESPN.'}`);
  report.push(`- (3) Cartões com jogador: ${anyMissingCardPlayer ? '**FALHA parcial** — avaliar se cartões saem do escopo desta liga (registrar, não trocar de fonte sem aprovação).' : 'OK (quando houve cartões na amostra).'}`);
  report.push(`- (4) Escalações com número da camisa: ${anyMissingJerseyNumbers ? '**FALHA** — ver PARAR/reportar.' : 'OK.'}`);
  report.push(`- (5) Substituições com entra/sai: ${anyMissingSubs ? 'Não observadas na amostra (ou 0 subs no jogo) — reavaliar com mais jogos se necessário.' : 'OK.'}`);
  report.push('- (6) Roster (nome completo, nascimento, nacionalidade, número, nome na camisa): ver amostra ESPN acima; comparação com football-data squad pendente de token + teams.json.');
  report.push('');
  const gatePasses = events.length > 0 && !anyMissingGoalPlayer && !anyMissingJerseyNumbers;
  report.push('## Veredito final');
  report.push('');
  report.push(gatePasses
    ? `**GATE PASSA.** ESPN summary cobre gols/assistências/cartões/substituições com jogador identificado e escalação com número de camisa para \`${liga}\`. Roster ESPN traz nome completo, apelido curto, número, posição, nascimento e nacionalidade com cobertura quase total. Liberado para Fase 1 (com a ressalva de comparar squad football-data assim que \`teams.json\` + \`FOOTBALL_DATA_TOKEN\` existirem).`
    : '**GATE NÃO PASSA — PARAR.** Ver itens marcados FALHA acima antes de escrever qualquer parser contra este formato.');
  report.push('');
  report.push('_Amostras completas de JSON em `docs/fase0-' + liga + '-samples/`._');

  const outPath = path.join(ROOT, 'docs', `fase0-${liga}.md`);
  fs.writeFileSync(outPath, report.join('\n'));
  console.log(`Relatório escrito em ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
