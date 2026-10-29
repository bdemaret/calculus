/** Thème clair / sombre : choix explicite stocké dans le navigateur, sinon celui du système. */

export type Theme = "light" | "dark";
export const THEME_KEY = "calculus:theme";

/** Script exécuté dans <head> avant le premier rendu, pour éviter un flash du mauvais thème. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Réapplique le choix enregistré : le <html> est recréé quand la langue change, sans repasser par le script. */
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {}
}

/** Thème affiché actuellement (choix explicite ou préférence système). */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
