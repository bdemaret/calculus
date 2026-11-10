import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDailyResult, getDailyStreak, settleDailyChallenges } from "@calculus/db";
import { dailyDate, dailyEndsAt } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { DailyCard } from "@/components/DailyCard";
import { HeroCalc } from "@/components/HeroCalc";
import { PublicLobbies } from "@/components/PublicLobbies";
import { publicPage } from "@/lib/seo";
import "./home.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return publicPage(locale, "", { absolute: t("title") }, t("description"));
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const session = await getSession().catch(() => null);
  const now = new Date();
  // L'accueil reste affiché si la base répond mal : le calcul du jour apparaît alors comme à faire.
  await settleDailyChallenges(now).catch((e: unknown) => console.error("Calcul du jour : gagnants non désignés", e));
  const [result, streak] = session
    ? await Promise.all([getDailyResult(session.user.id, now).catch(() => null), getDailyStreak(session.user.id, now).catch(() => null)])
    : [null, null];
  return (
    <div className="home">
      <div className="home-main">
        <section className="hero">
          <h1 className="headline">{t.rich("home.title", { hl: (chunks) => <mark className="hl">{chunks}</mark> })}</h1>
          <p className="lede">{t("home.lede")}</p>
        </section>
        <DailyCard today={dailyDate(now.getTime())} loggedIn={!!session} result={result} streak={streak} now={now.getTime()} endsAt={dailyEndsAt(now.getTime())} />
        <section className="warmup" aria-labelledby="warmup-kicker">
          <HeroCalc />
        </section>
        <section className="choices" aria-label={t("home.choose")}>
          <Link className="choice primary" href="/online" style={{ textDecoration: "none" }}>
            <span className="choice-glyph" aria-hidden="true">×</span>
            <span className="choice-kicker">{t("home.playOnlineKicker")}</span>
            <span className="choice-title">{t("home.playOnline")}</span>
            <span className="choice-sub">{t("home.playOnlineSub")}</span>
          </Link>
          <Link className="choice" href="/solo" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="choice-glyph" aria-hidden="true">+</span>
            <span className="choice-kicker">{t("home.playSoloKicker")}</span>
            <span className="choice-title">{t("home.playSolo")}</span>
            <span className="choice-sub">{t("home.playSoloSub")}</span>
          </Link>
          {/* Les donjons sont réservés aux comptes : l'entrée n'apparaît qu'une fois connecté. */}
          {session ? (
            <Link className="choice choice-dungeon" href="/dungeon" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="choice-glyph" aria-hidden="true">⚔</span>
              <span className="choice-kicker">{t("home.dungeonKicker")}</span>
              <span className="choice-title">{t("home.dungeon")}</span>
              <span className="choice-sub">{t("home.dungeonSub")}</span>
            </Link>
          ) : null}
        </section>
      </div>
      <PublicLobbies />
    </div>
  );
}
