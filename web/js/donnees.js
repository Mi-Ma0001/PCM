/* ==========================================================================
   donnees.js — Lecture, validation, migration et enregistrement des données
   Les données vivent dans le navigateur (localStorage) ; chaque écriture est
   vérifiée et une copie de sécurité permet d'annuler les opérations risquées.
   ========================================================================== */
(function (racine) {
  'use strict';

  const FORMAT = 2;                                  // version du format des données
  const CLE = 'pmcms:donnees';
  const CLE_SECOURS = 'pmcms:secours';
  const ANCIENNE_CLE = 'plan-maintenance-cms-v1';    // version web 1.0

  const TYPES = ['Temporelle', 'Usage'];
  const UNITES = ['Mois', 'Semaine', 'Jour', 'An', 'h'];
  const estDateISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const estNombre = v => v === null || v === undefined || v === '' || (typeof v === 'number' && isFinite(v));
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- Migration des anciens formats ---------- */
  function migrer(d) {
    const x = clone(d);
    x.formatVersion = x.formatVersion || 1;
    if (x.formatVersion < 2) {
      x.parametres = x.parametres || {};
      x.gammes = Array.isArray(x.gammes) ? x.gammes : [];
      x.formatVersion = 2;
    }
    return x;
  }

  /* ---------- Validation ----------
     erreurs = bloquantes (le fichier est refusé) ; avertissements = acceptés
     (l'équipement concerné apparaîtra « À définir » dans le plan). */
  function valider(d) {
    const erreurs = [], avert = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { erreurs: ['Le fichier doit contenir un objet JSON { … }.'], avert };
    if (!Array.isArray(d.equipements)) erreurs.push('La liste « equipements » est absente.');
    if (d.parametres !== undefined && (typeof d.parametres !== 'object' || Array.isArray(d.parametres))) erreurs.push('« parametres » doit être un objet.');
    if (d.gammes !== undefined && !Array.isArray(d.gammes)) erreurs.push('« gammes » doit être une liste.');
    if (d.configuration !== undefined && d.configuration !== null && (typeof d.configuration !== 'object' || Array.isArray(d.configuration))) erreurs.push('« configuration » doit être un objet.');
    else if (d.configuration && d.configuration.techniciens !== undefined && !Array.isArray(d.configuration.techniciens)) erreurs.push('« configuration.techniciens » doit être une liste.');
    if (erreurs.length) return { erreurs, avert };

    const vus = new Set();
    d.equipements.forEach((e, i) => {
      const ou = `Équipement n°${i + 1}`;
      if (!e || typeof e !== 'object') { erreurs.push(`${ou} : ce n’est pas un objet.`); return; }
      const id = String(e.id ?? '').trim().toUpperCase();
      if (!id) { erreurs.push(`${ou} : ID manquant.`); return; }
      if (vus.has(id)) erreurs.push(`${ou} : l’ID ${id} est en double.`);
      vus.add(id);
      if (!TYPES.includes(e.type)) avert.push(`${id} : type « ${e.type ?? ''} » inconnu (Temporelle ou Usage).`);
      if (!(typeof e.periode === 'number' && e.periode > 0)) avert.push(`${id} : périodicité manquante ou nulle.`);
      if (e.unite && !UNITES.includes(e.unite)) avert.push(`${id} : unité « ${e.unite} » inconnue.`);
      if (e.derniereIntervention && !estDateISO(e.derniereIntervention)) erreurs.push(`${id} : date « ${e.derniereIntervention} » invalide (format AAAA-MM-JJ).`);
      for (const ch of ['periode', 'compteurActuel', 'dernierCompteur', 'duree', 'usageJour'])
        if (!estNombre(e[ch])) erreurs.push(`${id} : « ${ch} » doit être un nombre.`);
    });
    const p = d.parametres || {};
    for (const ch of ['capaciteHebdo', 'alerteCompteur', 'horizonMois', 'nbDatesFutures', 'seuilRetardJours', 'nbMaxInterventionsSemaine'])
      if (!estNombre(p[ch])) erreurs.push(`Paramètre « ${ch} » : doit être un nombre.`);
    if (p.dateReference && !estDateISO(p.dateReference)) erreurs.push('Paramètre « dateReference » : date invalide (AAAA-MM-JJ).');
    if (p.horizonMois > 60) erreurs.push('Paramètre « horizonMois » : 60 mois au maximum.');
    return { erreurs, avert };
  }

  /* ---------- Configuration (super-utilisateur) ----------
     { nomApp, sousTitre, techniciens: [..], admin: { sel, empreinte } | null }
     Le code super-utilisateur n'est jamais stocké en clair : seule son empreinte
     SHA-256 (salée) l'est. C'est un verrou local contre les modifications
     involontaires, pas une sécurité serveur. */
  const CONFIG_DEFAUT = { nomApp: 'OptiMaint CMS', sousTitre: 'Optimisation de la Maintenance CMS', techniciens: ['Technicien 1', 'Technicien 2'], admin: null };
  const NOM_MAX = 40, SOUS_TITRE_MAX = 80, TECH_MAX = 20;

  function configuration(d) {
    const c = (d && d.configuration && typeof d.configuration === 'object') ? d.configuration : {};
    const nom = String(c.nomApp ?? '').trim();
    const st = c.sousTitre == null ? CONFIG_DEFAUT.sousTitre : String(c.sousTitre).trim();
    let techs = Array.isArray(c.techniciens) ? [...new Set(c.techniciens.map(t => String(t ?? '').trim()).filter(Boolean))] : [];
    if (!techs.length) {                       // ancien fichier : on reprend les techniciens du parc
      techs = [...new Set(((d && d.equipements) || []).map(e => String(e && e.technicien || '').trim()).filter(Boolean))].sort();
      if (!techs.length) techs = clone(CONFIG_DEFAUT.techniciens);
    }
    const admin = c.admin && typeof c.admin.sel === 'string' && typeof c.admin.empreinte === 'string' ? { sel: c.admin.sel, empreinte: c.admin.empreinte } : null;
    return { nomApp: nom || CONFIG_DEFAUT.nomApp, sousTitre: st, techniciens: techs, admin };
  }

  // Erreurs bloquantes sur la configuration saisie par le super-utilisateur
  function validerConfiguration(c) {
    const err = [];
    const nom = String(c.nomApp ?? '').trim();
    if (!nom) err.push('Le nom de l’application est obligatoire.');
    else if (nom.length > NOM_MAX) err.push(`Le nom de l’application doit faire ${NOM_MAX} caractères au maximum.`);
    if (String(c.sousTitre ?? '').trim().length > SOUS_TITRE_MAX) err.push(`Le sous-titre doit faire ${SOUS_TITRE_MAX} caractères au maximum.`);
    const t = (c.techniciens || []).map(x => String(x ?? '').trim());
    if (!t.length) err.push('Il faut au moins un technicien.');
    if (t.length > TECH_MAX) err.push(`${TECH_MAX} techniciens au maximum.`);
    if (t.some(x => !x)) err.push('Chaque technicien doit avoir un nom.');
    const vus = new Set();
    t.forEach(x => { const k = x.toLowerCase(); if (x && vus.has(k)) err.push(`Le technicien « ${x} » apparaît deux fois.`); vus.add(k); });
    return err;
  }

  /* SHA-256 : API du navigateur si disponible, sinon implémentation de secours */
  function sha256Secours(texte) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const o = new TextEncoder().encode(texte), l = o.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(o); m[l] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const r = (x, k) => (x >>> k) | (x << (32 - k)), w = new Uint32Array(64);
    for (let i = 0; i < n; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) { const s0 = r(w[t-15],7) ^ r(w[t-15],18) ^ (w[t-15] >>> 3), s1 = r(w[t-2],17) ^ r(w[t-2],19) ^ (w[t-2] >>> 10); w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let t = 0; t < 64; t++) {
        const t1 = (hh + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        const t2 = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = h.map((v, k) => (v + [a, b, c, d, e, f, g, hh][k]) | 0);
    }
    return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }
  async function sha256(texte) {
    try {
      const c = racine.crypto && racine.crypto.subtle;
      if (c) { const b = await c.digest('SHA-256', new TextEncoder().encode(texte)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
    } catch (e) { /* contexte non sécurisé : secours */ }
    return sha256Secours(texte);
  }
  function selAleatoire() {
    const t = new Uint8Array(16);
    if (racine.crypto && racine.crypto.getRandomValues) racine.crypto.getRandomValues(t); else for (let i = 0; i < 16; i++) t[i] = Math.floor(Math.random() * 256);
    return [...t].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function creerCodeAdmin(code) { const sel = selAleatoire(); return { sel, empreinte: await sha256(sel + ':' + code) }; }
  async function verifierCodeAdmin(admin, code) { return !!admin && (await sha256(admin.sel + ':' + code)) === admin.empreinte; }

  /* ---------- Stockage local ---------- */
  function lire() {
    try {
      const brut = localStorage.getItem(CLE);
      if (brut) { const o = JSON.parse(brut); return { donnees: migrer(o.donnees), enregistreLe: o.enregistreLe || null }; }
      const ancien = localStorage.getItem(ANCIENNE_CLE);           // reprise des données de la version 1.0
      if (ancien) { const d = migrer(JSON.parse(ancien)); if (valider(d).erreurs.length === 0) return { donnees: d, enregistreLe: null, repris: true }; }
    } catch (e) { /* stockage illisible : on repart des données par défaut */ }
    return null;
  }

  // Retourne { ok, quand } ou { ok:false, erreur } — l'écriture est relue pour être vérifiée
  function ecrire(donnees) {
    const quand = new Date().toISOString();
    try {
      const texte = JSON.stringify({ formatVersion: FORMAT, enregistreLe: quand, donnees });
      localStorage.setItem(CLE, texte);
      if (localStorage.getItem(CLE) !== texte) throw new Error('relecture différente');
      return { ok: true, quand };
    } catch (e) {
      const plein = e && (e.name === 'QuotaExceededError' || e.code === 22);
      return { ok: false, erreur: plein ? 'L’espace de stockage du navigateur est plein.' : 'Le navigateur refuse l’enregistrement (navigation privée ou stockage bloqué).' };
    }
  }

  function effacer() { try { localStorage.removeItem(CLE); localStorage.removeItem(ANCIENNE_CLE); } catch (e) { /* rien */ } }

  // Copie de sécurité avant une opération risquée (import, restauration)
  function sauverSecours(donnees, raison) { try { localStorage.setItem(CLE_SECOURS, JSON.stringify({ quand: new Date().toISOString(), raison, donnees })); } catch (e) { /* rien */ } }
  function lireSecours() { try { const t = localStorage.getItem(CLE_SECOURS); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

  racine.Donnees = { FORMAT, migrer, valider, lire, ecrire, effacer, sauverSecours, lireSecours, clone,
    CONFIG_DEFAUT, configuration, validerConfiguration, sha256, sha256Secours, creerCodeAdmin, verifierCodeAdmin };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Donnees;
