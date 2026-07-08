#!/usr/bin/env node
/**
 * scripts/post-match.js [--liga=bra-a]
 *
 * Cron pós-jogo (spec 5.2). Para cada liga active:
 *   1. Fixtures com kickoff + 2h no passado, ainda não 'finished', com
 *      espnEventId -> busca summary ESPN, cacheia em raw/summaries/{id}.json,
 *      marca 'finished' + score em fixtures.json.
 *   2. Reconstrói players.json e stats.json DO ZERO varrendo todos os
 *      summaries cacheados em ordem cronológica (nunca incremental — spec 4.5).
 *
 * A extração de eventos (gols/cartões/subs) usa o schema real validado na
 * Fase 0: keyEvents[].participants[0]=autor, participants[1]=assistência (gol)
 * ou saiu (substituição), scoringPlay:true marca gol de fato (incl. pênalti
 * convertido). Ver docs/fase0-bra-a.md.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function teamSlugByEspnId(teams, espnId) {
  for (const [slug, t] of Object.entries(teams)) {
    if (String(t.espnId) === String(espnId)) return slug;
  }
  return null;
}

function positionGroup(abbrev) {
  switch (abbrev) {
    case 'G': return 'G';
    case 'D': return 'D';
    case 'M': return 'M';
    case 'F': return 'A';
    default: return abbrev || null;
  }
}

async function fetchAndCacheSummaries(liga, cfg, teams, fixtures, rawDir) {
  const now = Date.now();
  const summariesDir = path.join(rawDir, 'summaries');
  fs.mkdirSync(summariesDir, { recursive: true });

  const candidates = fixtures.matches.filter((m) => {
    if (m.status === 'postponed') return false;
    if (!m.espnEventId) return false;
    if (m.status === 'finished') {
      // Já finalizado direto pela fonte canônica (ex.: bootstrap em meio à
      // temporada) — nunca passa por aqui de novo, então o único jeito de
      // pegar o summary (gols/assistências/cartões) é checar se ainda falta
      // cachear.
      return !fs.existsSync(path.join(summariesDir, `${m.espnEventId}.json`));
    }
    return now - new Date(m.date).getTime() > TWO_HOURS_MS;
  });

  let updated = 0;
  for (const m of candidates) {
    const url = `${ESPN_SITE_BASE}/${cfg.sources.espnSlug}/summary?event=${m.espnEventId}`;
    const res = await fetch(url);
    if (res.status !== 200) {
      console.warn(`[${liga}] falha ao buscar summary de ${m.id} (HTTP ${res.status}).`);
      continue;
    }
    const json = await res.json();
    const comp = json?.header?.competitions?.[0];
    if (!comp?.status?.type?.completed) {
      console.log(`[${liga}] ${m.id} ainda não finalizado na ESPN (${comp?.status?.type?.description || '?'}) — tentando de novo no próximo cron.`);
      continue;
    }

    fs.writeFileSync(path.join(rawDir, 'summaries', `${m.espnEventId}.json`), JSON.stringify(json, null, 2) + '\n');

    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    m.status = 'finished';
    m.score = { home: Number(home?.score ?? 0), away: Number(away?.score ?? 0) };
    updated += 1;
  }
  return updated;
}

function processSummary(json, teams, playersAgg, statsAgg) {
  const ensurePlayerStats = (pid) => {
    if (!statsAgg.players[pid]) statsAgg.players[pid] = { goals: 0, assists: 0, yellow: 0, red: 0 };
    return statsAgg.players[pid];
  };
  const ensureTeamStats = (slug) => {
    if (!statsAgg.teams[slug]) statsAgg.teams[slug] = { goals: 0, conceded: 0, yellow: 0, red: 0 };
    return statsAgg.teams[slug];
  };

  const matchDate = json?.header?.competitions?.[0]?.date;
  const teamSlugsInMatch = [];

  // 1) Elenco de cada time no jogo: identidade mínima + apps/debut/team.
  for (const rosterBlock of json.rosters || []) {
    const teamSlug = teamSlugByEspnId(teams, rosterBlock.team?.id);
    if (!teamSlug) continue;
    teamSlugsInMatch.push(teamSlug);
    ensureTeamStats(teamSlug);

    for (const entry of rosterBlock.roster || []) {
      const athleteId = entry.athlete?.id;
      if (!athleteId) continue;
      const pid = `p-espn-${athleteId}`;
      const appeared = Boolean(entry.starter || entry.subbedIn);

      if (!playersAgg[pid]) {
        playersAgg[pid] = {
          fullName: entry.athlete.fullName,
          shirtName: entry.athlete.shortName || entry.athlete.displayName,
          team: teamSlug,
          position: positionGroup(entry.position?.abbreviation),
          jersey: entry.jersey ? Number(entry.jersey) : null,
          birthdate: null,
          nationality: null,
          apps: 0,
          goals: 0,
          debut: null,
        };
      }
      const p = playersAgg[pid];

      // Súmula manda no time atual; transferência no meio da temporada zera
      // apps/goals/debut no clube novo (spec 4.4).
      if (p.team !== teamSlug) {
        p.team = teamSlug;
        p.apps = 0;
        p.goals = 0;
        p.debut = null;
      }
      // Nome/número/posição: a súmula mais recente processada vence (ordem
      // cronológica), aproximando o estado mais atual até o próximo roster-sync.
      p.fullName = entry.athlete.fullName;
      p.shirtName = entry.athlete.shortName || entry.athlete.displayName;
      p.position = positionGroup(entry.position?.abbreviation) || p.position;
      p.jersey = entry.jersey ? Number(entry.jersey) : p.jersey;

      if (appeared) {
        p.apps += 1;
        if (!p.debut) p.debut = matchDate ? matchDate.slice(0, 10) : null;
      }
    }
  }

  // 2) Eventos: gols (+ assistência), cartões.
  for (const ke of json.keyEvents || []) {
    const typeSlug = ke?.type?.type || '';
    const participants = ke?.participants || [];
    const teamSlug = teamSlugByEspnId(teams, ke?.team?.id);

    if (ke.scoringPlay === true) {
      const isOwnGoal = /own/i.test(typeSlug);
      const scorerId = participants[0]?.athlete?.id;
      const scorerPid = scorerId ? `p-espn-${scorerId}` : null;

      if (teamSlug) {
        ensureTeamStats(teamSlug).goals += 1;
        const oppSlug = teamSlugsInMatch.find((s) => s !== teamSlug);
        if (oppSlug) ensureTeamStats(oppSlug).conceded += 1;
      }
      if (scorerPid && !isOwnGoal) {
        if (playersAgg[scorerPid]) playersAgg[scorerPid].goals += 1;
        ensurePlayerStats(scorerPid).goals += 1;

        const assistId = participants[1]?.athlete?.id;
        if (assistId) ensurePlayerStats(`p-espn-${assistId}`).assists += 1;
      }
    } else if (typeSlug === 'yellow-card' || typeSlug === 'red-card') {
      const athleteId = participants[0]?.athlete?.id;
      const pid = athleteId ? `p-espn-${athleteId}` : null;
      const field = typeSlug === 'yellow-card' ? 'yellow' : 'red';
      if (pid) ensurePlayerStats(pid)[field] += 1;
      if (teamSlug) ensureTeamStats(teamSlug)[field] += 1;
    }
  }
}

function rebuildPlayersAndStats(liga, teams, rawDir, dataDir) {
  const summariesDir = path.join(rawDir, 'summaries');
  fs.mkdirSync(summariesDir, { recursive: true });
  const files = fs.readdirSync(summariesDir).filter((f) => f.endsWith('.json'));

  const summaries = files
    .map((f) => loadJson(path.join(summariesDir, f), null))
    .filter(Boolean)
    .sort((a, b) => new Date(a?.header?.competitions?.[0]?.date) - new Date(b?.header?.competitions?.[0]?.date));

  const playersAgg = {};
  const statsAgg = { players: {}, teams: {} };
  for (const summary of summaries) {
    processSummary(summary, teams, playersAgg, statsAgg);
  }

  // Identidade (birthdate/nationality) vem do roster-sync semanal e não deve
  // ser apagada por este rebuild, que só enxerga dados de súmula.
  const priorPlayers = loadJson(path.join(dataDir, 'players.json'), {});
  for (const [pid, prior] of Object.entries(priorPlayers)) {
    if (playersAgg[pid]) {
      playersAgg[pid].birthdate = prior.birthdate ?? null;
      playersAgg[pid].nationality = prior.nationality ?? null;
    } else {
      // Jogador registrado (roster-sync) que ainda não estreou: mantém.
      playersAgg[pid] = prior;
    }
  }

  fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify(playersAgg, null, 2) + '\n');
  statsAgg.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'stats.json'), JSON.stringify(statsAgg, null, 2) + '\n');
  console.log(`[${liga}] players.json: ${Object.keys(playersAgg).length} jogadores. stats.json: ${Object.keys(statsAgg.players).length} jogadores com stats, ${Object.keys(statsAgg.teams).length} times. (${summaries.length} summaries processados)`);
}

async function syncLeague(liga, cfg) {
  const dataDir = path.join(ROOT, 'data', liga);
  const rawDir = path.join(dataDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const teams = loadJson(path.join(dataDir, 'teams.json'), null);
  if (!teams) {
    console.log(`[${liga}] sem teams.json — pulando.`);
    return;
  }
  const fixturesPath = path.join(dataDir, 'fixtures.json');
  const fixtures = loadJson(fixturesPath, null);
  if (!fixtures) {
    console.log(`[${liga}] sem fixtures.json — pulando.`);
    return;
  }

  const updated = await fetchAndCacheSummaries(liga, cfg, teams, fixtures, rawDir);
  if (updated > 0) {
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n');
  }
  console.log(`[${liga}] ${updated} jogo(s) marcado(s) finished nesta rodada.`);

  rebuildPlayersAndStats(liga, teams, rawDir, dataDir);

  const metaPath = path.join(dataDir, 'meta.json');
  const meta = loadJson(metaPath, {});
  meta.lastPostMatchCron = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
}

async function main() {
  const onlyLiga = process.argv.find((a) => a.startsWith('--liga='))?.split('=')[1];
  const leagues = loadJson(path.join(ROOT, 'data', 'leagues.json'), {});

  const targets = Object.entries(leagues).filter(([slug, cfg]) => {
    if (onlyLiga) return slug === onlyLiga;
    return cfg.status === 'active';
  });

  for (const [slug, cfg] of targets) {
    try {
      await syncLeague(slug, cfg);
    } catch (err) {
      console.error(`[${slug}] falhou: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
