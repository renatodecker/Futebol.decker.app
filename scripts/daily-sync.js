#!/usr/bin/env node
/**
 * scripts/daily-sync.js [--liga=bra-a]
 *
 * Cron diário (seção 5.1 do SPEC.md). Para cada liga `active` em leagues.json
 * (ou só a passada em --liga):
 *
 * Com fonte canônica (football-data) configurada (ex.: bra-a):
 *   1. football-data matches  -> fixtures.json (datas/adiamentos; nunca rebaixa
 *      um jogo já 'finished' por post-match.js, só sobrescreve score se a
 *      fonte canônica divergir — e loga)
 *   2. football-data standings -> standings.json
 *   3. football-data scorers  -> raw/scorers.json (fallback de assistências)
 *   4. Casa espnEventId dos jogos dos próximos 7 dias via ESPN scoreboard
 *
 * Sem fonte canônica (ex.: bra-b — football-data free tier não cobre Série
 * B): fixtures.json e standings.json são reconstruídos 100% a partir da ESPN
 * (scoreboard varrido dia a dia pra achar os jogos da temporada, standings
 * via endpoint de classificação) — ver syncFixturesAndStandingsEspn.
 *
 * Em ambos os casos, ao final: recalcula currentRound e liveWindows -> meta.json.
 *
 * Roster sync (identidade de elenco) e post-match (súmulas/stats) já são
 * 100% ESPN desde sempre — não dependem de fonte canônica.
 *
 * Roda em GitHub Actions (internet irrestrita). Precisa de FOOTBALL_DATA_TOKEN
 * só quando alguma liga alvo usa fonte canônica.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FD_BASE = 'https://api.football-data.org/v4';
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';
const FD_SLEEP_MS = 6500; // ~10 req/min no free tier
const ESPN_SCAN_SLEEP_MS = 150;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fdGet(pathname, token) {
  const res = await fetch(`${FD_BASE}${pathname}`, { headers: { 'X-Auth-Token': token } });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`football-data ${pathname} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function mapStatus(fdStatus) {
  switch (fdStatus) {
    case 'FINISHED':
      return 'finished';
    case 'POSTPONED':
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'postponed';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    default:
      return 'scheduled';
  }
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function teamSlugByFdId(teams, fdId) {
  for (const [slug, t] of Object.entries(teams)) {
    if (t.fdId === fdId) return slug;
  }
  return null;
}

function computeForm(fixtures, teamSlug, lastN = 5) {
  const played = fixtures.matches
    .filter((m) => m.status === 'finished' && m.score && (m.home === teamSlug || m.away === teamSlug))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return played.slice(-lastN).map((m) => {
    const isHome = m.home === teamSlug;
    const gf = isHome ? m.score.home : m.score.away;
    const ga = isHome ? m.score.away : m.score.home;
    if (gf > ga) return 'W';
    if (gf < ga) return 'L';
    return 'D';
  });
}

function zoneForPosition(pos, zoneBands) {
  const band = zoneBands.find((z) => pos >= z.from && pos <= z.to);
  return band ? band.id : null;
}

function teamSlugByEspnId(teams, espnId) {
  for (const [slug, t] of Object.entries(teams)) {
    if (String(t.espnId) === String(espnId)) return slug;
  }
  return null;
}

async function syncFixturesAndStandings(liga, cfg, teams, token) {
  const dataDir = path.join(ROOT, 'data', liga);
  const rawDir = path.join(dataDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const code = cfg.sources.canonicalCode;

  // 1. Fixtures --------------------------------------------------------
  const matchesResp = await fdGet(`/competitions/${code}/matches`, token);
  await sleep(FD_SLEEP_MS);

  const fixturesPath = path.join(dataDir, 'fixtures.json');
  const existing = loadJson(fixturesPath, { season: cfg.season, currentRound: 1, matches: [] });
  const existingById = new Map(existing.matches.map((m) => [m.id, m]));

  let overrides = 0;
  let unmatchedTeams = 0;
  const matches = [];
  for (const fm of matchesResp.matches || []) {
    const homeSlug = teamSlugByFdId(teams, fm.homeTeam?.id);
    const awaySlug = teamSlugByFdId(teams, fm.awayTeam?.id);
    if (!homeSlug || !awaySlug) {
      unmatchedTeams += 1;
      continue;
    }
    const round = fm.matchday;
    const id = `r${round}-${homeSlug}-${awaySlug}`;
    const prior = existingById.get(id);
    const newStatus = mapStatus(fm.status);
    const newScore = fm.status === 'FINISHED'
      ? { home: fm.score?.fullTime?.home ?? null, away: fm.score?.fullTime?.away ?? null }
      : null;

    let status = newStatus;
    let score = newScore;
    if (prior?.status === 'finished') {
      // post-match.js é dono do resultado final; só aceitamos divergência
      // explícita da fonte canônica (W.O./decisão de tribunal), e logamos.
      status = 'finished';
      score = prior.score;
      if (newStatus === 'finished' && newScore
        && (newScore.home !== prior.score?.home || newScore.away !== prior.score?.away)) {
        console.warn(`[${liga}] placar de ${id} divergente: fonte canônica ${JSON.stringify(newScore)} vs registrado ${JSON.stringify(prior.score)} — sobrescrevendo com a fonte canônica.`);
        score = newScore;
        overrides += 1;
      }
    }

    matches.push({
      id,
      round,
      date: fm.utcDate,
      home: homeSlug,
      away: awaySlug,
      status,
      score,
      espnEventId: prior?.espnEventId ?? null,
      // venue: a súmula ESPN (post-match.js) manda no nome do estádio quando
      // disponível — mais completo que o texto cru da fonte canônica.
      venue: prior?.venue || fm.venue || null,
      attendance: prior?.attendance ?? null,
    });
  }
  if (unmatchedTeams > 0) {
    console.warn(`[${liga}] ${unmatchedTeams} partida(s) da fonte canônica com time sem fdId em teams.json — ignoradas.`);
  }

  const fixtures = { season: cfg.season, currentRound: existing.currentRound, matches };
  fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n');
  console.log(`[${liga}] fixtures.json: ${matches.length} partidas (${overrides} placar(es) sobrescrito(s) por divergência).`);

  // 2. Standings ---------------------------------------------------------
  const standingsResp = await fdGet(`/competitions/${code}/standings`, token);
  await sleep(FD_SLEEP_MS);

  const totalTable = (standingsResp.standings || []).find((s) => s.type === 'TOTAL');
  const zoneBands = cfg.rules?.zoneBands || [];
  const table = (totalTable?.table || []).map((row) => {
    const slug = teamSlugByFdId(teams, row.team?.id);
    return {
      pos: row.position,
      team: slug,
      pts: row.points,
      played: row.playedGames,
      won: row.won,
      drawn: row.draw,
      lost: row.lost,
      gf: row.goalsFor,
      ga: row.goalsAgainst,
      gd: row.goalDifference,
      // football-data (plano free) não manda "form" nem "group"/zona pra
      // essa competição — calculamos form a partir do nosso próprio
      // fixtures.json, e zona a partir da faixa de posição configurada em
      // leagues.json (regra fixa do regulamento, não depende de API).
      form: computeForm(fixtures, slug),
      zone: zoneForPosition(row.position, zoneBands),
    };
  });

  const standingsPath = path.join(dataDir, 'standings.json');
  const standingsOut = {
    updatedAt: new Date().toISOString(),
    table,
    zones: zoneBands.map((z) => ({ id: z.id, label: z.label, color: z.color })),
  };
  fs.writeFileSync(standingsPath, JSON.stringify(standingsOut, null, 2) + '\n');
  console.log(`[${liga}] standings.json: ${table.length} times, ${zoneBands.length} zona(s) configurada(s).`);

  // 3. Scorers (fallback de assistências) --------------------------------
  const scorersResp = await fdGet(`/competitions/${code}/scorers?limit=100`, token);
  await sleep(FD_SLEEP_MS);
  fs.writeFileSync(path.join(rawDir, 'scorers.json'), JSON.stringify(scorersResp, null, 2) + '\n');

  return { fixtures, standings: standingsOut };
}

function localBucketDay(isoDate, utcOffsetMinutes) {
  // ESPN agrupa o scoreboard pelo dia local da partida, não pelo dia UTC:
  // jogos com kickoff no fim da noite local (ex.: 21:30 no Brasil) cruzam
  // pra o dia seguinte em UTC, mas a ESPN continua listando no dia local.
  const shifted = new Date(new Date(isoDate).getTime() + (utcOffsetMinutes || 0) * 60000);
  return shifted.toISOString().slice(0, 10).replace(/-/g, '');
}

async function matchEspnEvents(liga, cfg, teams, fixtures) {
  // Casa espnEventId para QUALQUER jogo que ainda não tenha um, usando a
  // própria data do jogo (não uma janela fixa de "próximos 7 dias"): jogos
  // já finalizados na primeira carga (bootstrap em meio à temporada) nunca
  // passam pelo status "scheduled" de novo, então uma janela olhando só pra
  // frente nunca os alcançaria — post-match.js ficaria pra sempre sem como
  // buscar o summary desses jogos.
  const espnSlug = cfg.sources.espnSlug;
  const utcOffsetMinutes = cfg.sources.utcOffsetMinutes || 0;
  const targets = fixtures.matches.filter((m) => !m.espnEventId);
  if (targets.length === 0) return 0;

  const dates = new Set(targets.map((m) => localBucketDay(m.date, utcOffsetMinutes)));
  const eventsByDate = new Map();
  for (const day of dates) {
    const url = `${ESPN_SITE_BASE}/${espnSlug}/scoreboard?dates=${day}`;
    const res = await fetch(url);
    if (res.status !== 200) continue;
    const json = await res.json();
    eventsByDate.set(day, json.events || []);
    await sleep(300);
  }

  let matched = 0;
  for (const fixture of targets) {
    const day = localBucketDay(fixture.date, utcOffsetMinutes);
    const events = eventsByDate.get(day) || [];
    const homeEspnId = teams[fixture.home]?.espnId;
    const awayEspnId = teams[fixture.away]?.espnId;
    const ev = events.find((e) => {
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === 'home')?.team?.id;
      const away = comp?.competitors?.find((c) => c.homeAway === 'away')?.team?.id;
      return String(home) === String(homeEspnId) && String(away) === String(awayEspnId);
    });
    if (ev) {
      fixture.espnEventId = ev.id;
      matched += 1;
    } else if (fixture.status !== 'scheduled') {
      console.warn(`[${liga}] sem espnEventId para ${fixture.id} (${fixture.date}) — modal/estatísticas ficarão indisponíveis pra esse jogo até casar.`);
    }
  }
  return matched;
}

function computeCurrentRound(fixtures) {
  // Não dá pra usar "primeira rodada com jogo pendente": adiamentos deixam
  // rodadas antigas com jogos em aberto por semanas, travando o cálculo.
  // A rodada "atual" é a da partida com data mais próxima de hoje (passada
  // ou futura), que é o que a UI (auto-scroll/expand em Rodadas) precisa.
  const now = Date.now();
  let best = null;
  let bestDiff = Infinity;
  for (const m of fixtures.matches) {
    if (m.status === 'postponed') continue;
    const diff = Math.abs(new Date(m.date).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = m.round;
    }
  }
  return best ?? 1;
}

function computeLiveWindows(fixtures) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todaysMatches = fixtures.matches.filter((m) => m.date.slice(0, 10) === todayStr && m.status !== 'postponed');
  if (todaysMatches.length === 0) return [];
  const kickoffs = todaysMatches.map((m) => new Date(m.date).getTime()).sort((a, b) => a - b);
  const start = new Date(kickoffs[0] - 15 * 60 * 1000).toISOString();
  const end = new Date(kickoffs[kickoffs.length - 1] + 3 * 60 * 60 * 1000).toISOString();
  return [{ start, end }];
}

async function espnGetJson(url) {
  const res = await fetch(url);
  if (res.status !== 200) return null;
  return res.json();
}

// Ligas sem fonte canônica (ex.: bra-b — football-data free tier não cobre
// Série B) não têm um endpoint de "/matches" com a temporada inteira de uma
// vez, então a única forma de reconstruir o calendário é varrer o scoreboard
// da ESPN dia a dia (mesmo endpoint já validado na Fase 0), acumulando os
// eventos vistos.
async function fetchEspnSeasonEvents(espnSlug, season) {
  const events = new Map();
  const start = Date.UTC(season, 0, 1);
  const end = Date.UTC(season, 11, 31);
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const day = new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
    const json = await espnGetJson(`${ESPN_SITE_BASE}/${espnSlug}/scoreboard?dates=${day}`);
    for (const ev of json?.events || []) events.set(ev.id, ev);
    await sleep(ESPN_SCAN_SLEEP_MS);
  }
  return [...events.values()];
}

function espnMatchStatus(comp) {
  const type = comp?.status?.type;
  if (type?.completed) return 'finished';
  const name = type?.name || '';
  if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED/i.test(name)) return 'postponed';
  if (type?.state === 'in') return 'live';
  return 'scheduled';
}

// A ESPN não manda round/matchday nos summaries nem no scoreboard (checado
// em docs/fase0-bra-a-samples/ — "notes" sempre vem vazio). Sem esse campo,
// a rodada é inferida por conflito de confronto: cada partida recebe a menor
// rodada em que nem o mandante nem o visitante já jogaram, andando em ordem
// cronológica real. Isso reage à data efetiva de cada jogo em vez de uma
// janela fixa de dias por rodada, então adiamentos não quebram o cálculo —
// mas, como consequência, o `id` de uma partida (que embute a rodada) pode
// mudar de uma rodada pra outra se um adiamento reordenar sua posição
// cronológica; espnEventId é a chave estável entre execuções, não `id`.
function assignRoundsByConflict(matches) {
  const lastRound = {};
  const sorted = [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const m of sorted) {
    const round = Math.max(lastRound[m.home] || 0, lastRound[m.away] || 0) + 1;
    m.round = round;
    lastRound[m.home] = round;
    lastRound[m.away] = round;
  }
}

async function syncFixturesAndStandingsEspn(liga, cfg, teams) {
  const dataDir = path.join(ROOT, 'data', liga);
  fs.mkdirSync(dataDir, { recursive: true });
  const espnSlug = cfg.sources.espnSlug;

  const fixturesPath = path.join(dataDir, 'fixtures.json');
  const existing = loadJson(fixturesPath, { season: cfg.season, currentRound: 1, matches: [] });
  const existingByEventId = new Map(
    existing.matches.filter((m) => m.espnEventId).map((m) => [String(m.espnEventId), m]),
  );

  const events = await fetchEspnSeasonEvents(espnSlug, cfg.season);

  let overrides = 0;
  let unmatchedTeams = 0;
  const rebuilt = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const homeSlug = teamSlugByEspnId(teams, home?.team?.id);
    const awaySlug = teamSlugByEspnId(teams, away?.team?.id);
    if (!homeSlug || !awaySlug) {
      unmatchedTeams += 1;
      continue;
    }

    const prior = existingByEventId.get(String(ev.id));
    const newStatus = espnMatchStatus(comp);
    const newScore = newStatus === 'finished'
      ? { home: Number(home?.score ?? 0), away: Number(away?.score ?? 0) }
      : null;

    let status = newStatus;
    let score = newScore;
    if (prior?.status === 'finished') {
      // Mesma regra do fluxo football-data acima: post-match.js é dono do
      // resultado final; só aceitamos divergência explícita e logamos.
      status = 'finished';
      score = prior.score;
      if (newStatus === 'finished' && newScore
        && (newScore.home !== prior.score?.home || newScore.away !== prior.score?.away)) {
        console.warn(`[${liga}] placar ESPN de ${prior.id} divergente: ${JSON.stringify(newScore)} vs registrado ${JSON.stringify(prior.score)} — sobrescrevendo com a ESPN.`);
        score = newScore;
        overrides += 1;
      }
    }

    rebuilt.push({
      round: null, // preenchido abaixo por assignRoundsByConflict
      date: ev.date,
      home: homeSlug,
      away: awaySlug,
      status,
      score,
      espnEventId: ev.id,
      venue: prior?.venue || null,
      attendance: prior?.attendance ?? null,
    });
  }
  if (unmatchedTeams > 0) {
    console.warn(`[${liga}] ${unmatchedTeams} evento(s) ESPN com time sem espnId em teams.json — ignorados.`);
  }

  assignRoundsByConflict(rebuilt);
  const matches = rebuilt.map((m) => ({ id: `r${m.round}-${m.home}-${m.away}`, ...m }));

  const fixtures = { season: cfg.season, currentRound: existing.currentRound, matches };
  fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n');
  console.log(`[${liga}] fixtures.json (ESPN): ${matches.length} partidas (${overrides} placar(es) sobrescrito(s) por divergência).`);

  // Standings via ESPN (mesmo endpoint/shape que build-teams.js já usa e que
  // docs/espn-standings-raw-bra-a.json confirma: rank/points/gamesPlayed/
  // wins/ties/losses/pointsFor/pointsAgainst/pointDifferential em stats[]).
  const zoneBands = cfg.rules?.zoneBands || [];
  const standingsJson = await espnGetJson(`${ESPN_STANDINGS_BASE}/${espnSlug}/standings`);
  const entries = standingsJson?.children?.[0]?.standings?.entries || standingsJson?.standings?.entries || [];
  const statVal = (entry, name) => (entry.stats || []).find((s) => s.name === name)?.value ?? null;
  const table = entries
    .map((entry) => {
      const slug = teamSlugByEspnId(teams, entry.team?.id);
      const pos = statVal(entry, 'rank');
      return {
        pos,
        team: slug,
        pts: statVal(entry, 'points'),
        played: statVal(entry, 'gamesPlayed'),
        won: statVal(entry, 'wins'),
        drawn: statVal(entry, 'ties'),
        lost: statVal(entry, 'losses'),
        gf: statVal(entry, 'pointsFor'),
        ga: statVal(entry, 'pointsAgainst'),
        gd: statVal(entry, 'pointDifferential'),
        form: computeForm(fixtures, slug),
        zone: zoneForPosition(pos, zoneBands),
      };
    })
    .filter((row) => row.team)
    .sort((a, b) => a.pos - b.pos);

  const standingsPath = path.join(dataDir, 'standings.json');
  const standingsOut = {
    updatedAt: new Date().toISOString(),
    table,
    zones: zoneBands.map((z) => ({ id: z.id, label: z.label, color: z.color })),
  };
  fs.writeFileSync(standingsPath, JSON.stringify(standingsOut, null, 2) + '\n');
  console.log(`[${liga}] standings.json (ESPN): ${table.length} times, ${zoneBands.length} zona(s) configurada(s).`);

  return { fixtures, standings: standingsOut };
}

async function syncLeague(liga, cfg, token) {
  console.log(`=== ${liga} (${cfg.name}) ===`);
  const teams = loadJson(path.join(ROOT, 'data', liga, 'teams.json'), null);
  if (!teams) {
    console.error(`[${liga}] teams.json não encontrado — rode build-teams.js primeiro. Pulando liga.`);
    return;
  }

  const hasCanonical = Boolean(cfg.sources?.canonical && cfg.sources?.canonicalCode);
  let fixtures;
  if (hasCanonical) {
    ({ fixtures } = await syncFixturesAndStandings(liga, cfg, teams, token));
    const matched = await matchEspnEvents(liga, cfg, teams, fixtures);
    console.log(`[${liga}] espnEventId casado em ${matched} jogo(s) dos próximos 7 dias.`);
  } else {
    // Sem fonte canônica (ex.: bra-b): a própria varredura ESPN já grava o
    // espnEventId de cada partida — não precisa de um segundo passo de casamento.
    ({ fixtures } = await syncFixturesAndStandingsEspn(liga, cfg, teams));
  }

  fixtures.currentRound = computeCurrentRound(fixtures);
  fs.writeFileSync(
    path.join(ROOT, 'data', liga, 'fixtures.json'),
    JSON.stringify(fixtures, null, 2) + '\n',
  );

  const metaPath = path.join(ROOT, 'data', liga, 'meta.json');
  const meta = loadJson(metaPath, {});
  meta.lastDailyCron = new Date().toISOString();
  meta.liveWindows = computeLiveWindows(fixtures);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`[${liga}] meta.json atualizado. currentRound=${fixtures.currentRound}, liveWindows=${meta.liveWindows.length}.`);
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;

  const onlyLiga = process.argv.find((a) => a.startsWith('--liga='))?.split('=')[1];
  const leagues = loadJson(path.join(ROOT, 'data', 'leagues.json'), {});

  const targets = Object.entries(leagues).filter(([slug, cfg]) => {
    if (onlyLiga) return slug === onlyLiga;
    return cfg.status === 'active';
  });

  if (targets.length === 0) {
    console.log('Nenhuma liga active (ou --liga inválida) — nada a fazer.');
    return;
  }

  // Só exige o token football-data se alguma liga alvo realmente depende dele
  // — ligas ESPN-only (ex.: bra-b) rodam sem ele.
  const needsToken = targets.some(([, cfg]) => cfg.sources?.canonical && cfg.sources?.canonicalCode);
  if (needsToken && !token) throw new Error('FOOTBALL_DATA_TOKEN não configurado.');

  for (const [slug, cfg] of targets) {
    if (!cfg.sources?.espnSlug) {
      console.log(`[${slug}] sem sources.espnSlug configurado — pulando.`);
      continue;
    }
    try {
      await syncLeague(slug, cfg, token);
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
