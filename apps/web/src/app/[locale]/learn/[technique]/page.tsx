import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isTechniqueId } from "@calculus/game-core";
import { PracticeClient } from "./PracticeClient";
import { publicPage } from "@/lib/seo";

type Params = Promise<{ locale: string; technique: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, technique } = await params;
  if (!isTechniqueId(technique)) return {};
  const t = await getTranslations({ locale });
  return publicPage(locale, `/learn/${technique}`, t("learn.practiceTitle", { name: t(`techniques.${technique}.name`) }), t(`techniques.${technique}.summary`));
}

export default async function PracticePage({ params }: { params: Params }) {
  const { locale, technique } = await params;
  if (!isTechniqueId(technique)) notFound();
  setRequestLocale(locale);
  return <PracticeClient technique={technique} />;
}
