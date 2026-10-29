#!/usr/bin/env node
/**
 * Ajoute une version au site : entrée en tête de `RELEASES` (apps/web/src/lib/releases.ts)
 * et ses notes dans `changelog.notes` de messages/fr.json et en.json.
 *
 *   node .claude/skills/patchnote/release.mjs --current
 *   node .claude/skills/patchnote/release.mjs --version 1.2.0 --date 2026-11-02 --notes notes.json
 *
 * `notes.json` : { "fr": ["…"], "en": ["…"] }, même nombre de lignes dans les deux langues.
 * Refuse une version déjà présente ou pas plus grande que la version en ligne.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RELEASES_FILE = path.join(ROOT, "apps/web/src/lib/releases.ts");
const MESSAGES = ["fr", "en"].map((l) => [l, path.join(ROOT, `apps/web/messages/${l}.json`)]);
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(msg) {
  console.error("Erreur : " + msg);
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i < 0 ? undefined : process.argv[i + 1];
}

/** Versions déjà déclarées, de la plus récente à la plus ancienne. */
function readReleases(src) {
  return [...src.matchAll(/\{ version: "([^"]+)", date: "([^"]+)" \}/g)].map((m) => ({ version: m[1], date: m[2] }));
}

function compare(a, b) {
  const pa = SEMVER.exec(a).slice(1).map(Number);
  const pb = SEMVER.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const src = fs.readFileSync(RELEASES_FILE, "utf8");
const releases = readReleases(src);
const current = releases[0];
if (!current) fail("aucune version trouvée dans " + RELEASES_FILE);

if (process.argv.includes("--current")) {
  console.log(JSON.stringify({ current, releases }, null, 2));
  process.exit(0);
}

const version = arg("version");
const date = arg("date");
const notesFile = arg("notes");
if (!version || !SEMVER.test(version)) fail("--version X.Y.Z attendu");
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail("--date AAAA-MM-JJ attendu");
if (!notesFile) fail("--notes fichier.json attendu");
if (releases.some((r) => r.version === version)) fail(`la version ${version} existe déjà`);
if (compare(version, current.version) <= 0) fail(`${version} doit être plus grande que la version en ligne ${current.version}`);
if (date < current.date) fail(`la date ${date} précède celle de la version ${current.version} (${current.date})`);

const notes = JSON.parse(fs.readFileSync(notesFile, "utf8"));
for (const [lang] of MESSAGES) {
  const list = notes[lang];
  if (!Array.isArray(list) || !list.length || list.some((s) => typeof s !== "string" || !s.trim())) {
    fail(`notes.${lang} doit être une liste de textes non vides`);
  }
  if (new Set(list).size !== list.length) fail(`notes.${lang} contient deux fois le même texte (sert de clé React)`);
}
if (notes.fr.length !== notes.en.length) fail("fr et en n'ont pas le même nombre de notes");

const key = "v" + version.replaceAll(".", "_");
const anchor = "export const RELEASES = [\n";
if (!src.includes(anchor)) fail("début de RELEASES introuvable");
fs.writeFileSync(RELEASES_FILE, src.replace(anchor, `${anchor}  { version: "${version}", date: "${date}" },\n`));

for (const [lang, file] of MESSAGES) {
  const messages = JSON.parse(fs.readFileSync(file, "utf8"));
  const changelog = messages.changelog;
  if (!changelog?.notes) fail(`changelog.notes introuvable dans ${file}`);
  // Nouvelle version en premier, comme sur la page.
  changelog.notes = { [key]: notes[lang], ...changelog.notes };
  fs.writeFileSync(file, JSON.stringify(messages, null, 2) + "\n");
}

console.log(`Version ${version} (${date}) ajoutée : releases.ts, fr.json, en.json (${notes.fr.length} notes).`);
