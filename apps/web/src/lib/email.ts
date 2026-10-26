import "server-only";
import { Resend } from "resend";

interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Envoie un e-mail avec Resend. Sans clé configurée, l'e-mail est affiché dans le terminal (pratique en local). */
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[e-mail non envoyé : RESEND_API_KEY vide]\nÀ : ${to}\nObjet : ${subject}\n\n${text}\n`);
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM ?? "Calculus <onboarding@resend.dev>", to, subject, text });
  if (error) console.error("[e-mail] échec de l'envoi", error);
}
