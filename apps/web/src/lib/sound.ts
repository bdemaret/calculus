"use client";
/** Petits sons synthétisés avec le navigateur (aucun fichier audio à charger). */

let ctx: AudioContext | null = null;
let enabled = true;
const KEY = "calculus:sound";

if (typeof window !== "undefined") {
  try {
    enabled = localStorage.getItem(KEY) !== "off";
  } catch {}
}

export function isSoundOn() {
  return enabled;
}
export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

function tone(freqs: number[], dur = 0.09, type: OscillatorType = "sine", gain = 0.07) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    ctx = ctx ?? new (window.AudioContext ?? W.webkitAudioContext!)();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      const s = t0 + i * dur;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(gain, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur * 1.8);
      o.connect(g).connect(ctx!.destination);
      o.start(s);
      o.stop(s + dur * 2);
    });
  } catch {}
}

export const sfx = {
  ok: () => tone([660, 990], 0.07),
  ko: () => tone([196, 147], 0.12, "square", 0.04),
  tick: () => tone([740], 0.05, "sine", 0.04),
  go: () => tone([523, 784], 0.08),
  out: () => tone([330, 247, 196], 0.1, "triangle", 0.05),
  win: () => tone([523, 659, 784, 1047], 0.11),
};

export async function celebrate() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 } });
  } catch {}
}
