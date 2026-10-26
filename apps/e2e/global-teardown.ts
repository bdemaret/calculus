import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * `next dev` réécrit `apps/web/next-env.d.ts` avec son dossier de build (`.next-e2e`) :
 * on remet la référence à `.next` pour ne pas laisser de modification dans le dépôt.
 */
export default function globalTeardown() {
  const file = fileURLToPath(new URL("../web/next-env.d.ts", import.meta.url));
  const content = readFileSync(file, "utf8");
  const restored = content.replaceAll("./.next-e2e/", "./.next/");
  if (restored !== content) writeFileSync(file, restored);
}
