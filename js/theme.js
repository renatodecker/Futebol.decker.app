// Cascata de temas (spec 6.3): base decker -> identidade da liga -> skin do time.
// Módulo só exporta funções puras de aplicação; quem decide QUANDO chamar é app.js.

const root = document.documentElement;

export function applyBase() {
  root.style.removeProperty('--primary');
  root.style.removeProperty('--secondary');
  root.style.removeProperty('--text');
}

export function applyLeagueTheme(identity) {
  if (!identity) return applyBase();
  root.style.setProperty('--primary', identity.primary);
  root.style.setProperty('--secondary', identity.secondary);
  root.style.setProperty('--text', identity.text);
}

export function applyTeamSkin(skin) {
  if (!skin) return;
  root.style.setProperty('--primary', skin.primary);
  root.style.setProperty('--secondary', skin.secondary);
  root.style.setProperty('--text', skin.text);
}
