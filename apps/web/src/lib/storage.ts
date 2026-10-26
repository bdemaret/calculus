"use client";
/** Accès au stockage du navigateur qui ne plante jamais (navigation privée, stockage bloqué…). */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem("calculus:" + key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem("calculus:" + key, JSON.stringify(value));
    } catch {}
  },
};
