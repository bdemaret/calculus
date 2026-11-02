"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/profile", key: "account" },
  { href: "/profile/achievements", key: "achievements" },
  { href: "/profile/friends", key: "friends" },
  { href: "/profile/preferences", key: "preferences" },
] as const;

/** Onglets du profil ; « Mes amis » porte le nombre de demandes reçues, « Mes succès » celui des nouveautés. */
export function ProfileTabs({ requests, newAchievements }: { requests: number; newAchievements: number }) {
  const t = useTranslations("profile");
  const pathname = usePathname();
  return (
    <nav className="board-tabs" aria-label={t("tabs.label")}>
      {TABS.map((tab) => {
        const current = tab.href === "/profile" ? pathname === "/profile" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={current ? "page" : undefined}>
            {t(`tabs.${tab.key}`)}
            {tab.key === "friends" && requests ? (
              <span className="tab-badge" title={t("friendRequests", { count: requests })}>
                {requests}
              </span>
            ) : null}
            {tab.key === "achievements" && newAchievements ? (
              <span className="tab-badge" title={t("newAchievements", { count: newAchievements })}>
                {newAchievements}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
