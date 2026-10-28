import "server-only";
import { consumeRateLimit } from "@calculus/db";

/**
 * Adresse du visiteur, posée par le proxy de l'hébergeur (`x-real-ip`, puis le premier élément de
 * `x-forwarded-for`) ; en local, il n'y en a pas. À vérifier dans les journaux après un changement d'hébergeur.
 */
export function requestIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Vrai si la demande dépasse la limite (`max` par fenêtre de `windowMs`).
 * Coupé par `AUTH_RATE_LIMIT_DISABLED`, comme celui de Better Auth : les tests e2e viennent tous de la même IP.
 */
export async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  if (process.env.AUTH_RATE_LIMIT_DISABLED === "1") return false;
  return !(await consumeRateLimit(key, max, windowMs, Date.now()));
}
