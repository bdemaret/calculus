import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPlayerProfile } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { PlayerView } from "./PlayerView";

type Params = Promise<{ locale: string; id: string }>;

/* Les id de compte font une trentaine de caractères : on écarte d'emblée les valeurs farfelues. */
const MAX_ID_LENGTH = 64;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "player" });
  const profile = id.length <= MAX_ID_LENGTH ? await getPlayerProfile(id) : null;
  return { title: profile ? t("title", { name: profile.name }) : t("notFound") };
}

/** Profil public d'un joueur, ouvert depuis le classement. */
export default async function PlayerPage({ params }: { params: Params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (id.length > MAX_ID_LENGTH) notFound();
  const session = await getSession().catch(() => null);
  const profile = await getPlayerProfile(id, session?.user.id);
  if (!profile) notFound();
  return <PlayerView profile={profile} />;
}
