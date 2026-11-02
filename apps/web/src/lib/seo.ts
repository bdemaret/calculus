import type { Metadata } from "next";

/** Adresse publique du site : base des liens absolus (canonical, aperçus, sitemap). */
export const SITE_URL = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

/** Pages sans intérêt dans une recherche (compte, connexion, parties) ou liées à un joueur. Le robot doit pouvoir les lire pour voir cette consigne : ne pas les bloquer dans `robots.ts`. */
export const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

/** Métadonnées d'une page publique : `path` sans la langue (« /solo », « » pour l'accueil), requête comprise si elle change le contenu. */
export function publicPage(locale: string, path: string, title: Metadata["title"], description?: string): Metadata {
  const url = `/${locale}${path}`;
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Calculus",
      url,
      title: typeof title === "object" && title && "absolute" in title ? title.absolute : (title ?? undefined),
      ...(description ? { description } : {}),
      images: [`/${locale}/opengraph-image`],
    },
  };
}
