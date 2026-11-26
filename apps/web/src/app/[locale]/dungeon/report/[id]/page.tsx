import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadDungeonRun } from "@calculus/db";
import { DIFFICULTIES, type Difficulty, type DungeonJourneyStep, type DungeonLossReason, type DungeonSummary } from "@calculus/game-core";
import { Link, redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { NO_INDEX } from "@/lib/seo";
import { DungeonSummaryView } from "../../[code]/DungeonClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dungeon" });
  return { title: t("end.reportTitle"), ...NO_INDEX };
}

const LOSS_REASONS: DungeonLossReason[] = ["boss-not-reached", "no-enemy-defeated", "team-down", "boss-timeout"];

/** Bilan d'une expédition enregistrée : visible de tous les comptes (le classement y mène), comme le reste des donjons. */
export default async function DungeonReportPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  if (!session) return redirect({ href: "/login?next=/dungeon", locale });
  const run = id.length <= 64 ? await loadDungeonRun(id).catch(() => null) : null;
  if (!run) notFound();
  const t = await getTranslations({ locale, namespace: "dungeon" });
  const summary: DungeonSummary = {
    difficulty: (DIFFICULTIES.includes(run.difficulty as Difficulty) ? run.difficulty : 1) as Difficulty,
    outcome: run.outcome === "won" ? "won" : "lost",
    lossReason: LOSS_REASONS.find((r) => r === run.lossReason) ?? null,
    roundsPlayed: run.roundsPlayed,
    score: run.score,
    bossMaxHp: run.bossMaxHp,
    bossHp: run.bossHp,
    enemiesDefeated: run.enemiesDefeated,
    sealsBroken: run.sealsBroken,
    players: run.players.map((p) => ({
      id: p.userId ?? p.playerKey,
      name: p.displayName,
      lives: p.lives,
      livesLost: p.livesLost,
      enemiesDefeated: p.enemiesDefeated,
      points: p.points,
      // Expédition d'avant le partage du score : pas de détail (ses points ne comptaient que les salles).
      pointsDetail:
        p.roomPoints !== null && p.bossPoints !== null && p.lifePoints !== null && p.pursePoints !== null
          ? { rooms: p.roomPoints, boss: p.bossPoints, lives: p.lifePoints, purses: p.pursePoints }
          : null,
      bossDamage: p.bossDamage,
      heartsGiven: p.heartsGiven,
      heartsReceived: p.heartsReceived,
      itemsFound: p.itemsFound,
      correct: p.correct,
      answered: p.answered,
      avgTimeMs: p.avgTimeMs,
    })),
  };
  // Récap de fin, joueur par joueur : absent des expéditions enregistrées avant lui (la section ne s'affiche pas).
  const journeys = run.players.filter((p) => Array.isArray(p.journey));
  if (journeys.length) {
    summary.journeys = Object.fromEntries(journeys.map((p) => [p.userId ?? p.playerKey, p.journey as unknown as DungeonJourneyStep[]]));
  }
  return (
    <section className="dungeon-end">
      <p className="muted">{t("end.playedOn", { date: run.endedAt.toLocaleDateString(locale, { dateStyle: "long" }) })}</p>
      <DungeonSummaryView summary={summary} me={session.user.id} />
      <div className="actions">
        <Link className="btn" href="/dungeon">
          {t("end.newExpedition")}
        </Link>
      </div>
    </section>
  );
}
