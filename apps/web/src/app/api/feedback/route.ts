import { NextResponse } from "next/server";
import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, createFeedback } from "@calculus/db";
import { routing } from "@/i18n/routing";
import { getSession } from "@/lib/auth";

const body = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(FEEDBACK_MIN_LENGTH).max(FEEDBACK_MAX_LENGTH),
  contact: z.union([z.literal(""), z.email().max(200)]).optional(),
  // Chemin interne seulement (pas d'adresse complète ni de paramètres ; « //hote » désignerait un autre site).
  page: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[\w\-/]*$/)
    .optional(),
  locale: z.enum(routing.locales),
  // Piège à robots : champ caché, toujours vide pour un humain.
  website: z.string().max(0).optional(),
});

/** Enregistre un retour ou un signalement de bug (connecté ou invité). */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const session = await getSession().catch(() => null);
  const { kind, message, contact, page, locale } = parsed.data;
  const ok = await createFeedback(
    {
      userId: session?.user.id ?? null,
      kind,
      message,
      // Connecté : l'e-mail du compte suffit, on n'en garde pas un second.
      contact: session ? null : contact || null,
      page: page ?? null,
      locale,
    },
    new Date(),
  );
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "too-many" }, { status: 429 });
}
