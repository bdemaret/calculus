import { redirect } from "@/i18n/navigation";

/** Ancienne adresse de « Mes amis », devenue un onglet du profil. */
export default async function FriendsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return redirect({ href: "/profile/friends", locale });
}
