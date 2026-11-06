import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadDungeonRun } from "@calculus/db";
import { DIFFICULTIES, type Difficulty, type DungeonLossReason, type DungeonSummary } from "@calculus/game-core";
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

/** Bilan d'une expédition enregistrée : visible de ses seuls membres. */
export default async function DungeonReportPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  if (!session) return redirect({ href: "/login?next=/dungeon", locale });
  const run = id.length <= 64 ? await loadDungeonRun(id).catch(() => null) : null;
  // Une expédition dont on n'était pas : même réponse qu'une expédition inexistante.
  if (!run || !run.players.some((p) => p.userId === session.user.id)) notFound();
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
      bossDamage: p.bossDamage,
      heartsGiven: p.heartsGiven,
      heartsReceived: p.heartsReceived,
      itemsFound: p.itemsFound,
      correct: p.correct,
      answered: p.answered,
      avgTimeMs: p.avgTimeMs,
    })),
  };
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
