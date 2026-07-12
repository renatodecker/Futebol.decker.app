#!/usr/bin/env node
/**
 * scripts/generate-ics.js
 *
 * Gera calendar/gremio.ics a partir de data/<liga>/fixtures.json.
 * Roda a cada hora (workflow calendar-sync.yml), então qualquer mudança de
 * data/horário (adiamento) ou resultado já refletida em fixtures.json pelo
 * daily-sync/post-match aparece no .ics na próxima rodada do cron.
 *
 * Procura o time em todas as ligas listadas em data/leagues.json (hoje só
 * bra-a tem o Grêmio) em vez de fixar a liga, pra sobreviver a uma eventual
 * mudança de divisão.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEAM_SLUG = 'gre';
const MATCH_DURATION_MS = 2 * 60 * 60 * 1000;
const OUT_FILE = path.join(ROOT, 'calendar', 'gremio.ics');

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function icsDate(isoString) {
  const d = new Date(isoString);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes <= 75) return line;
  const out = [];
  let rest = line;
  let first = true;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > (first ? 75 : 74)) cut--;
    out.push((first ? '' : ' ') + rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  out.push(' ' + rest);
  return out.join('\r\n');
}

function statusLabel(match) {
  if (match.status === 'finished') return 'Encerrado';
  if (match.status === 'postponed') return 'Adiado (data a confirmar)';
  return 'Agendado';
}

// fixtures ainda não têm venue para jogos futuros (só chega perto da rodada,
// via ESPN). Até lá, usamos o estádio mais frequente do mandante nas partidas
// já disputadas na temporada como palpite, deixando claro que é provável.
function buildHomeVenueMap(fixtures) {
  const counts = {};
  for (const match of fixtures.matches) {
    if (!match.venue) continue;
    counts[match.home] = counts[match.home] || {};
    counts[match.home][match.venue] = (counts[match.home][match.venue] || 0) + 1;
  }
  const map = {};
  for (const [team, venues] of Object.entries(counts)) {
    map[team] = Object.entries(venues).sort((a, b) => b[1] - a[1])[0][0];
  }
  return map;
}

function buildEvent({ leagueSlug, league, match, homeTeam, awayTeam, probableVenue }) {
  const homeName = homeTeam ? homeTeam.name : match.home;
  const awayName = awayTeam ? awayTeam.name : match.away;

  let summary = `${homeName} x ${awayName}`;
  if (match.status === 'finished' && match.score) {
    summary = `${homeName} ${match.score.home}x${match.score.away} ${awayName}`;
  }

  const start = new Date(match.date);
  const end = new Date(start.getTime() + MATCH_DURATION_MS);

  const venue = match.venue || probableVenue || null;
  const venueIsProbable = !match.venue && !!probableVenue;

  const descriptionParts = [
    `Rodada ${match.round} · ${league.name}`,
    statusLabel(match),
  ];
  if (venueIsProbable) descriptionParts.push('Local provável (mandante ainda não confirmou)');

  const lines = [
    'BEGIN:VEVENT',
    `UID:${leagueSlug}-${match.id}@futebol.decker.app.br`,
    // Derivado dos dados do jogo (não do horário de execução do script) pra
    // o .ics só mudar de fato quando um jogo mudar - senão o commit horário
    // vira ruído mesmo sem novidade nenhuma.
    `DTSTAMP:${icsDate(match.date)}`,
    `DTSTART:${icsDate(match.date)}`,
    `DTEND:${icsDate(end.toISOString())}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(descriptionParts.join(' · '))}`,
    `STATUS:${match.status === 'postponed' ? 'TENTATIVE' : 'CONFIRMED'}`,
  ];
  if (venue) lines.push(`LOCATION:${escapeText(venueIsProbable ? `${venue} (provável)` : venue)}`);
  lines.push('END:VEVENT');

  return lines.map(foldLine).join('\r\n');
}

function main() {
  const leagues = loadJson(path.join(ROOT, 'data', 'leagues.json'), {});

  const events = [];
  let teamName = 'Grêmio';

  for (const [leagueSlug, league] of Object.entries(leagues)) {
    const teams = loadJson(path.join(ROOT, 'data', leagueSlug, 'teams.json'), null);
    if (!teams || !teams[TEAM_SLUG]) continue;
    teamName = teams[TEAM_SLUG].name;

    const fixtures = loadJson(path.join(ROOT, 'data', leagueSlug, 'fixtures.json'), null);
    if (!fixtures) continue;

    const homeVenues = buildHomeVenueMap(fixtures);

    for (const match of fixtures.matches) {
      if (match.home !== TEAM_SLUG && match.away !== TEAM_SLUG) continue;
      events.push(
        buildEvent({
          leagueSlug,
          league,
          match,
          homeTeam: teams[match.home],
          awayTeam: teams[match.away],
          probableVenue: homeVenues[match.home],
        })
      );
    }
  }

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//futebol.decker.app.br//Calendario ' + teamName + '//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(teamName)}`),
    foldLine(`X-WR-CALDESC:${escapeText(`Jogos do ${teamName} - futebol.decker.app.br`)}`),
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, calendar, 'utf8');
  console.log(`OK: ${events.length} jogos -> ${path.relative(ROOT, OUT_FILE)}`);
}

main();
