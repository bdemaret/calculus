import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetForm } from "@/components/AuthForms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("resetTitle") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
