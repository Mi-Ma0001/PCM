// Build de production : web/ → dist/
//  - écrit dist/js/config.js à partir des variables d'environnement (ou du fichier .env) ;
//  - refuse toute clé secrète Supabase (service_role / sb_secret_) ;
//  - génère dist/js/donnees-defaut.js depuis web/data/data.json (une seule source de données) ;
//  - inscrit la version et la liste des fichiers dans le service worker.
import { readFileSync, writeFileSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const racine = new URL('..', import.meta.url).pathname;
const src = join(racine, 'web'), dist = join(racine, 'dist');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));

// Lecture facultative d'un fichier .env (développement local)
const env = { ...process.env };
const fichierEnv = join(racine, '.env');
if (existsSync(fichierEnv)) {
  for (const ligne of readFileSync(fichierEnv, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function erreur(msg) { console.error('\n✗ Build refusé : ' + msg + '\n'); process.exit(1); }

// ---------- Configuration publique ----------
const url = (env.SUPABASE_URL || '').trim();
const cle = (env.SUPABASE_ANON_KEY || '').trim();
if ((url && !cle) || (!url && cle)) erreur('SUPABASE_URL et SUPABASE_ANON_KEY doivent être fournies ensemble (ou laissées vides toutes les deux).');
if (url && !/^https:\/\/[^\s/]+/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) erreur('SUPABASE_URL doit commencer par https://');
if (cle) {
  if (/^sb_secret_/.test(cle)) erreur('SUPABASE_ANON_KEY contient une clé SECRÈTE (sb_secret_…). Utilisez la clé publique « publishable » ou « anon ».');
  const morceaux = cle.split('.');
  if (morceaux.length === 3) {
    try {
      const charge = JSON.parse(Buffer.from(morceaux[1], 'base64url').toString('utf8'));
      if (charge.role === 'service_role') erreur('SUPABASE_ANON_KEY est une clé service_role (secrète). Utilisez la clé « anon ».');
    } catch { /* clé non JWT : acceptée (format publishable) */ }
  }
}

// ---------- Données par défaut ----------
let donnees;
try { donnees = JSON.parse(readFileSync(join(src, 'data/data.json'), 'utf8')); }
catch (e) { erreur('web/data/data.json est illisible : ' + e.message); }
if (!Array.isArray(donnees.equipements)) erreur('web/data/data.json doit contenir une liste « equipements ».');

// ---------- Copie ----------
rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });
writeFileSync(join(dist, 'js/config.js'),
  '/* Généré par scripts/build.mjs — configuration publique (aucun secret) */\n' +
  `window.PMCMS_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: cle, version: pkg.version })};\n`);
writeFileSync(join(dist, 'js/donnees-defaut.js'),
  '/* Généré par scripts/build.mjs depuis web/data/data.json — ne pas modifier */\n' +
  `window.PMCMS_DONNEES_DEFAUT = ${JSON.stringify(donnees)};\n`);

// ---------- Service worker ----------
const fichiers = [];
(function parcourir(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (!/(^|\/)(sw\.js|404\.html|LICENCE\.txt)$/.test(p) && !p.endsWith('.map')) fichiers.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);
fichiers.sort();
const empreinte = createHash('sha256');
for (const f of fichiers) empreinte.update(f).update(readFileSync(join(dist, f)));
const version = `${pkg.version}-${empreinte.digest('hex').slice(0, 10)}`;
const liste = ['./', ...fichiers.map(f => './' + f)];
const sw = readFileSync(join(dist, 'sw.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(version)).replace('__FICHIERS__', JSON.stringify(liste, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`✓ dist/ prêt — version ${version}, ${fichiers.length} fichiers mis en cache, synchronisation ${url ? 'ACTIVÉE (' + new URL(url).host + ')' : 'désactivée'}`);
