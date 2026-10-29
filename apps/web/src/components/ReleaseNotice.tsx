"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { APP_VERSION, RELEASE_SEEN_KEY, showsReleaseNotice } from "@/lib/releases";
import { local } from "@/lib/storage";

/**
 * Bandeau « nouvelle version », sous l'en-tête, pendant 48 h après une mise en production.
 * La version vue est retenue dans le navigateur (comptes et invités) : ouvrir les notes ou fermer le bandeau suffit.
 */
export function ReleaseNotice() {
  const t = useTranslations("changelog");
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  // Lu après le premier rendu : l'heure et le stockage n'existent que dans le navigateur.
  useEffect(() => {
    if (pathname === "/changelog") {
      local.set(RELEASE_SEEN_KEY, APP_VERSION);
      setShow(false);
    } else {
      setShow(showsReleaseNotice(Date.now(), local.get<string | null>(RELEASE_SEEN_KEY, null)));
    }
  }, [pathname]);

  if (!show) return null;
  const markSeen = () => {
    local.set(RELEASE_SEEN_KEY, APP_VERSION);
    setShow(false);
  };

  return (
    <div className="invite-notice release-notice" role="status">
      <span>{t("noticeText", { version: APP_VERSION })}</span>
      <span className="actions">
        <Link className="btn" href="/changelog" onClick={markSeen}>
          {t("noticeOpen")}
        </Link>
        <button className="link-btn" type="button" onClick={markSeen}>
          {t("noticeDismiss")}
        </button>
      </span>
    </div>
  );
}
