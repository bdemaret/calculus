import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Message affiché à un compte banni à la place d'un jeu en ligne : ce qui est fermé, et comment contester. */
export function BannedNotice() {
  const t = useTranslations("banned");
  return (
    <section className="report" data-testid="banned-notice">
      <div className="setup-head">
        <h1>{t("title")}</h1>
      </div>
      <p className="form-error">{t("text")}</p>
      <p>{t("appeal")}</p>
      <div className="actions">
        <Link className="btn" href="/feedback">
          {t("contact")}
        </Link>
        <Link className="btn ghost" href="/solo">
          {t("solo")}
        </Link>
      </div>
    </section>
  );
}
