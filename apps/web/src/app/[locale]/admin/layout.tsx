import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/admin";
import { AdminTabs } from "./AdminTabs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Panel administrateur, réservé aux e-mails de `ADMIN_EMAILS`. Chaque page revérifie l'accès. */
export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations("admin");
  return (
    <section className="admin">
      <div className="setup-head">
        <h2>{t("title")}</h2>
      </div>
      <AdminTabs />
      {children}
    </section>
  );
}
