"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { readOnline, subscribeOnline } from "@/lib/colyseus";

/** Nombre de joueurs connectés, en bas de la marge. Rien tant que le serveur de jeu n'a pas répondu. */
export function OnlineCount() {
  const t = useTranslations("common");
  const count = useSyncExternalStore(subscribeOnline, readOnline, () => null);
  if (count === null) return null;
  return (
    <p className="margin-online" title={t("onlineFull", { count })}>
      <span className="margin-online-count">{count}</span>
      <small>{t("online", { count })}</small>
    </p>
  );
}
