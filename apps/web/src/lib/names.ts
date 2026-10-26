/** Nettoie un pseudo : espaces superflus retirés, 20 caractères maximum. */
export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}
