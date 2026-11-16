"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { HeaderTools } from "./HeaderTools";

export type SiteMenuProps = {
  signedIn: boolean;
  isAdmin: boolean;
  /** Invitations de guilde en attente : pastille sur le bouton du menu et sur « Guilde ». */
  guildInvites: number;
  /** Demandes d'ami en attente : « Mon profil » mène alors à l'onglet Amis. */
  requests: number;
};

type Item = { href: string; label: string; badge?: number; match?: string; ariaLabel?: string };

/** Pastille rouge d'un compteur (9+ au-delà). */
function Dot({ count }: { count: number }) {
  return count > 0 ? (
    <span className="nav-dot" aria-hidden="true">
      {count > 9 ? "9+" : count}
    </span>
  ) : null;
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/**
 * Boutons de la marge (menu et retour à l'accueil) et menu du site, qui se déroule depuis la marge.
 * Une `<dialog>` modale : focus gardé dedans, Échap et clic à côté la ferment, la page derrière est inerte.
 */
export function SiteMenu({ signedIn, isAdmin, guildInvites, requests }: SiteMenuProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);

  // Une navigation (lien du menu, retour arrière) referme le menu.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const groups: { title: string; items: Item[] }[] = [
    {
      title: t("groupPlay"),
      items: [
        { href: "/", label: t("homeShort") },
        { href: "/daily", label: t("daily") },
        { href: "/games", label: t("games") },
        ...(signedIn ? [{ href: "/dungeon", label: t("dungeon") }] : []),
      ],
    },
    {
      title: t("groupProgress"),
      items: [
        { href: "/learn", label: t("learn") },
        { href: "/leaderboard", label: t("leaderboard") },
        ...(signedIn ? [{ href: "/dashboard", label: t("dashboard") }] : []),
      ],
    },
    {
      title: t("groupAccount"),
      items: signedIn
        ? [
            { href: requests > 0 ? "/profile/friends" : "/profile", match: "/profile", label: t("profile"), badge: requests, ariaLabel: requests > 0 ? t("profileRequests", { name: t("profile"), count: requests }) : undefined },
            { href: "/guild", label: t("guild"), badge: guildInvites, ariaLabel: guildInvites > 0 ? t("guildInvites", { count: guildInvites }) : undefined },
            ...(isAdmin ? [{ href: "/admin", label: t("admin") }] : []),
          ]
        : [
            { href: "/login", label: t("login") },
            { href: "/signup", label: t("signup") },
          ],
    },
  ];

  const isCurrent = (item: Item) => {
    const base = item.match ?? item.href;
    return base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`);
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <div className="margin-nav">
        <button
          type="button"
          className="margin-btn"
          aria-haspopup="dialog"
          aria-controls="site-menu"
          aria-label={guildInvites > 0 ? t("openMenuInvites", { count: guildInvites }) : t("openMenu")}
          title={t("openMenu")}
          onClick={() => dialog.current?.showModal()}
        >
          <Icon>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </Icon>
          <Dot count={guildInvites} />
        </button>
        <span className="margin-btn-label" aria-hidden="true">
          {t("menu")}
        </span>
        {pathname === "/" ? null : (
          <Link className="margin-btn" href="/" aria-label={t("home")} title={t("home")}>
            <Icon>
              <path d="M4 11.5 12 4l8 7.5" />
              <path d="M6.5 9.5V20h11V9.5" />
              <path d="M10 20v-5.5h4V20" />
            </Icon>
          </Link>
        )}
      </div>
      <dialog
        id="site-menu"
        ref={dialog}
        className="site-menu"
        aria-labelledby="site-menu-title"
        // Un clic sur le fond ferme le menu. Le fond a pour cible la dialog elle-même, mais aussi la partie
        // du panneau encore masquée pendant l'animation : on ne ferme que hors du rectangle du panneau.
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) close();
        }}
      >
        <div className="site-menu-gutter">
          <button type="button" className="margin-btn" aria-label={t("closeMenu")} title={t("closeMenu")} onClick={close}>
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>
        <div className="site-menu-body">
          <h2 id="site-menu-title" className="site-menu-title">
            {t("menu")}
          </h2>
          <nav aria-label={t("main")}>
            {groups.map((g) => (
              <section key={g.title} className="site-menu-group">
                <h3 className="site-menu-kicker">{g.title}</h3>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="site-menu-link"
                        aria-current={isCurrent(item) ? "page" : undefined}
                        aria-label={item.ariaLabel}
                        // Même adresse : pas de navigation, donc on ferme à la main.
                        onClick={close}
                      >
                        {item.label}
                        <Dot count={item.badge ?? 0} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          <section className="site-menu-group">
            <h3 className="site-menu-kicker">{t("groupSettings")}</h3>
            <div className="site-menu-tools">
              <HeaderTools showLanguage={!signedIn} />
            </div>
          </section>
        </div>
      </dialog>
    </>
  );
}
