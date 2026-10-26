import { getTranslations, setRequestLocale } from "next-intl/server";
import { GAME_MODES } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { HeroCalc } from "@/components/HeroCalc";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <>
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
      <section className="modes">
        <h2>{t("home.modesTitle")}</h2>
        <div className="mode-list">
          {GAME_MODES.map((m) => (
            <div className="mode-item" key={m}>
              <h3>
                {t(`modes.${m}.name`)} <span className="tag">{t(`modes.${m}.short`)}</span>
              </h3>
              <p className="muted">{t(`modes.${m}.long`)}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
