import { redirect } from "@/i18n/navigation";

/** Ancienne adresse : les modes sont présentés avec les jeux. */
export default async function ModesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return redirect({ href: "/games", locale });
}
