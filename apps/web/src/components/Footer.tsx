import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Pied de page : liens vers les textes légaux et le formulaire de retour, présents sur toutes les pages. */
export async function Footer() {
  const t = await getTranslations("legal");
  const tf = await getTranslations("feedback");
  return (
    <footer className="site-footer">
      <Link href="/legal">{t("notice.title")}</Link>
      <Link href="/privacy">{t("privacy.title")}</Link>
      <Link href="/terms">{t("terms.title")}</Link>
      <Link href="/feedback">{tf("footer")}</Link>
    </footer>
  );
}
