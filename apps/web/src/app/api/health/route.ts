/** Route de santé pour l'hébergeur : le site répond (sans toucher à la base). */
export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
