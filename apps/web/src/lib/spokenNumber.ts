/**
 * Transforme ce qu'a entendu la reconnaissance vocale en nombre entier positif.
 * Les navigateurs renvoient le plus souvent des chiffres (« 42 »), mais parfois
 * des mots (« quarante-deux », « forty two ») : on gère les deux, en français et en anglais.
 */

/** Mots valant une quantité qui s'additionne (« vingt » + « deux »). */
const UNITS: Record<string, number> = {
  // Français
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90,
  // Homophone fréquent dans les transcriptions
  cette: 7,
  // Anglais
  one: 1, two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Mots ignorés entre deux nombres (« soixante et onze », « one hundred and five »). */
const FILLERS = new Set(["et", "and", "a"]);

/** Un nombre écrit en chiffres, avec d'éventuels séparateurs de milliers (« 1 000 », « 1,000 »), ou un mot. */
const TOKEN = /\d+(?:[ \u00a0\u202f,.]\d{3})*|[a-z]+/g;

/** Peut-on ajouter `value` au nombre en cours, dont le dernier mot valait `previous` ? */
function continues(previous: number, value: number): boolean {
  // « soixante-dix », « quatre-vingt-dix-neuf » : on peut encore ajouter jusqu'à 19.
  if (previous === 60 || previous === 80) return value < 20;
  // « vingt-deux », « forty two »
  if (previous >= 20 && previous % 10 === 0) return value < 10;
  // « dix-sept »
  if (previous === 10) return value >= 7 && value <= 9;
  return false;
}

/**
 * Renvoie les chiffres de la réponse dictée, ou null si rien de numérique n'a été compris.
 * Avec la latence, le joueur répète souvent sa réponse et le navigateur colle les deux
 * (« 42 42 », « quarante-deux quarante-deux ») : on découpe en nombres et on garde le dernier.
 */
export function parseSpokenNumber(transcript: string): string | null {
  const text = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let last: number | null = null;
  let total = 0;
  let current = 0;
  let active = false;
  // Dernier mot du nombre en cours : sa valeur, ou le multiplicateur rencontré.
  let previous: number | "cent" | "mille" | null = null;

  const flush = () => {
    if (active) last = total + current;
    total = 0;
    current = 0;
    active = false;
    previous = null;
  };

  for (const token of text.match(TOKEN) ?? []) {
    if (/^\d/.test(token)) {
      // Écrit en chiffres par le navigateur : un nombre complet à lui seul.
      flush();
      last = Number(token.replace(/\D/g, ""));
      continue;
    }
    if (FILLERS.has(token)) continue;
    if (token === "cent" || token === "cents" || token === "hundred") {
      if (previous === "cent") flush();
      current = (current || 1) * 100;
      previous = "cent";
    } else if (token === "mille" || token === "mil" || token === "thousand") {
      if (previous === "mille") flush();
      total += (current || 1) * 1000;
      current = 0;
      previous = "mille";
    } else if ((token === "vingt" || token === "vingts") && previous === 4) {
      // « quatre-vingt » : 4 a déjà été ajouté, on le remplace par 80.
      current += 80 - 4;
      previous = 80;
    } else if (token in UNITS) {
      const value = UNITS[token]!;
      // Un mot qui ne peut pas prolonger le nombre en cours en commence un nouveau.
      if (typeof previous === "number" && !continues(previous, value)) flush();
      current += value;
      previous = value;
    } else {
      // Mot inconnu (« euh », « je dis ») : il sépare deux nombres.
      flush();
      continue;
    }
    active = true;
  }
  flush();
  return last === null ? null : String(last);
}
