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

  racine.Donnees = { FORMAT, migrer, valider, lire, ecrire, effacer, sauverSecours, lireSecours, clone };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.Donnees;
