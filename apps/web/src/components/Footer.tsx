import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { APP_VERSION } from "@/lib/releases";

/** Pied de page : liens vers les textes légaux, le formulaire de retour et les notes de version, présents sur toutes les pages. */
export async function Footer() {
  const t = await getTranslations("legal");
  const tf = await getTranslations("feedback");
  const tc = await getTranslations("changelog");
  return (
    <footer className="site-footer">
      <Link href="/legal">{t("notice.title")}</Link>
      <Link href="/privacy">{t("privacy.title")}</Link>
      <Link href="/terms">{t("terms.title")}</Link>
      <Link href="/feedback">{tf("footer")}</Link>
      <Link href="/changelog">{tc("footer", { version: APP_VERSION })}</Link>
    </footer>
  );
}
