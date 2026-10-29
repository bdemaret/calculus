import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { HeroCalc } from "@/components/HeroCalc";
import { PublicLobbies } from "@/components/PublicLobbies";
import "./home.css";

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
        </section>
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
        </section>
      </div>
      <PublicLobbies />
    </div>
  );
}
