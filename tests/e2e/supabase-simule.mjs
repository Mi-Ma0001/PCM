// Serveur imitant les API Supabase utilisées par web/js/sync.js (Auth + REST « plans »),
// en mémoire, pour tester la synchronisation sans projet Supabase réel.
// Usage : node tests/e2e/supabase-simule.mjs [port]
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.argv[2] || 54399);
const CLE_ANON = 'cle-test-anon';
const utilisateurs = new Map();   // email -> { id, email, motDePasse }
const jetons = new Map();         // access_token -> userId
const rafraichissements = new Map();
const plans = [];                 // { id, user_id, nom, donnees, version, updated_at }

const session = u => {
  const access = randomUUID(), refresh = randomUUID();
  jetons.set(access, u.id); rafraichissements.set(refresh, u.id);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email } };
};
const filtre = (q, champ) => { const v = q.get(champ); return v && v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null; };

createServer(async (req, res) => {
  const envoyer = (statut, corps) => {
    res.writeHead(statut, {
      'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    });
    res.end(corps === undefined ? '' : JSON.stringify(corps));
  };
  if (req.method === 'OPTIONS') return envoyer(204);
  const url = new URL(req.url, 'http://x'), q = url.searchParams;
  let corps = '';
  for await (const morceau of req) corps += morceau;
  const json = corps ? JSON.parse(corps) : {};

  // Outils réservés aux tests
  if (url.pathname === '/__test/reinitialiser') { utilisateurs.clear(); jetons.clear(); plans.length = 0; return envoyer(200, {}); }
  if (url.pathname === '/__test/plans') return envoyer(200, plans);

  if (req.headers.apikey !== CLE_ANON) return envoyer(401, { message: 'Invalid API key' });

  if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
    if (utilisateurs.has(json.email)) return envoyer(422, { msg: 'User already registered' });
    if (!json.password || json.password.length < 6) return envoyer(422, { msg: 'Password should be at least 6 characters' });
    const u = { id: randomUUID(), email: json.email, motDePasse: json.password };
    utilisateurs.set(u.email, u);
    return envoyer(200, session(u));
  }
  if (url.pathname === '/auth/v1/token' && q.get('grant_type') === 'password') {
    const u = utilisateurs.get(json.email);
    if (!u || u.motDePasse !== json.password) return envoyer(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    return envoyer(200, session(u));
  }
  if (url.pathname === '/auth/v1/token' && q.get('grant_type') === 'refresh_token') {
    const id = rafraichissements.get(json.refresh_token);
    const u = [...utilisateurs.values()].find(x => x.id === id);
    return u ? envoyer(200, session(u)) : envoyer(400, { error_description: 'Invalid Refresh Token' });
  }
  if (url.pathname === '/auth/v1/logout') return envoyer(204);

  // API REST : RLS imitée (chaque utilisateur ne voit que ses plans)
  const userId = jetons.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
  if (url.pathname === '/rest/v1/plans') {
    if (!userId) return envoyer(401, { message: 'JWT expired' });
    const miens = plans.filter(p => p.user_id === userId);
    if (req.method === 'GET') {
      const nom = filtre(q, 'nom');
      return envoyer(200, miens.filter(p => !nom || p.nom === nom).slice(0, Number(q.get('limit') || 100)));
    }
    if (req.method === 'POST') {
      if (miens.some(p => p.nom === (json.nom || 'principal'))) return envoyer(409, { message: 'duplicate key value violates unique constraint' });
      const p = { id: randomUUID(), user_id: userId, nom: json.nom || 'principal', donnees: json.donnees, version: 1, updated_at: new Date().toISOString() };
      plans.push(p); return envoyer(201, [p]);
    }
    if (req.method === 'PATCH') {
      const id = filtre(q, 'id'), version = filtre(q, 'version');
      const cibles = miens.filter(p => p.id === id && (version == null || String(p.version) === version));
      cibles.forEach(p => { p.donnees = json.donnees; p.version += 1; p.updated_at = new Date().toISOString(); });
      return envoyer(200, cibles);
    }
  }
  envoyer(404, { message: 'introuvable' });
}).listen(port, () => console.log(`Supabase simulé : http://127.0.0.1:${port}`));
