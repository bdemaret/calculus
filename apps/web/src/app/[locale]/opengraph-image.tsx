import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export const alt = "Calculus";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Aperçu des liens partagés (réseaux, messageries), aux couleurs du cahier de `globals.css`. */
export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: "meta" });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#f7f9fc", borderLeft: "12px solid #e2384d" }}>
        <div style={{ fontSize: 132, fontWeight: 700, color: "#1f3a9e" }}>Calculus</div>
        <div style={{ fontSize: 48, color: "#1f3a9e", marginTop: 24, padding: "4px 16px", background: "#ffe14d", alignSelf: "flex-start" }}>{t("tagline")}</div>
      </div>
    ),
    size,
  );
}
