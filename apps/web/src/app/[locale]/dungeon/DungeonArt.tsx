import type { ReactNode } from "react";
import type { EnemyId, ItemId } from "@calculus/game-core";

/*
 * Portraits des donjons, dessinés à la main en SVG (100 × 100). Aucune couleur ici : chaque forme prend
 * un rôle (`--art-main`, `--art-shade`, `--art-skin`, `--art-eye`, `--art-accent`, `--art-bone`),
 * que `dungeon.css` règle par ennemi (`[data-art="troll"]`…). Décoratifs : le nom est toujours écrit à côté.
 */

const main = "var(--art-main)";
const shade = "var(--art-shade)";
const skin = "var(--art-skin)";
const eye = "var(--art-eye)";
const accent = "var(--art-accent)";
const bone = "var(--art-bone)";

function Elf() {
  return (
    <>
      <path d="M88 18 Q102 55 88 92" fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M88 18 L88 92" stroke={bone} strokeWidth="1.2" />
      <path d="M50 6 L82 72 Q50 84 18 72 Z" fill={shade} />
      <path d="M12 40 L35 49 L32 57 Z" fill={skin} />
      <path d="M88 40 L65 49 L68 57 Z" fill={skin} />
      <ellipse cx="50" cy="53" rx="16" ry="19" fill={skin} />
      <path d="M50 12 L76 62 Q64 38 50 36 Q36 38 24 62 Z" fill={main} />
      <path d="M39 52 L47 54" stroke={eye} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M61 52 L53 54" stroke={eye} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M45 63 Q50 66 55 63" fill="none" stroke={shade} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 74 Q50 98 78 74 L86 100 L14 100 Z" fill={main} />
      <path d="M50 76 L50 100" stroke={shade} strokeWidth="2" />
    </>
  );
}

function Troll() {
  return (
    <>
      <path d="M84 6 Q98 10 94 30 L81 66 L74 63 L85 29 Q78 19 84 6 Z" fill={accent} />
      <circle cx="88" cy="18" r="2" fill={shade} />
      <circle cx="90" cy="27" r="2" fill={shade} />
      <path d="M4 100 Q8 66 30 60 L70 60 Q92 66 96 100 Z" fill={shade} />
      <path d="M24 40 Q24 12 50 12 Q76 12 76 40 L76 56 Q76 72 50 74 Q24 72 24 56 Z" fill={main} />
      <path d="M18 34 L26 38 L24 48 Z" fill={main} />
      <path d="M82 34 L74 38 L76 48 Z" fill={main} />
      <path d="M29 36 Q50 26 71 36 L71 43 Q50 35 29 43 Z" fill={shade} />
      <circle cx="40" cy="47" r="3.4" fill={eye} />
      <circle cx="60" cy="47" r="3.4" fill={eye} />
      <path d="M45 48 Q50 61 55 48 Z" fill={shade} />
      <path d="M36 63 Q50 70 64 63" fill="none" stroke={shade} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M38 64 L35 52 L43 61 Z" fill={bone} />
      <path d="M62 64 L65 52 L57 61 Z" fill={bone} />
      <path d="M40 18 Q46 22 44 28" fill="none" stroke={shade} strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function Knight() {
  return (
    <>
      <path d="M50 2 Q76 4 72 28 Q64 14 50 18 Z" fill={accent} />
      <path d="M8 100 Q12 72 34 68 L66 68 Q88 72 92 100 Z" fill={shade} />
      <path d="M27 32 Q27 10 50 10 Q73 10 73 32 L73 62 Q50 76 27 62 Z" fill={main} />
      <path d="M50 10 L50 72" stroke={shade} strokeWidth="2.6" />
      <rect x="31" y="36" width="38" height="6" rx="3" fill={eye} />
      <g fill={shade}>
        <circle cx="40" cy="52" r="1.6" />
        <circle cx="40" cy="58" r="1.6" />
        <circle cx="60" cy="52" r="1.6" />
        <circle cx="60" cy="58" r="1.6" />
      </g>
      <path d="M58 62 L92 62 L92 80 Q92 95 75 100 Q58 95 58 80 Z" fill={accent} />
      <path d="M75 66 V95 M63 78 H87" stroke={bone} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Mummy() {
  return (
    <>
      <path d="M14 100 Q16 70 50 66 Q84 70 86 100 Z" fill={main} />
      <path d="M22 80 L78 74 M18 92 L82 86" stroke={shade} strokeWidth="2.2" />
      <ellipse cx="50" cy="40" rx="23" ry="27" fill={main} />
      <g fill="none" stroke={shade} strokeWidth="2.2" strokeLinecap="round">
        <path d="M28 26 Q50 18 72 24" />
        <path d="M27 50 Q50 46 73 52" />
        <path d="M30 60 Q50 56 70 62" />
        <path d="M34 16 L66 30" />
      </g>
      <path d="M30 34 Q50 30 70 36 L70 46 Q50 42 30 46 Z" fill={shade} />
      <circle cx="41" cy="40" r="4" fill={eye} />
      <circle cx="59" cy="40" r="4" fill={eye} />
      <path d="M70 30 Q86 28 92 40" fill="none" stroke={main} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Boss() {
  return (
    <>
      <path d="M24 34 Q2 22 8 0 Q20 18 36 24 Z" fill={bone} />
      <path d="M76 34 Q98 22 92 0 Q80 18 64 24 Z" fill={bone} />
      <path d="M22 30 Q50 8 78 30 L82 58 Q68 92 50 96 Q32 92 18 58 Z" fill={main} />
      <path d="M8 46 L22 40 L20 56 Z" fill={shade} />
      <path d="M92 46 L78 40 L80 56 Z" fill={shade} />
      <path d="M27 43 L46 50 L46 55 L27 49 Z" fill={shade} />
      <path d="M73 43 L54 50 L54 55 L73 49 Z" fill={shade} />
      <path d="M31 53 L44 57 L34 61 Z" fill={eye} />
      <path d="M69 53 L56 57 L66 61 Z" fill={eye} />
      <path d="M38 72 Q50 64 62 72 L58 88 Q50 93 42 88 Z" fill={shade} />
      <circle cx="45" cy="73" r="1.6" fill={eye} />
      <circle cx="55" cy="73" r="1.6" fill={eye} />
      <path d="M43 86 L45 95 L47 86 Z M53 86 L55 95 L57 86 Z" fill={bone} />
      <path d="M50 14 L50 30" stroke={shade} strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

function Witch() {
  return (
    <>
      <path d="M50 2 L74 40 L26 40 Z" fill={shade} />
      <path d="M50 2 Q60 8 66 4 Q62 14 56 14 Z" fill={shade} />
      <path d="M10 42 Q50 30 90 42 Q50 50 10 42 Z" fill={shade} />
      <rect x="30" y="34" width="40" height="5" fill={accent} />
      <path d="M32 44 Q32 76 50 80 Q68 76 68 44 Z" fill={skin} />
      <path d="M50 56 L56 66 L50 66 Z" fill={main} />
      <path d="M40 54 L46 55" stroke={eye} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 54 L54 55" stroke={eye} strokeWidth="3" strokeLinecap="round" />
      <path d="M43 71 Q50 75 57 71" fill="none" stroke={main} strokeWidth="2" strokeLinecap="round" />
      <path d="M28 44 Q22 70 30 88 L36 60 Z M72 44 Q78 70 70 88 L64 60 Z" fill={shade} />
      <path d="M14 100 Q20 80 50 82 Q80 80 86 100 Z" fill={shade} />
      <circle cx="84" cy="70" r="7" fill={eye} opacity="0.8" />
    </>
  );
}

function Specter() {
  return (
    <>
      <path d="M50 6 Q80 6 82 44 L84 92 L74 84 L64 96 L54 84 L44 96 L34 84 L24 96 L16 86 L18 44 Q20 6 50 6 Z" fill={main} opacity="0.92" />
      <path d="M50 6 Q80 6 82 44 L84 92 L74 84 L66 94 Q70 50 50 6 Z" fill={shade} opacity="0.35" />
      <ellipse cx="38" cy="40" rx="7" ry="10" fill={shade} />
      <ellipse cx="62" cy="40" rx="7" ry="10" fill={shade} />
      <circle cx="38" cy="42" r="3" fill={eye} />
      <circle cx="62" cy="42" r="3" fill={eye} />
      <ellipse cx="50" cy="64" rx="7" ry="9" fill={shade} />
    </>
  );
}

function Cyclops() {
  return (
    <>
      <path d="M4 100 Q8 70 30 64 L70 64 Q92 70 96 100 Z" fill={shade} />
      <path d="M22 40 Q22 10 50 10 Q78 10 78 40 L78 58 Q78 76 50 78 Q22 76 22 58 Z" fill={main} />
      <path d="M50 10 L46 2 L54 2 Z" fill={bone} />
      <ellipse cx="50" cy="38" rx="15" ry="12" fill={bone} />
      <circle cx="50" cy="38" r="7" fill={eye} />
      <circle cx="50" cy="38" r="3" fill={shade} />
      <path d="M33 26 Q50 18 67 26" fill="none" stroke={shade} strokeWidth="3" strokeLinecap="round" />
      <path d="M36 62 Q50 70 64 62 L60 66 Q50 72 40 66 Z" fill={shade} />
      <path d="M42 63 L44 68 L46 64 Z M54 64 L56 68 L58 63 Z" fill={bone} />
    </>
  );
}

function Skeleton() {
  return (
    <>
      <path d="M84 14 Q100 50 84 88" fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M84 14 L84 88" stroke={bone} strokeWidth="1" />
      <path d="M30 100 L34 70 L66 70 L70 100 Z" fill={shade} />
      <g stroke={main} strokeWidth="3" strokeLinecap="round">
        <path d="M40 76 H60 M38 84 H62 M40 92 H60" />
      </g>
      <path d="M28 36 Q28 10 50 10 Q72 10 72 36 Q72 50 64 54 L64 64 L36 64 L36 54 Q28 50 28 36 Z" fill={main} />
      <circle cx="40" cy="36" r="7" fill={shade} />
      <circle cx="60" cy="36" r="7" fill={shade} />
      <circle cx="40" cy="36" r="2.4" fill={eye} />
      <circle cx="60" cy="36" r="2.4" fill={eye} />
      <path d="M47 48 L50 42 L53 48 Z" fill={shade} />
      <path d="M40 58 V64 M45 58 V64 M50 58 V64 M55 58 V64 M60 58 V64" stroke={shade} strokeWidth="1.6" />
    </>
  );
}

function Hydra() {
  return (
    <>
      <path d="M20 100 Q24 70 50 66 Q76 70 80 100 Z" fill={shade} />
      <path d="M50 70 Q48 40 50 30" fill="none" stroke={main} strokeWidth="11" strokeLinecap="round" />
      <path d="M40 72 Q24 52 18 40" fill="none" stroke={main} strokeWidth="10" strokeLinecap="round" />
      <path d="M60 72 Q76 52 82 40" fill="none" stroke={main} strokeWidth="10" strokeLinecap="round" />
      {[
        [50, 22],
        [16, 34],
        [84, 34],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M-11 4 Q-12 -10 0 -12 Q12 -10 11 4 L4 10 L-4 10 Z" fill={main} />
          <path d="M-6 -4 L-2 -2 M6 -4 L2 -2" stroke={eye} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M-4 8 L-3 12 L-1 8 Z M4 8 L3 12 L1 8 Z" fill={bone} />
          <path d="M-8 -9 L-11 -16 L-4 -11 Z M8 -9 L11 -16 L4 -11 Z" fill={shade} />
        </g>
      ))}
    </>
  );
}

function Goblins() {
  const head = (x: number, y: number, s: number, key: number) => (
    <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-26 -6 L-12 -2 L-14 6 Z M26 -6 L12 -2 L14 6 Z" fill={main} />
      <ellipse cx="0" cy="2" rx="14" ry="15" fill={main} />
      <circle cx="-5" cy="0" r="2.6" fill={eye} />
      <circle cx="5" cy="0" r="2.6" fill={eye} />
      <path d="M-6 9 Q0 13 6 9" fill="none" stroke={shade} strokeWidth="2" strokeLinecap="round" />
      <path d="M-3 10 L-2 14 L-1 10 Z" fill={bone} />
    </g>
  );
  return (
    <>
      <path d="M2 100 Q10 76 50 74 Q90 76 98 100 Z" fill={shade} />
      {head(22, 50, 0.8, 0)}
      {head(78, 50, 0.8, 1)}
      {head(50, 40, 1.05, 2)}
      <path d="M50 70 L54 92 M30 70 L24 94 M70 70 L78 92" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

function Dragon() {
  return (
    <>
      <path d="M2 40 Q20 30 30 50 Q22 46 14 52 Q10 44 2 40 Z" fill={shade} />
      <path d="M98 40 Q80 30 70 50 Q78 46 86 52 Q90 44 98 40 Z" fill={shade} />
      <path d="M34 22 Q28 6 36 0 Q36 12 42 18 Z M66 22 Q72 6 64 0 Q64 12 58 18 Z" fill={bone} />
      <path d="M30 30 Q50 12 70 30 L72 54 Q70 70 62 82 L38 82 Q30 70 28 54 Z" fill={main} />
      <path d="M36 82 Q50 100 64 82 L60 76 L40 76 Z" fill={main} />
      <path d="M36 42 L46 46 L36 48 Z M64 42 L54 46 L64 48 Z" fill={eye} />
      <path d="M44 88 L46 94 L48 88 Z M52 88 L54 94 L56 88 Z" fill={bone} />
      <circle cx="45" cy="76" r="1.8" fill={shade} />
      <circle cx="55" cy="76" r="1.8" fill={shade} />
      <path d="M40 30 L50 24 L60 30 L50 34 Z" fill={accent} />
      <path d="M32 58 Q50 66 68 58" fill="none" stroke={shade} strokeWidth="2" />
    </>
  );
}

function Mimic() {
  return (
    <>
      <path d="M10 56 L90 56 L86 96 L14 96 Z" fill={main} />
      <path d="M10 56 L90 56 L86 66 L14 66 Z" fill={shade} />
      <path d="M8 50 Q50 8 92 50 L84 40 Q50 18 16 40 Z" fill={main} />
      <path d="M16 40 Q50 18 84 40 L92 50 L8 50 Z" fill={shade} />
      <path d="M14 50 L20 60 L26 50 L32 60 L38 50 L44 60 L50 50 L56 60 L62 50 L68 60 L74 50 L80 60 L86 50" fill={bone} />
      <path d="M40 52 Q50 74 60 52 Q54 62 50 80 Q46 62 40 52 Z" fill={accent} />
      <circle cx="36" cy="38" r="4" fill={eye} />
      <circle cx="64" cy="38" r="4" fill={eye} />
      <rect x="44" y="70" width="12" height="12" rx="2" fill={bone} />
      <path d="M10 76 H90" stroke={shade} strokeWidth="2" />
    </>
  );
}

const ART = {
  elf: Elf,
  troll: Troll,
  knight: Knight,
  mummy: Mummy,
  witch: Witch,
  specter: Specter,
  cyclops: Cyclops,
  skeleton: Skeleton,
  hydra: Hydra,
  goblins: Goblins,
  dragon: Dragon,
  mimic: Mimic,
  boss: Boss,
} as const;

/** Portrait d'un ennemi ou du boss. */
export function EnemyArt({ enemy, className }: { enemy: EnemyId | "boss"; className?: string }) {
  const Art = ART[enemy];
  return (
    <svg className={`enemy-art${className ? ` ${className}` : ""}`} data-art={enemy} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}

/** Un cœur (vie), plein ou vide. */
export function Heart({ empty = false }: { empty?: boolean }) {
  return (
    <svg className={`dg-heart${empty ? " empty" : ""}`} viewBox="0 0 24 22" aria-hidden="true" focusable="false">
      <path d="M12 21 C5 15 1 11 1 6.5 A5.5 5.5 0 0 1 12 4 A5.5 5.5 0 0 1 23 6.5 C23 11 19 15 12 21 Z" />
    </svg>
  );
}

/** Un coffre (salle de butin, ou mimique encore déguisée). */
export function ChestIcon({ className }: { className?: string }) {
  return (
    <svg className={`room-icon chest${className ? ` ${className}` : ""}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="M10 48 Q50 14 90 48 L90 56 L10 56 Z" fill="var(--dg-wood)" />
      <path d="M10 56 L90 56 L88 92 L12 92 Z" fill="var(--dg-wood)" />
      <path d="M10 56 H90 M12 74 H88" stroke="var(--dg-shadow)" strokeWidth="3" />
      <path d="M22 34 L22 92 M78 34 L78 92" stroke="var(--dg-gold)" strokeWidth="5" />
      <rect x="42" y="50" width="16" height="16" rx="3" fill="var(--dg-gold)" />
      <circle cx="50" cy="58" r="3" fill="var(--dg-shadow)" />
    </svg>
  );
}

/** Le sac à dos du joueur. */
export function BagIcon({ className }: { className?: string }) {
  return (
    <svg className={`room-icon bag${className ? ` ${className}` : ""}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="M36 26 Q36 8 50 8 Q64 8 64 26" fill="none" stroke="var(--dg-wood)" strokeWidth="7" strokeLinecap="round" />
      <path d="M22 40 Q22 22 50 22 Q78 22 78 40 L82 82 Q82 94 70 94 L30 94 Q18 94 18 82 Z" fill="var(--dg-wood)" />
      <path d="M22 40 Q50 58 78 40 L78 50 Q50 68 22 50 Z" fill="var(--dg-mimic-shade)" />
      <rect x="34" y="62" width="32" height="22" rx="5" fill="var(--dg-mimic-shade)" />
      <rect x="44" y="48" width="12" height="16" rx="3" fill="var(--dg-gold)" />
      <circle cx="50" cy="56" r="2.5" fill="var(--dg-shadow)" />
    </svg>
  );
}

/** Un sceau : le briser affaiblit le boss. */
export function SealIcon({ className }: { className?: string }) {
  return (
    <svg className={`room-icon seal${className ? ` ${className}` : ""}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--dg-ember)" strokeWidth="5" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="var(--dg-ember)" strokeWidth="2.5" strokeDasharray="5 4" />
      <path d="M50 18 L58 42 L82 42 L62 56 L70 80 L50 66 L30 80 L38 56 L18 42 L42 42 Z" fill="var(--dg-ember)" opacity="0.85" />
    </svg>
  );
}

/** Une salle d'ennemi encore dans l'ombre : deux lames croisées. */
export function SwordsIcon({ className }: { className?: string }) {
  return (
    <svg className={`room-icon swords${className ? ` ${className}` : ""}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g stroke="var(--dg-muted)" strokeWidth="6" strokeLinecap="round">
        <path d="M22 22 L74 74 M78 22 L26 74" />
      </g>
      <g stroke="var(--dg-edge)" strokeWidth="8" strokeLinecap="round">
        <path d="M66 82 L82 66 M18 66 L34 82" />
      </g>
    </svg>
  );
}

const ITEM_ART: Record<ItemId, () => ReactNode> = {
  heart: () => <path d="M50 88 C20 64 8 48 8 30 A20 20 0 0 1 50 20 A20 20 0 0 1 92 30 C92 48 80 64 50 88 Z" fill="var(--dg-blood)" />,
  shield: () => (
    <>
      <path d="M50 8 L86 20 L82 56 Q76 82 50 94 Q24 82 18 56 L14 20 Z" fill="var(--dg-steel)" />
      <path d="M50 18 L76 27 L73 55 Q68 74 50 84 Z" fill="var(--dg-steel-shade)" />
    </>
  ),
  hourglass: () => (
    <>
      <path d="M22 8 H78 M22 92 H78" stroke="var(--dg-wood)" strokeWidth="7" strokeLinecap="round" />
      <path d="M28 12 Q28 40 50 50 Q28 60 28 88 H72 Q72 60 50 50 Q72 40 72 12 Z" fill="var(--dg-parchment)" opacity="0.85" />
      <path d="M36 80 Q50 64 64 80 Z M40 22 H60 Q56 36 50 42 Q44 36 40 22 Z" fill="var(--dg-gold)" />
    </>
  ),
  "second-chance": () => (
    <>
      <path d="M50 14 A36 36 0 1 1 18 34" fill="none" stroke="var(--dg-heal)" strokeWidth="9" strokeLinecap="round" />
      <path d="M8 18 L22 40 L36 22 Z" fill="var(--dg-heal)" />
    </>
  ),
  key: () => (
    <>
      <circle cx="32" cy="34" r="18" fill="none" stroke="var(--dg-gold)" strokeWidth="9" />
      <path d="M44 46 L86 88 M70 72 L80 62 M78 80 L88 70" stroke="var(--dg-gold)" strokeWidth="9" strokeLinecap="round" />
    </>
  ),
  bomb: () => (
    <>
      <circle cx="44" cy="58" r="32" fill="var(--dg-shadow)" stroke="var(--dg-edge)" strokeWidth="3" />
      <path d="M62 30 Q70 18 82 16" fill="none" stroke="var(--dg-wood)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="84" cy="14" r="7" fill="var(--dg-ember)" />
      <circle cx="32" cy="46" r="7" fill="var(--dg-muted)" opacity="0.5" />
    </>
  ),
  phoenix: () => (
    <path d="M50 92 Q30 70 34 48 Q18 52 10 40 Q30 36 38 22 Q46 36 50 8 Q54 36 62 22 Q70 36 90 40 Q82 52 66 48 Q70 70 50 92 Z" fill="var(--dg-ember)" />
  ),
  banner: () => (
    <>
      <path d="M22 6 V96" stroke="var(--dg-wood)" strokeWidth="6" strokeLinecap="round" />
      <path d="M26 12 H84 L72 34 L84 56 H26 Z" fill="var(--dg-crimson)" />
      <path d="M44 22 L50 34 L44 46 M58 22 L64 34 L58 46" stroke="var(--dg-gold)" strokeWidth="3" fill="none" />
    </>
  ),
  purse: () => (
    <>
      <path d="M30 30 Q14 60 22 82 Q50 98 78 82 Q86 60 70 30 Z" fill="var(--dg-wood)" />
      <path d="M30 30 Q50 20 70 30 L64 22 Q50 14 36 22 Z" fill="var(--dg-shadow)" />
      <circle cx="50" cy="62" r="12" fill="var(--dg-gold)" />
      <path d="M50 54 V70" stroke="var(--dg-wood)" strokeWidth="3" />
    </>
  ),
  map: () => (
    <>
      <path d="M8 18 L36 8 L64 18 L92 8 V82 L64 92 L36 82 L8 92 Z" fill="var(--dg-parchment)" />
      <path d="M36 8 V82 M64 18 V92" stroke="var(--dg-linen-shade)" strokeWidth="2" />
      <path d="M18 70 Q34 50 48 56 Q62 62 76 34" fill="none" stroke="var(--dg-crimson)" strokeWidth="3" strokeDasharray="5 4" />
      <path d="M70 28 L82 40 M82 28 L70 40" stroke="var(--dg-crimson)" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
};

/** L'icône d'un objet de butin. */
export function ItemIcon({ item, className }: { item: ItemId; className?: string }) {
  const Art = ITEM_ART[item];
  return (
    <svg className={`item-icon${className ? ` ${className}` : ""}`} data-item={item} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
