import "server-only";
import { consumeRateLimit } from "@calculus/db";

/**
 * Adresse du visiteur. Sur Vercel, `x-real-ip` et `x-forwarded-for` sont posés par la plateforme
 * (une valeur envoyée par le client est remplacée) ; en local, il n'y en a pas.
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
