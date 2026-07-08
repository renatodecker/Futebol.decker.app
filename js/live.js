// Modo live (spec Fase 4). Faz polling do scoreboard da ESPN só dentro das
// janelas em meta.liveWindows, e aplica status/score direto nos objetos de
// fixtures.json em memória (nunca persiste — o cron post-match.js é quem
// grava o resultado oficial).

const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LIVE_POLL_MS = 45000;
const IDLE_CHECK_MS = 60000;

function isWithinAnyWindow(windows, now = Date.now()) {
  return (windows || []).some((w) => now >= new Date(w.start).getTime() && now <= new Date(w.end).getTime());
}

function localBucketDay(date, utcOffsetMinutes) {
  // Mesma lógica do daily-sync.js: a ESPN agrupa o scoreboard pelo dia local
  // da partida, não pelo dia UTC.
  const shifted = new Date(date.getTime() + (utcOffsetMinutes || 0) * 60000);
  return shifted.toISOString().slice(0, 10).replace(/-/g, '');
}

function applyLiveEvents(fixtures, events) {
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const match = fixtures.matches.find((m) => String(m.espnEventId) === String(ev.id));
    if (!match) continue;

    const state = comp.status?.type?.state; // 'pre' | 'in' | 'post'
    if (state !== 'in' && state !== 'post') continue;

    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    match.score = { home: Number(home?.score ?? 0), away: Number(away?.score ?? 0) };
    if (state === 'in') {
      match.status = 'live';
      match.liveClock = comp.status?.displayClock || null;
    } else {
      // ESPN já marcou como encerrado; o cron oficial (post-match.js) ainda
      // não rodou pra esse jogo — trata como finalizado na UI mesmo assim.
      match.status = 'finished';
      match.liveClock = null;
    }
  }
}

export function initLive(getState, onUpdate) {
  let timer = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const { liga, leagues, fixtures, meta } = getState();
    const cfg = liga ? leagues?.[liga] : null;

    if (!cfg || !fixtures || !meta || !isWithinAnyWindow(meta.liveWindows)) {
      onUpdate({ liveMatchIds: [] });
      schedule(IDLE_CHECK_MS);
      return;
    }

    try {
      const day = localBucketDay(new Date(), cfg.sources?.utcOffsetMinutes || 0);
      const res = await fetch(`${ESPN_SITE_BASE}/${cfg.sources.espnSlug}/scoreboard?dates=${day}`);
      if (res.ok) {
        const json = await res.json();
        applyLiveEvents(fixtures, json.events || []);
      }
    } catch (_) {
      // falhou nesse tick, tenta de novo no próximo
    }

    const liveMatchIds = fixtures.matches.filter((m) => m.status === 'live').map((m) => m.id);
    onUpdate({ liveMatchIds });
    schedule(LIVE_POLL_MS);
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  tick();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
