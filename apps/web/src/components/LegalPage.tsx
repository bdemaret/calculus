import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LEGAL_UPDATED, legalContacts } from "@/lib/legal";

/** Un paragraphe, ou une liste à puces quand c'est un tableau. */
type Block = string | string[];
interface Section {
  title: string;
  body: Block[];
}

export type LegalDoc = "notice" | "privacy" | "terms";

/**
 * Page légale rendue depuis `messages/*.json` (`legal.<doc>.sections`).
 * Les textes sont lus bruts (`t.raw`) : les marqueurs {publisher} et {contact} sont remplacés ici.
 */
export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const { publisher, contact } = legalContacts();
  const fill = (text: string) =>
    text.replaceAll("{publisher}", publisher || t("anonymousPublisher")).replaceAll("{contact}", contact || t("missingContact"));
  const sections = t.raw(`${doc}.sections`) as Section[];

  return (
    <article className="legal">
      <header className="stack">
        <h2>{t(`${doc}.title`)}</h2>
        <p className="muted">{t("updated", { date: format.dateTime(new Date(LEGAL_UPDATED), { dateStyle: "long" }) })}</p>
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          {section.body.map((block, i) =>
            typeof block === "string" ? (
              <p key={i}>{fill(block)}</p>
            ) : (
              <ul key={i}>
                {block.map((item) => (
                  <li key={item}>{fill(item)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
      <p className="muted">
        <Link href="/legal">{t("notice.title")}</Link> · <Link href="/privacy">{t("privacy.title")}</Link> ·{" "}
        <Link href="/terms">{t("terms.title")}</Link>
      </p>
    </article>
  );
}
