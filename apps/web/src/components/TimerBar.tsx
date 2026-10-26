"use client";
import { useEffect, useRef } from "react";

interface Props {
  /** Fin du temps, en heure locale (ms). */
  deadline: number | null;
  totalMs: number;
  onExpire?: () => void;
}

/** Trait de surligneur qui se vide avec le temps, et rosit dans les 3 dernières secondes. */
export function TimerBar({ deadline, totalMs, onExpire }: Props) {
  const fill = useRef<HTMLDivElement>(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    let raf = 0;
    let fired = false;
    const loop = () => {
      const el = fill.current;
      if (!el) return;
      if (deadline === null) {
        el.style.transform = "scaleX(0)";
        return;
      }
      const left = Math.max(0, deadline - Date.now());
      el.style.transform = `scaleX(${totalMs > 0 ? left / totalMs : 0})`;
      el.classList.toggle("late", left < 3000);
      if (left <= 0) {
        if (!fired) {
          fired = true;
          expire.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [deadline, totalMs]);

  return (
    <div className="timer" aria-hidden="true">
      <div className="timer-fill" ref={fill} />
    </div>
  );
}
