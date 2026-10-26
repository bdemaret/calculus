import { jwtVerify } from "jose";

export interface GameIdentity {
  id: string;
  name: string;
  guest: boolean;
}

const secret = () => {
  const s = process.env.GAME_TOKEN_SECRET;
  if (!s) throw new Error("GAME_TOKEN_SECRET manquant : copie .env.example en .env");
  return new TextEncoder().encode(s);
};

/** Vérifie le jeton signé par le site. Renvoie null s'il est absent, falsifié ou expiré. */
export async function verifyGameToken(token: unknown): Promise<GameIdentity | null> {
  if (typeof token !== "string" || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "calculus-web", audience: "calculus-game" });
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 20) : "";
    if (typeof payload.sub !== "string" || !name) return null;
    return { id: payload.sub, name, guest: payload.guest === true };
  } catch {
    return null;
  }
}
