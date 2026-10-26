import { getTranslations, setRequestLocale } from "next-intl/server";
import { DIFFICULTIES, GAME_MODES, defaultSettings, generateQuestion } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "modesPage" });
  return { title: t("title") };
}

export default async function ModesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <section className="setup">
      <div className="setup-head">
        <h2>{t("modesPage.title")}</h2>
        <p className="muted">{t("modesPage.intro")}</p>
      </div>
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
      <div className="stack">
        <h3>{t("modesPage.turnTitle")}</h3>
        <p className="muted">{t("modesPage.turnText")}</p>
      </div>
      <div className="stack">
        <h3>{t("modesPage.levelsTitle")}</h3>
        <div className="bars">
          {DIFFICULTIES.map((d) => (
            <div className="bar-row" key={d} style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}>
              <strong>
                {d} · {t(`levels.${d}`)}
              </strong>
              <span className="example">{generateQuestion(`niveau-${d}`, 3, defaultSettings(d)).text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="actions">
        <Link className="btn" href="/solo">
          {t("home.playSolo")}
        </Link>
        <Link className="btn ghost" href="/online">
          {t("home.playOnline")}
        </Link>
      </div>
    </section>
  );
}
