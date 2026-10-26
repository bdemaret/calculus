import { getTranslations, setRequestLocale } from "next-intl/server";
import { GAMES, GAME_IDS } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { HeroCalc } from "@/components/HeroCalc";
import { PublicLobbies } from "@/components/PublicLobbies";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="home">
      <div className="home-main">
        <section className="hero">
          <h1 className="headline">{t.rich("home.title", { hl: (chunks) => <mark className="hl">{chunks}</mark> })}</h1>
          <p className="lede">{t("home.lede")}</p>
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
        </section>
        <p className="feedback-cta">
          <Link className="btn ghost" href={{ pathname: "/feedback", query: { from: "/" } }}>
            {t("home.feedback")}
          </Link>
        </p>
        <section className="modes">
          <h2>{t("home.gamesTitle")}</h2>
          <div className="mode-list">
            {GAME_IDS.map((g) => (
              <div className="mode-item" key={g}>
                <h3>
                  {t(`games.${g}.name`)} <span className="tag">{t(`games.${g}.short`)}</span>
                </h3>
                <p className="muted">{t(`games.${g}.long`)}</p>
                <p className="muted">
                  {t("gamesPage.playableIn")} {GAMES[g].modes.map((m) => t(`modes.${m}.name`)).join(" · ")}
                </p>
              </div>
            ))}
          </div>
          <Link className="link-btn" href="/games">
            {t("home.allRules")}
          </Link>
        </section>
      </div>
      <PublicLobbies />
    </div>
  );
}
