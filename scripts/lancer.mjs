#!/usr/bin/env node
/**
 * Prépare et lance tout le projet en une commande : `pnpm lancer`
 *
 *  1. crée ou corrige le fichier .env (secrets, port de la base) ;
 *  2. démarre la base de données dans Docker et attend qu'elle réponde ;
 *  3. installe les dépendances et régénère le client Prisma ;
 *  4. crée ou met à jour les tables ;
 *  5. arrête un éventuel ancien `pnpm dev`, puis lance le site et le serveur de jeu.
 *
 * `pnpm lancer --reset` efface en plus la base locale (comptes et parties) pour repartir de zéro.
 */
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reset = process.argv.includes("--reset");
const noDev = process.argv.includes("--no-dev");

const step = (n, text) => console.log(`\n\x1b[34m[${n}/5]\x1b[0m ${text}`);
const fail = (text) => {
  console.error(`\n\x1b[31m✗ ${text}\x1b[0m\n`);
  process.exit(1);
};
const run = (cmd, opts = {}) => {
  const r = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true, ...opts });
  return r.status === 0;
};
const quiet = (cmd) => {
  try {
    execSync(cmd, { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/* 1. Fichier .env ------------------------------------------------------- */
step(1, "Fichier .env");
const envPath = path.join(root, ".env");
if (!existsSync(envPath)) {
  copyFileSync(path.join(root, ".env.example"), envPath);
  console.log("  .env créé à partir de .env.example");
}
let env = readFileSync(envPath, "utf8");
const before = env;
// La base Docker du projet écoute sur le port 5433, en IPv4 (127.0.0.1 plutôt que « localhost »,
// qui peut viser l'adresse IPv6 sur Mac).
env = env.replace(/@localhost:543[23]\/calculus/g, "@127.0.0.1:5433/calculus");
// Connexion directe des migrations (ajoutée après coup) : en local, la même base que DATABASE_URL.
if (!/^DIRECT_URL=/m.test(env)) {
  const database = env.match(/^DATABASE_URL=.*$/m)?.[0];
  if (database) env = env.replace(database, `${database}\n${database.replace(/^DATABASE_URL/, "DIRECT_URL")}`);
}
// Secrets encore à leur valeur d'exemple : on en génère des vrais.
env = env.replace(/^(BETTER_AUTH_SECRET|GAME_TOKEN_SECRET)="?remplace-moi[^"\n]*"?$/gm, (_, key) => `${key}="${randomBytes(32).toString("base64")}"`);
if (env !== before) {
  writeFileSync(envPath, env);
  console.log("  .env corrigé (port de la base et/ou secrets)");
} else {
  console.log("  .env déjà prêt");
}

/* 2. Base de données ---------------------------------------------------- */
step(2, "Base de données (Docker)");
if (!quiet("docker info")) fail("Docker ne répond pas. Ouvre Docker Desktop, attends qu'il soit prêt, puis relance `pnpm lancer`.");
if (reset) {
  console.log("  --reset : suppression de la base locale");
  run("docker compose down -v");
}
if (!run("docker compose up -d db")) fail("Impossible de démarrer la base. Le port 5433 est peut-être déjà pris.");
/** Vrai si on peut ouvrir une connexion vers le port de la base depuis cet ordinateur. */
const portOpen = (port) =>
  new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    sock.setTimeout(1000);
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => resolve(false));
    sock.once("timeout", () => (sock.destroy(), resolve(false)));
  });

process.stdout.write("  En attente de la base");
// Au premier démarrage, PostgreSQL s'initialise puis redémarre : on attend qu'il réponde
// par le réseau (et pas seulement en interne), plusieurs fois de suite.
let ready = false;
let okInARow = 0;
for (let i = 0; i < 60 && !ready; i++) {
  const ok = quiet("docker compose exec -T db pg_isready -h 127.0.0.1 -U calculus -d calculus") && (await portOpen(5433));
  okInARow = ok ? okInARow + 1 : 0;
  ready = okInARow >= 3;
  if (!ready) {
    process.stdout.write(".");
    spawnSync("sleep", ["1"]);
  }
}
console.log(ready ? " prête" : "");
if (!ready) fail("La base ne répond pas sur le port 5433 après 60 secondes. Regarde `docker compose logs db`.");

/* 3. Dépendances -------------------------------------------------------- */
step(3, "Installation des dépendances");
if (!run("pnpm install")) fail("`pnpm install` a échoué (voir le message ci-dessus).");
// `pnpm install` ne relance pas toujours le postinstall : on régénère le client Prisma pour
// qu'il suive schema.prisma même quand aucune dépendance n'a changé (après une fusion, par exemple).
if (!run("pnpm --filter @calculus/db generate")) fail("La génération du client Prisma a échoué (voir le message ci-dessus).");

/* 4. Tables ------------------------------------------------------------- */
step(4, "Tables de la base");
let migrated = false;
for (let attempt = 1; attempt <= 3 && !migrated; attempt++) {
  migrated = run("pnpm --filter @calculus/db exec dotenv -e ../../.env -- prisma migrate dev --name init");
  if (!migrated && attempt < 3) {
    console.log(`  Nouvel essai dans 3 secondes (${attempt}/3)…`);
    spawnSync("sleep", ["3"]);
  }
}
if (!migrated) {
  fail("La création des tables a échoué. Si l'erreur parle de droits (P1010), relance avec `pnpm lancer --reset`.");
}

/* 5. Lancement ---------------------------------------------------------- */
if (noDev) {
  console.log("\n\x1b[32m✓ Tout est prêt.\x1b[0m Lance `pnpm dev` quand tu veux.\n");
  process.exit(0);
}
step(5, "Lancement : site sur http://localhost:3000, serveur de jeu sur le port 2567 (Ctrl + C pour arrêter)");
// Un ancien `pnpm dev` resté ouvert garderait les ports et l'ancien client Prisma en mémoire :
// le nouveau site ne démarrerait pas et on verrait toujours l'ancien. On l'arrête d'abord.
if (process.platform !== "win32") {
  for (const port of [3000, 2567]) {
    const pids = (() => {
      try {
        return execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" }).split("\n").filter(Boolean);
      } catch {
        return [];
      }
    })();
    if (pids.length) {
      console.log(`  Arrêt de l'ancien processus sur le port ${port} (${pids.join(", ")})`);
      quiet(`kill ${pids.join(" ")}`);
    }
  }
  spawnSync("sleep", ["1"]);
}
run("pnpm dev");
