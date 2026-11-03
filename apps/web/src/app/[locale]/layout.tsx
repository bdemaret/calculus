import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OnlineCount } from "@/components/OnlineCount";
import { ThemeSync } from "@/components/ThemeSync";
import { themeInitScript } from "@/lib/theme";
import { SITE_URL } from "@/lib/seo";
import "../globals.css";

// Polices téléchargées au build et servies par le site : rien ne bloque l'affichage et aucun visiteur ne contacte Google.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-bricolage" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-caveat", preload: false });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: "%s · Calculus" },
    description: t("description"),
    openGraph: { type: "website", siteName: "Calculus", title: t("title"), description: t("description") },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // suppressHydrationWarning : data-theme est posé par le script avant l'hydratation.
    <html lang={locale} className={`${display.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <ThemeSync />
          <div className="sheet">
            <aside className="margin">
              <div id="margin-notes" aria-live="polite" />
              <OnlineCount />
            </aside>
            <div className="content">
              <Header />
              <main>{children}</main>
              <Footer />
            </div>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
