/* ==========================================================================
   sync.js — Synchronisation optionnelle avec Supabase (compte + sauvegarde
   en ligne). Utilise uniquement l'API REST publique de Supabase avec la clé
   « anon / publishable » : la sécurité repose sur les règles RLS de la base
   (voir supabase/migrations). Désactivée si SUPABASE_URL n'est pas configurée.
   ========================================================================== */
(function (racine) {
  'use strict';
  const cfg = racine.PMCMS_CONFIG || {};
  const URL_BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const CLE_ANON = String(cfg.supabaseAnonKey || '');
  const actif = !!(URL_BASE && CLE_ANON);
  const CLE_SESSION = 'pmcms:session', CLE_META = 'pmcms:sync', NOM_PLAN = 'principal';

  class ErreurSynchro extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }

  const lireJSON = cle => { try { const t = localStorage.getItem(cle); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const ecrireJSON = (cle, v) => { try { if (v == null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* rien */ } };
  let session = lireJSON(CLE_SESSION);
  let meta = lireJSON(CLE_META) || { planId: null, version: 0, modifie: false, derniere: null };
  const sauverMeta = () => ecrireJSON(CLE_META, meta);

  function messageErreur(statut, corps) {
    const brut = (corps && (corps.msg || corps.error_description || corps.message || corps.error)) || '';
    if (statut === 0) return 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.';
    if (/invalid login credentials/i.test(brut)) return 'E-mail ou mot de passe incorrect.';
    if (/already registered|already exists/i.test(brut)) return 'Un compte existe déjà avec cet e-mail : connectez-vous.';
    if (/email not confirmed/i.test(brut)) return 'Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.';
    if (/password/i.test(brut) && /(6|characters|short)/i.test(brut)) return 'Mot de passe trop court (6 caractères minimum).';
    if (statut === 401 || statut === 403) return 'Session expirée ou accès refusé : reconnectez-vous.';
    if (statut === 429) return 'Trop de tentatives : patientez une minute.';
    if (statut >= 500) return 'Le serveur de synchronisation rencontre un problème. Réessayez plus tard.';
    return brut || `Erreur ${statut}`;
  }

  async function requete(chemin, { methode = 'GET', corps, jeton = true, entetes = {} } = {}) {
    if (!actif) throw new ErreurSynchro('Synchronisation non configurée.', 'non_configure');
    if (jeton) await rafraichirSiBesoin();
    const h = { apikey: CLE_ANON, 'Content-Type': 'application/json', ...entetes };
    if (jeton && session) h.Authorization = 'Bearer ' + session.access_token;
    let r;
    try {
      r = await fetch(URL_BASE + chemin, { method: methode, headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) });
    } catch (e) { throw new ErreurSynchro(messageErreur(0), 'reseau'); }
    const texte = await r.text();
    let json = null; try { json = texte ? JSON.parse(texte) : null; } catch (e) { json = null; }
    if (!r.ok) throw new ErreurSynchro(messageErreur(r.status, json), r.status === 401 ? 'session' : 'http');
    return json;
  }

  function garderSession(s) {
    if (!s || !s.access_token) return;
    session = { access_token: s.access_token, refresh_token: s.refresh_token, expire: Date.now() + (s.expires_in || 3600) * 1000, email: s.user && s.user.email, userId: s.user && s.user.id };
    ecrireJSON(CLE_SESSION, session);
  }
  async function rafraichirSiBesoin() {
    if (!session || Date.now() < session.expire - 60000) return;
    try {
      const s = await requete('/auth/v1/token?grant_type=refresh_token', { methode: 'POST', corps: { refresh_token: session.refresh_token }, jeton: false });
      garderSession({ ...s, user: s.user || { email: session.email, id: session.userId } });
    } catch (e) {
      if (e.code !== 'reseau') { session = null; ecrireJSON(CLE_SESSION, null); }
      throw e;
    }
  }

  /* ---------- Compte ---------- */
  async function inscrire(email, motDePasse) {
    const r = await requete('/auth/v1/signup', { methode: 'POST', corps: { email, password: motDePasse }, jeton: false });
    if (r && r.access_token) { garderSession(r); return { connecte: true }; }
    return { connecte: false, confirmation: true };     // le projet exige la confirmation par e-mail
  }
  async function connecter(email, motDePasse) {
    const r = await requete('/auth/v1/token?grant_type=password', { methode: 'POST', corps: { email, password: motDePasse }, jeton: false });
    garderSession(r);
    meta = { planId: null, version: 0, modifie: true, derniere: null }; sauverMeta();
  }
  async function deconnecter() {
    try { if (session) await requete('/auth/v1/logout', { methode: 'POST' }); } catch (e) { /* on déconnecte localement quand même */ }
    session = null; ecrireJSON(CLE_SESSION, null);
    meta = { planId: null, version: 0, modifie: false, derniere: null }; sauverMeta();
  }

  /* ---------- Données ---------- */
  async function lirePlan() {
    const lignes = await requete(`/rest/v1/plans?select=id,donnees,version,updated_at&nom=eq.${NOM_PLAN}&limit=1`);
    return lignes && lignes[0] ? lignes[0] : null;
  }
  async function creerPlan(donnees) {
    const lignes = await requete('/rest/v1/plans', { methode: 'POST', corps: { nom: NOM_PLAN, donnees }, entetes: { Prefer: 'return=representation' } });
    return lignes[0];
  }
  // Mise à jour conditionnelle : n'écrit que si la version du serveur est celle connue (pas d'écrasement silencieux)
  async function majPlan(id, version, donnees) {
    const lignes = await requete(`/rest/v1/plans?id=eq.${encodeURIComponent(id)}&version=eq.${version}`, { methode: 'PATCH', corps: { donnees }, entetes: { Prefer: 'return=representation' } });
    return lignes && lignes[0] ? lignes[0] : null;
  }

  const noter = ligne => { meta.planId = ligne.id; meta.version = ligne.version; meta.modifie = false; meta.derniere = new Date().toISOString(); sauverMeta(); };

  /* Synchronise les données locales avec le serveur.
     Retour : { action: 'envoye' | 'recupere' | 'aJour' | 'conflit', donnees?, serveur? } */
  async function synchroniser(donneesLocales) {
    const serveur = await lirePlan();
    if (!serveur) { noter(await creerPlan(donneesLocales)); return { action: 'envoye' }; }
    const serveurAChange = !meta.planId || meta.planId !== serveur.id || serveur.version !== meta.version;
    if (serveurAChange && meta.modifie) return { action: 'conflit', serveur };
    if (serveurAChange) { noter(serveur); return { action: 'recupere', donnees: serveur.donnees }; }
    if (!meta.modifie) return { action: 'aJour' };
    const maj = await majPlan(serveur.id, serveur.version, donneesLocales);
    if (!maj) return { action: 'conflit', serveur: await lirePlan() };
    noter(maj); return { action: 'envoye' };
  }
  // Résolution d'un conflit : garder la version de cet appareil, ou celle du serveur
  async function garderLocal(donneesLocales) {
    const serveur = await lirePlan();
    if (!serveur) { noter(await creerPlan(donneesLocales)); return; }
    const maj = await majPlan(serveur.id, serveur.version, donneesLocales);
    if (!maj) throw new ErreurSynchro('Le plan a encore changé sur le serveur : relancez la synchronisation.', 'conflit');
    noter(maj);
  }
  function garderServeur(serveur) { noter(serveur); return serveur.donnees; }

  function signalerModification() { meta.modifie = true; sauverMeta(); }

  racine.Synchro = {
    actif, ErreurSynchro, inscrire, connecter, deconnecter, synchroniser, garderLocal, garderServeur, signalerModification,
    get connecte() { return !!session; }, get email() { return session && session.email; }, get meta() { return { ...meta }; }
  };
})(window);
