"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/admin", key: "overview" },
  { href: "/admin/games", key: "games" },
  { href: "/admin/feedback", key: "feedback" },
  { href: "/admin/users", key: "users" },
] as const;

export function AdminTabs() {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  return (
    <nav className="board-tabs" aria-label={t("label")}>
      {TABS.map((tab) => {
        const current = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={current ? "page" : undefined}>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
