# Diagnóstico · schedule/round da ESPN — Brasileirão Série B (bra-b)

Gerado em: 2026-07-11T17:21:03.831Z
espnSlug: `bra.2` | data testada: `20260711`

## 1. Scoreboard de um dia

- HTTP 200, 0 evento(s).
- Chaves de topo: leagues, events, provider
- Campo "week" no topo: ausente
- leagues[0] chaves: id, uid, name, abbreviation, midsizeName, slug, season, logos, calendarType, calendarIsWhitelist, calendarStartDate, calendarEndDate, calendar
- leagues[0].calendar: presente, 102 entrada(s) — amostra: ["2026-03-21T07:00Z","2026-03-22T07:00Z","2026-03-31T07:00Z"]

## 2. Range de datas (14 dias)

- URL: https://site.api.espn.com/apis/site/v2/sports/soccer/bra.2/scoreboard?dates=20260711-20260725
- HTTP 200, 27 evento(s), 9 dia(s) distinto(s) nos eventos.
- Suporta range: PARECE QUE SIM (múltiplos dias num request só)
