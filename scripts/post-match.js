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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

// A súmula ESPN (roster de cada partida) usa abreviações bem mais granulares
// (ex.: "CD-L", "AM-R", "LB", "SUB") do que o roster do time (endpoint usado
// por roster-sync.js, que já vem simplificado em G/D/M/F). Sem esse mapa,
// qualquer abreviação fora de G/D/M/F passava direto pro campo `position` do
// jogador (ex.: "CD-R"), e squad.js — que só reconhece G/D/M/A — jogava esse
// jogador pro balde de meio-campo por default (bug: zagueiros aparecendo como
// meio-campistas). "SUB" (reserva não utilizado nesse jogo específico) não
// informa posição de fato — devolve null pra não sobrescrever uma posição já
// conhecida (de um summary anterior ou do roster-sync).
const CANONICAL_POSITIONS = new Set(['G', 'D', 'M', 'A']);
const DEFENDER_ABBREVS = new Set(['D', 'LB', 'RB', 'SW']);
const MIDFIELDER_ABBREVS = new Set(['M', 'DM', 'AM', 'AM-L', 'AM-R', 'LM', 'RM']);
const FORWARD_ABBREVS = new Set(['F', 'RF', 'LF', 'RCF']);

function positionGroup(abbrev) {
  if (!abbrev || abbrev === 'SUB') return null;
  if (abbrev === 'G') return 'G';
  if (abbrev.startsWith('CD')) return 'D';
  if (abbrev.startsWith('CM')) return 'M';
  if (abbrev.startsWith('CF')) return 'A';
  if (DEFENDER_ABBREVS.has(abbrev)) return 'D';
  if (MIDFIELDER_ABBREVS.has(abbrev)) return 'M';
  if (FORWARD_ABBREVS.has(abbrev)) return 'A';
  return null;
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
    applyVenueInfo(m, json);
    updated += 1;
    await sleep(250);
  }
  return updated;
}

// A ESPN às vezes traz o nome "de cartório" do estádio, desatualizado (nome
// antigo, trocado há anos) ou pouco reconhecível — não o nome que a torcida
// e a mídia realmente usam. Mapa curado à mão (verificado, não adivinhado);
// só entram aqui casos confirmados, não um "apelido" qualquer.
const VENUE_ALIASES = {
  'Joao Havelange Stadium': 'Estádio Nilton Santos', // renomeado em 2015/2017; nome antigo não existe mais
  'Estádio Cícero Pompeu de Toledo': 'Morumbi', // nome oficial de cartório; ninguém chama assim
  'Estadio Manoel Barradas': 'Barradão', // idem — nome oficial de cartório
};

// Estádio + público (spec: indicativo de estádio/público em cards e no modal
// de partida) vêm do gameInfo da súmula ESPN, não da fonte canônica — só
// existem depois que o summary foi cacheado.
function applyVenueInfo(m, summaryJson) {
  const gameInfo = summaryJson?.gameInfo;
  let venueName = gameInfo?.venue?.fullName || null;
  if (venueName && VENUE_ALIASES[venueName]) venueName = VENUE_ALIASES[venueName];
  if (venueName) m.venue = venueName;
  if (typeof gameInfo?.attendance === 'number') m.attendance = gameInfo.attendance;
}

// Backfill sem rede: preenche venue/attendance de jogos já finalizados cujo
// summary já está em cache mas ainda não tinha sido lido pra esses campos
// (ex.: summaries baixados antes desse campo existir).
function backfillVenueFromCache(fixtures, summariesDir) {
  let filled = 0;
  for (const m of fixtures.matches) {
    if (!m.espnEventId) continue;
    if (m.venue && typeof m.attendance === 'number') continue;
    const cachePath = path.join(summariesDir, `${m.espnEventId}.json`);
    if (!fs.existsSync(cachePath)) continue;
    const summary = loadJson(cachePath, null);
    if (!summary) continue;
    const before = `${m.venue}|${m.attendance}`;
    applyVenueInfo(m, summary);
    if (`${m.venue}|${m.attendance}` !== before) filled += 1;
  }
  return filled;
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

function normalizeName(name) {
  return (name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function identityScore(p) {
  let score = 0;
  if (p.birthdate) score += 2;
  if (p.nationality) score += 1;
  if (p.fullName && p.fullName === p.fullName.trim()) score += 1;
  return score;
}

// A ESPN às vezes cadastra o mesmo jogador com IDs de atleta diferentes em
// endpoints diferentes (ex.: o roster do time retorna um ID, mas o roster
// de uma súmula específica retorna outro ID pra essa mesma pessoa) — isso
// gera entradas duplicadas no elenco. Junta por (time, nome normalizado),
// somando apps/gols e mantendo a identidade mais completa como canônica.
function dedupePlayers(playersAgg, statsAgg) {
  const groups = new Map();
  for (const [pid, p] of Object.entries(playersAgg)) {
    const key = `${p.team}|${normalizeName(p.fullName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pid);
  }

  for (const pids of groups.values()) {
    if (pids.length < 2) continue;
    pids.sort((a, b) => identityScore(playersAgg[b]) - identityScore(playersAgg[a]));
    const [keepId, ...dropIds] = pids;
    const keep = playersAgg[keepId];
    for (const dropId of dropIds) {
      const drop = playersAgg[dropId];
      keep.apps = (keep.apps || 0) + (drop.apps || 0);
      keep.goals = (keep.goals || 0) + (drop.goals || 0);
      if (drop.debut && (!keep.debut || drop.debut < keep.debut)) keep.debut = drop.debut;
      delete playersAgg[dropId];

      const dropStats = statsAgg.players[dropId];
      if (dropStats) {
        const keepStats = statsAgg.players[keepId] || { goals: 0, assists: 0, yellow: 0, red: 0 };
        keepStats.goals += dropStats.goals || 0;
        keepStats.assists += dropStats.assists || 0;
        keepStats.yellow += dropStats.yellow || 0;
        keepStats.red += dropStats.red || 0;
        statsAgg.players[keepId] = keepStats;
        delete statsAgg.players[dropId];
      }
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

  // Identidade (birthdate/nationality/active) vem do roster-sync semanal e não
  // deve ser apagada por este rebuild, que só enxerga dados de súmula.
  const priorPlayers = loadJson(path.join(dataDir, 'players.json'), {});
  for (const [pid, prior] of Object.entries(priorPlayers)) {
    if (playersAgg[pid]) {
      playersAgg[pid].birthdate = prior.birthdate ?? null;
      playersAgg[pid].nationality = prior.nationality ?? null;
      // Jogador que nunca teve uma súmula com posição granular reconhecida
      // (ex.: sempre "SUB" por nunca ter entrado em campo) cai pra identidade
      // do roster-sync em vez de ficar sem posição — mas só se o valor prévio
      // já for um dos 4 grupos canônicos (registros antigos, de antes desse
      // mapeamento existir, podem ter abreviação crua tipo "CD-R"/"SUB").
      const priorPosition = CANONICAL_POSITIONS.has(prior.position) ? prior.position : null;
      playersAgg[pid].position = playersAgg[pid].position || priorPosition;
      // "active" (ainda no elenco atual do clube) é decidido pelo roster-sync
      // semanal, não pela súmula — default true até o primeiro roster-sync.
      playersAgg[pid].active = prior.active ?? true;
    } else {
      // Jogador registrado (roster-sync) que ainda não estreou: mantém.
      playersAgg[pid] = prior;
    }
  }

  dedupePlayers(playersAgg, statsAgg);

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
  const backfilled = backfillVenueFromCache(fixtures, path.join(rawDir, 'summaries'));
  if (updated > 0 || backfilled > 0) {
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n');
  }
  console.log(`[${liga}] ${updated} jogo(s) marcado(s) finished nesta rodada. ${backfilled} jogo(s) com venue/attendance preenchido(s) do cache.`);

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
