"use client";
import { useEffect, useState } from "react";
import { authClient, useSession } from "./auth-client";
import { local } from "./storage";

/**
 * Conseils de technique en fin de partie : réglage du compte (`User.showTips`) une fois connecté,
 * sinon mémorisé dans ce navigateur (`calculus:tips`).
 */
export function useShowTips() {
  const { data: session, isPending } = useSession();
  const [guestShow, setGuestShow] = useState(true);
  // Lu après le premier rendu, pour que le serveur et le navigateur rendent la même page.
  useEffect(() => setGuestShow(local.get("tips", true)), []);

  const guest = !session;
  // Rien tant que la session n'est pas connue : pas de conseils qui apparaissent puis disparaissent.
  const show = !isPending && (session ? session.user.showTips !== false : guestShow);

  const setShow = async (on: boolean) => {
    if (session) {
      await authClient.updateUser({ showTips: on });
      return;
    }
    local.set("tips", on);
    setGuestShow(on);
  };

  return { show, guest, setShow };
}
