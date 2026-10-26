import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { HeaderTools } from "./HeaderTools";
import { InviteNotice } from "./InviteNotice";

export async function Header() {
  const t = await getTranslations("nav");
  const session = await getSession().catch(() => null);
  return (
    <>
      <header className="top">
        <Link className="brand" href="/" aria-label={t("home")} style={{ textDecoration: "none" }}>
          <span className="brand-name">Calculus</span>
          <span className="brand-note">{t("tagline")}</span>
        </Link>
        <nav className="tools" aria-label={t("main")}>
          <Link className="nav-link" href="/modes">
            {t("modes")}
          </Link>
          <Link className="nav-link" href="/leaderboard">
            {t("leaderboard")}
          </Link>
          {session ? (
            <>
              {isAdminEmail(session.user.email) ? (
                <Link className="nav-link" href="/admin">
                  {t("admin")}
                </Link>
              ) : null}
              <Link className="nav-link" href="/dashboard">
                {t("dashboard")}
              </Link>
              <Link className="nav-link" href="/profile">
                {session.user.name}
              </Link>
            </>
          ) : (
            <Link className="nav-link" href="/login">
              {t("login")}
            </Link>
          )}
          <HeaderTools />
        </nav>
      </header>
      {session ? <InviteNotice /> : null}
    </>
  );
}
