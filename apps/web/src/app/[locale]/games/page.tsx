import { getTranslations, setRequestLocale } from "next-intl/server";
import { DIFFICULTIES, GAMES, GAME_IDS, GAME_MODES, defaultSettings, generateQuestion } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gamesPage" });
  return { title: t("title") };
}

export default async function GamesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <section className="setup">
      <div className="setup-head">
        <h2>{t("gamesPage.title")}</h2>
        <p className="muted">{t("gamesPage.intro")}</p>
      </div>
      <h3>{t("gamesPage.gamesTitle")}</h3>
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
            {/* Lancer ce jeu : les réglages solo s'ouvrent avec lui déjà choisi. */}
            <div className="actions">
              {GAMES[g].solo ? (
                <Link className="btn" href={{ pathname: "/solo", query: { game: g } }} aria-label={t("gamesPage.playSoloGame", { game: t(`games.${g}.name`) })}>
                  {t("home.playSolo")}
                </Link>
              ) : (
                <Link className="btn ghost" href="/online" aria-label={t("gamesPage.playOnlineGame", { game: t(`games.${g}.name`) })}>
                  {t("home.playOnline")}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <h3>{t("gamesPage.modesTitle")}</h3>
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
        <h3>{t("gamesPage.turnTitle")}</h3>
        <p className="muted">{t("gamesPage.turnText")}</p>
      </div>
      <div className="stack">
        <h3>{t("gamesPage.levelsTitle")}</h3>
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
