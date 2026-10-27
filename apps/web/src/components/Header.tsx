import { getTranslations } from "next-intl/server";
import { prisma } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { isAdminUser } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { HeaderTools } from "./HeaderTools";
import { Avatar } from "./PlayerChips";
import { InviteNotice } from "./InviteNotice";
import { LobbyBanner } from "./LobbyBanner";

export async function Header() {
  const t = await getTranslations("nav");
  const session = await getSession().catch(() => null);
  // Demandes d'ami reçues en attente : pastille sur le pseudo, qui mène alors à l'onglet Amis.
  const requests = session
    ? await prisma.friendship.count({ where: { addresseeId: session.user.id, status: "pending" } }).catch(() => 0)
    : 0;
  // Invitations à entrer dans une guilde : pastille sur le lien « Guilde ».
  const guildInvites = session ? await prisma.guildInvite.count({ where: { toId: session.user.id } }).catch(() => 0) : 0;
  return (
    <>
      <header className="top">
        <Link className="brand" href="/" aria-label={t("home")} style={{ textDecoration: "none" }}>
          <span className="brand-name">Calculus</span>
          <span className="brand-note">{t("tagline")}</span>
        </Link>
        <nav className="tools" aria-label={t("main")}>
          <Link className="nav-link" href="/games">
            {t("games")}
          </Link>
          <Link className="nav-link" href="/learn">
            {t("learn")}
          </Link>
          <Link className="nav-link" href="/leaderboard">
            {t("leaderboard")}
          </Link>
          {session ? (
            <>
              {isAdminUser(session.user.id) ? (
                <Link className="nav-link" href="/admin">
                  {t("admin")}
                </Link>
              ) : null}
              <Link className="nav-link" href="/dashboard">
                {t("dashboard")}
              </Link>
              <Link className="nav-link nav-guild" href="/guild" aria-label={guildInvites > 0 ? t("guildInvites", { count: guildInvites }) : undefined}>
                {t("guild")}
                {guildInvites > 0 ? <span className="nav-dot" aria-hidden="true">{guildInvites > 9 ? "9+" : guildInvites}</span> : null}
              </Link>
              <Link
                className="nav-link nav-profile"
                href={requests > 0 ? "/profile/friends" : "/profile"}
                aria-label={requests > 0 ? t("profileRequests", { name: session.user.name, count: requests }) : undefined}
              >
                <span className="nav-avatar">
                  <Avatar name={session.user.name} image={session.user.image} />
                  {requests > 0 ? <span className="nav-dot" aria-hidden="true">{requests > 9 ? "9+" : requests}</span> : null}
                </span>
                {session.user.name}
              </Link>
            </>
          ) : (
            <Link className="nav-link" href="/login">
              {t("login")}
            </Link>
          )}
          <HeaderTools showLanguage={!session} />
        </nav>
      </header>
      <LobbyBanner />
      {session ? <InviteNotice /> : null}
    </>
  );
}
