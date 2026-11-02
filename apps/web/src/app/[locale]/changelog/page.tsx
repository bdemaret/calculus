import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { RELEASES, releaseKey } from "@/lib/releases";
import { publicPage } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return publicPage(locale, "/changelog", t("title"), meta("changelog"));
}

/** Notes de version, de la plus récente à la plus ancienne (textes dans `changelog.notes`). */
export default async function ChangelogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");
  const format = await getFormatter();

  return (
    <article className="legal changelog">
      <header className="stack">
        <h1>{t("title")}</h1>
      </header>
      {RELEASES.map((r) => (
        <section key={r.version} id={releaseKey(r.version)}>
          <h3>
            {t("version", { version: r.version })}{" "}
            <time className="muted" dateTime={r.date}>
              {format.dateTime(new Date(r.date), { dateStyle: "long", timeZone: "UTC" })}
            </time>
          </h3>
          <ul>
            {(t.raw(`notes.${releaseKey(r.version)}`) as string[]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
