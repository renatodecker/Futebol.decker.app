#!/usr/bin/env node
/**
 * scripts/roster-sync.js [--liga=bra-a]
 *
 * Camada de IDENTIDADE de players.json (spec 4.4, item 1) — roda semanalmente
 * (segundas, via workflow). Semeia TODOS os registrados de cada clube, mesmo
 * quem nunca jogou: nome completo, aproximação de nome na camisa, nascimento,
 * nacionalidade, número, posição.
 *
 * Fonte: roster da ESPN (site.api.espn.com/.../teams/{espnId}/roster). A Fase 0
 * validou que esse endpoint já traz os campos precisados sem chave — e a chave
 * de jogador em todo o resto do pipeline (post-match.js) é p-espn-{athleteId},
 * então usar a ESPN aqui também evita cruzar dois espaços de ID diferentes.
 * football-data /teams/{id} squad segue documentado no spec como alternativa,
 * mas não é necessário dado que a ESPN já cobre os campos exigidos.
 *
 * Nunca sobrescreve apps/goals/debut/team — esses são donos de post-match.js
 * (súmula sobrescreve team; aqui só tocamos identidade).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

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

// Aproximação — nomes fora deste mapa caem no fallback de 3 letras maiúsculas
// (registrado como limitação conhecida, não uma tradução confiável de país).
const NATIONALITY_MAP = {
  Brazil: 'BRA', Argentina: 'ARG', Uruguay: 'URU', Paraguay: 'PAR', Chile: 'CHI',
  Colombia: 'COL', Ecuador: 'ECU', Venezuela: 'VEN', Bolivia: 'BOL', Peru: 'PER',
  Portugal: 'POR', Spain: 'ESP', Guinea: 'GUI', 'United States': 'USA',
  France: 'FRA', Italy: 'ITA', Croatia: 'CRO', Serbia: 'SRB', Japan: 'JPN',
  Nigeria: 'NGA', Ghana: 'GHA', Senegal: 'SEN', Cameroon: 'CMR', Mexico: 'MEX',
};

function nationalityCode(citizenship) {
  if (!citizenship) return null;
  return NATIONALITY_MAP[citizenship] || citizenship.slice(0, 3).toUpperCase();
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

async function syncTeamRoster(espnSlug, teamSlug, espnId, players, seenThisRun) {
  const url = `${ESPN_SITE_BASE}/${espnSlug}/teams/${espnId}/roster`;
  const res = await fetch(url);
  if (res.status !== 200) {
    console.warn(`Falha ao buscar roster ESPN de ${teamSlug} (HTTP ${res.status}).`);
    return null; // null = falha de rede, diferente de "0 atletas" — não pode implicar elenco vazio
  }
  const json = await res.json();
  let count = 0;
  for (const athlete of json.athletes || []) {
    const pid = `p-espn-${athlete.id}`;
    if (!seenThisRun.has(pid)) seenThisRun.set(pid, new Set());
    seenThisRun.get(pid).add(teamSlug);

    const prior = players[pid] || {};
    players[pid] = {
      fullName: athlete.fullName,
      shirtName: athlete.shortName || athlete.displayName,
      team: prior.team ?? teamSlug, // súmula (post-match) é quem decide o time atual quando existir
      position: positionGroup(athlete.position?.abbreviation),
      jersey: athlete.jersey ? Number(athlete.jersey) : null,
      birthdate: athlete.dateOfBirth ? athlete.dateOfBirth.slice(0, 10) : null,
      nationality: nationalityCode(athlete.citizenship),
      apps: prior.apps ?? 0,
      goals: prior.goals ?? 0,
      debut: prior.debut ?? null,
      active: prior.active ?? true,
    };
    count += 1;
  }
  return count;
}

// Marca como inativo (saiu do clube/já vendido) quem não aparece mais no
// roster atual do time que players.json diz ser o dele — squad.js usa isso
// pra tirar o jogador do elenco exibido sem apagar apps/gols já contabilizados
// na temporada. Roda depois de buscar TODOS os times da liga, então o roster
// atual de cada clube já está completo em `seenThisRun`.
// `failedTeams`: times cujo fetch falhou nesta rodada (rede/HTTP) — seus
// jogadores ficam de fora da reavaliação, senão uma falha pontual da ESPN
// esvaziaria o elenco inteiro do time por engano.
function applyActiveFlags(players, seenThisRun, failedTeams) {
  let deactivated = 0;
  for (const [pid, p] of Object.entries(players)) {
    if (failedTeams.has(p.team)) continue;
    const seenTeams = seenThisRun.get(pid);
    const active = seenTeams ? seenTeams.has(p.team) : false;
    if (p.active && !active) deactivated += 1;
    p.active = active;
  }
  return deactivated;
}

async function main() {
  const onlyLiga = process.argv.find((a) => a.startsWith('--liga='))?.split('=')[1];
  const leagues = loadJson(path.join(ROOT, 'data', 'leagues.json'), {});

  const targets = Object.entries(leagues).filter(([slug, cfg]) => {
    if (onlyLiga) return slug === onlyLiga;
    return cfg.status === 'active';
  });

  for (const [slug, cfg] of targets) {
    const teams = loadJson(path.join(ROOT, 'data', slug, 'teams.json'), null);
    if (!teams) {
      console.log(`[${slug}] sem teams.json — pulando.`);
      continue;
    }
    const playersPath = path.join(ROOT, 'data', slug, 'players.json');
    const players = loadJson(playersPath, {});
    const seenThisRun = new Map();
    const failedTeams = new Set();

    let total = 0;
    for (const [teamSlug, team] of Object.entries(teams)) {
      const n = await syncTeamRoster(cfg.sources.espnSlug, teamSlug, team.espnId, players, seenThisRun);
      if (n === null) {
        failedTeams.add(teamSlug);
      } else {
        total += n;
        console.log(`[${slug}] ${teamSlug}: ${n} atletas.`);
      }
      await sleep(7000); // rate limit / educado com a ESPN
    }
    const deactivated = applyActiveFlags(players, seenThisRun, failedTeams);
    if (deactivated > 0) {
      console.log(`[${slug}] ${deactivated} jogador(es) marcado(s) como fora do elenco atual (transferido/vendido).`);
    }
    fs.writeFileSync(playersPath, JSON.stringify(players, null, 2) + '\n');
    console.log(`[${slug}] players.json: ${Object.keys(players).length} jogadores registrados (${total} nesta rodada).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
