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

/** Renvoie les chiffres de la réponse dictée, ou null si rien de numérique n'a été compris. */
export function parseSpokenNumber(transcript: string): string | null {
  const text = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // Cas le plus courant : le navigateur a déjà écrit des chiffres (« 1 000 », « 1,000 », « 42 »).
  const digits = text.replace(/\D/g, "");
  if (digits) return String(Number(digits));

  let total = 0;
  let current = 0;
  let found = false;
  let previous = "";
  for (const word of text.split(/[^a-z]+/).filter(Boolean)) {
    if (word === "cent" || word === "cents" || word === "hundred") {
      current = (current || 1) * 100;
    } else if (word === "mille" || word === "mil" || word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else if ((word === "vingt" || word === "vingts") && previous === "quatre") {
      // « quatre-vingt » : 4 a déjà été ajouté, on le remplace par 80.
      current += 80 - 4;
    } else if (word in UNITS) {
      current += UNITS[word]!;
    } else if (FILLERS.has(word)) {
      continue;
    } else {
      // Mot inconnu : on ne garde que ce qui a été compris jusque-là.
      previous = word;
      continue;
    }
    found = true;
    previous = word;
  }
  return found ? String(total + current) : null;
}
