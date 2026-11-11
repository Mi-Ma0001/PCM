// Petit serveur statique pour tester en local : node scripts/serve.mjs [dossier] [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const racine = new URL('..', import.meta.url).pathname;
const dossier = join(racine, process.argv[2] || 'dist');
const port = Number(process.argv[3] || process.env.PORT || 4173);
// Mêmes en-têtes qu'en production : ceux de vercel.json (CSP comprise)
const regles = existsSync(join(racine, 'vercel.json')) ? (JSON.parse(readFileSync(join(racine, 'vercel.json'), 'utf8')).headers || []) : [];
const enTetes = chemin => {
  const h = {};
  for (const r of regles) {
    const motif = new RegExp('^' + r.source.replace(/\./g, '\\.').replace(/\\\.\*/g, '.*') + '$');
    if (motif.test(chemin)) for (const { key, value } of r.headers) h[key] = value;
  }
  // tests : autoriser un serveur Supabase simulé local
  if (process.env.PMCMS_CSP_EXTRA && h['Content-Security-Policy']) h['Content-Security-Policy'] = h['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' " + process.env.PMCMS_CSP_EXTRA);
  delete h['Strict-Transport-Security'];
  return h;
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    const fichier = normalize(join(dossier, chemin));
    if (!fichier.startsWith(dossier)) { res.writeHead(403).end(); return; }
    let corps, statut = 200, cible = fichier;
    try { if ((await stat(cible)).isDirectory()) cible = join(cible, 'index.html'); corps = await readFile(cible); }
    catch { statut = 404; cible = join(dossier, '404.html'); corps = await readFile(cible).catch(() => Buffer.from('404')); }
    res.writeHead(statut, { 'Content-Type': TYPES[extname(cible)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...enTetes(chemin) });
    res.end(corps);
  } catch (e) { res.writeHead(500).end('Erreur serveur'); }
}).listen(port, () => console.log(`Plan de maintenance CMS : http://localhost:${port}  (dossier ${process.argv[2] || 'dist'})`));
