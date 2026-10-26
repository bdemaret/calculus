import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OnlineCount } from "@/components/OnlineCount";
import { themeInitScript } from "@/lib/theme";
import "../globals.css";

// Polices chargées directement depuis Google Fonts par le navigateur.
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=Caveat:wght@500;700&display=swap";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: { default: "Calculus", template: "%s · Calculus" }, description: t("description") };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // suppressHydrationWarning : data-theme est posé par le script avant l'hydratation.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body>
        <NextIntlClientProvider>
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
