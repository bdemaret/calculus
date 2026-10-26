import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { FeedbackForm } from "./FeedbackForm";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "feedback" });
  return { title: t("title") };
}

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const raw = await searchParams;
  const session = await getSession().catch(() => null);
  // Page d'où vient le joueur (`?from=/solo`), validée par la route API avant d'être enregistrée.
  const from = typeof raw.from === "string" && /^\/[\w\-/]{0,199}$/.test(raw.from) ? raw.from : undefined;
  const kind = raw.kind === "bug" || raw.kind === "idea" ? raw.kind : undefined;
  return <FeedbackForm signedIn={!!session} from={from} initialKind={kind} />;
}
