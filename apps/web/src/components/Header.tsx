import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { isAdminUser } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { Avatar } from "./PlayerChips";
import { DungeonReturnNotice } from "./DungeonReturnNotice";
import { InviteNotice } from "./InviteNotice";
import { LobbyBanner } from "./LobbyBanner";
import { ReleaseNotice } from "./ReleaseNotice";
import { SiteMenu } from "./SiteMenu";

/** Session et compteurs de navigation, lus une fois par requête pour l'en-tête et le menu de la marge. */
const getNavData = cache(async () => {
  const session = await getSession().catch(() => null);
  if (!session) return { session: null, requests: 0, guildInvites: 0 };
  const [requests, guildInvites] = await Promise.all([
    // Demandes d'ami reçues en attente : pastille sur l'avatar, qui mène alors à l'onglet Amis.
    prisma.friendship.count({ where: { addresseeId: session.user.id, status: "pending" } }).catch(() => 0),
    // Invitations à entrer dans une guilde : pastille sur le bouton du menu et sur « Guilde ».
    prisma.guildInvite.count({ where: { toId: session.user.id } }).catch(() => 0),
  ]);
  return { session, requests, guildInvites };
});

/** Haut de la marge : bouton du menu du site et retour à l'accueil. */
export async function MarginNav() {
  const { session, requests, guildInvites } = await getNavData();
  return (
    <SiteMenu
      signedIn={!!session}
      isAdmin={session ? isAdminUser(session.user.id) : false}
      requests={requests}
      guildInvites={guildInvites}
    />
  );
}

/** En-tête : le nom du site, le calcul du jour et le compte. Le reste est dans le menu de la marge. */
export async function Header() {
  const t = await getTranslations("nav");
  const { session, requests } = await getNavData();
  return (
    <>
      <header className="top">
        <Link className="brand" href="/" aria-label={`Calculus ${t("tagline")}, ${t("home")}`} style={{ textDecoration: "none" }}>
          <span className="brand-name">Calculus</span>
          <span className="brand-note">{t("tagline")}</span>
        </Link>
        <nav className="tools" aria-label={t("shortcuts")}>
          <Link className="nav-link nav-daily" href="/daily">
            {t("daily")}
          </Link>
          {session ? (
            <Link
              className="nav-link nav-profile"
              href={requests > 0 ? "/profile/friends" : "/profile"}
              aria-label={requests > 0 ? t("profileRequests", { name: session.user.name, count: requests }) : undefined}
            >
              <span className="nav-avatar">
                <Avatar name={session.user.name} image={session.user.image} />
                {requests > 0 ? <span className="nav-dot" aria-hidden="true">{requests > 9 ? "9+" : requests}</span> : null}
              </span>
              <span className="nav-name">{session.user.name}</span>
            </Link>
          ) : (
            <Link className="nav-link" href="/login">
              {t("login")}
            </Link>
          )}
        </nav>
      </header>
      <LobbyBanner />
      {session ? <DungeonReturnNotice /> : null}
      {session ? <InviteNotice /> : null}
      <ReleaseNotice />
    </>
  );
}
