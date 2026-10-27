import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { DIFFICULTIES, TECHNIQUES, TECHNIQUE_IDS, detectTechnique, renderTokens, techniquesOfLevel, type Difficulty } from "@calculus/game-core";
import { MathText } from "@/components/MathText";
import { TechniqueSteps } from "@/components/TechniqueSteps";
import { Link } from "@/i18n/navigation";
import { LearnHashRedirect } from "./LearnHashRedirect";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Niveau affiché (`?level=1..5`) ; une valeur absente ou invalide ouvre le niveau 1. */
const query = z.object({
  level: z.coerce
    .number()
    .int()
    .refine((d): d is Difficulty => DIFFICULTIES.includes(d as Difficulty))
    .catch(1),
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "learn" });
  return { title: t("title") };
}

/** Techniques de calcul : un onglet par niveau, une fiche « À retenir » par technique du niveau. */
export default async function LearnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const level = query.parse(await searchParams).level as Difficulty;
  const techniques = techniquesOfLevel(level);
  const prev = DIFFICULTIES.find((d) => d === level - 1);
  const next = DIFFICULTIES.find((d) => d === level + 1);
  const levelLabel = (d: Difficulty) => `${d} · ${t(`levels.${d}`)}`;

  return (
    <section className="setup">
      {/* Les anciens liens `/learn#id` (sans niveau) ouvrent le niveau de la technique. */}
      <LearnHashRedirect level={level} levels={Object.fromEntries(TECHNIQUE_IDS.map((id) => [id, TECHNIQUES[id].level]))} />
      <div className="setup-head">
        <h2>{t("learn.title")}</h2>
        <p className="muted">{t("learn.intro")}</p>
      </div>
      <nav className="board-tabs" aria-label={t("learn.levelsNav")}>
        {DIFFICULTIES.map((d) => (
          <Link key={d} href={`/learn?level=${d}`} scroll={false} aria-current={d === level ? "page" : undefined}>
            {levelLabel(d)}
          </Link>
        ))}
      </nav>
      <h3 className="learn-level">
        {t("learn.level", { level, name: t(`levels.${level}`) })} <span className="tag">{t("learn.count", { count: techniques.length })}</span>
      </h3>
      <div className="technique-cards">
        {techniques.map(({ id }) => {
          // L'exemple de chaque technique est reconnu par elle (vérifié par les tests de game-core).
          const hint = detectTechnique(renderTokens(TECHNIQUES[id].example))!;
          return (
            <article className="technique-card" key={id} id={id} aria-labelledby={`${id}-name`}>
              <span className="technique-kicker">{t("learn.kicker")}</span>
              <h4 id={`${id}-name`}>{t(`techniques.${id}.name`)}</h4>
              <p className="muted">{t(`techniques.${id}.summary`)}</p>
              <p className="technique-example">
                <MathText text={hint.target} /> = <b>{hint.result}</b>
              </p>
              <TechniqueSteps hint={hint} explain={false} />
              <div className="technique-card-foot">
                <Link className="btn ghost" href={`/learn/${id}`} aria-label={t("learn.trainOn", { name: t(`techniques.${id}.name`) })}>
                  {t("learn.train")} →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <nav className="learn-pager" aria-label={t("learn.pagerNav")}>
        {prev ? (
          <Link href={`/learn?level=${prev}`}>← {t("learn.prevLevel", { name: levelLabel(prev) })}</Link>
        ) : (
          <span />
        )}
        {next ? <Link href={`/learn?level=${next}`}>{t("learn.nextLevel", { name: levelLabel(next) })} →</Link> : null}
      </nav>
    </section>
  );
}
