/* ==========================================================================
   moteur.js — Moteur de calcul du plan de maintenance préventive
   Traduction fidèle du module VBA « PlanMaintenance » (Séances 5 et 6).
   Les dates sont manipulées comme des numéros de jour (jours depuis le
   01/01/1970) pour éviter tout décalage d'heure ou de fuseau.
   ========================================================================== */
(function (racine) {
  'use strict';

  /* ---------- Outils de dates ---------- */
  const JOUR = 86400000;
  const depuisYMD = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / JOUR);
  const versYMD = n => { const t = new Date(n * JOUR); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  const depuisISO = s => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    return m ? depuisYMD(+m[1], +m[2], +m[3]) : null;
  };
  const versISO = n => { const { y, m, d } = versYMD(n); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
  const fmt = n => { if (n == null) return ''; const { y, m, d } = versYMD(n); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };
  const joursDansMois = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const aujourdhui = () => { const t = new Date(); return depuisYMD(t.getFullYear(), t.getMonth() + 1, t.getDate()); };

  // DateAdd("m", k, d) : même jour, ramené au dernier jour du mois si besoin
  function ajouterMois(n, k) {
    const { y, m, d } = versYMD(n);
    const total = y * 12 + (m - 1) + k;
    const ny = Math.floor(total / 12), nm = total - ny * 12 + 1;
    return depuisYMD(ny, nm, Math.min(d, joursDansMois(ny, nm)));
  }
  const jourSemaine = n => ((((n + 3) % 7) + 7) % 7) + 1;      // lundi = 1 … dimanche = 7
  const lundi = n => n - jourSemaine(n) + 1;
  function isoSemaine(n) {                                       // norme ISO 8601
    const jeudi = lundi(n) + 3;
    return Math.floor((jeudi - depuisYMD(versYMD(jeudi).y, 1, 1)) / 7) + 1;
  }
  const isoAnnee = n => versYMD(lundi(n) + 3).y;
  const libSemaine = n => `${isoAnnee(n)}-S${String(isoSemaine(n)).padStart(2, '0')}`;
  function jourOuvreSuivant(n) { n += 1; while (jourSemaine(n) > 5) n += 1; return n; }

  /* ---------- Petites conversions ---------- */
  function nombre(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const x = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(x) ? x : 0;
  }
  function normaliserType(v) {
    const t = String(v || '').trim().toLowerCase();
    if (t.startsWith('temp')) return 'Temporelle';
    if (t.startsWith('usa')) return 'Usage';
    return '';
  }
  // Unités reconnues (la VBA ne regardait que la 1re lettre : « Siècle » devenait « Semaine »)
  const UNITES = {
    m: ['m', 'mois', 'month', 'months'],
    s: ['s', 'sem', 'semaine', 'semaines', 'w', 'week', 'weeks'],
    j: ['j', 'jour', 'jours', 'd', 'day', 'days'],
    a: ['a', 'an', 'ans', 'annee', 'annees', 'y', 'year', 'years']
  };
  function codeUnite(u) {
    const t = String(u || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');
    for (const [code, mots] of Object.entries(UNITES)) if (mots.includes(t)) return code;
    return '';
  }
  function rangCriticite(c) {
    switch (String(c || '').trim().toLowerCase()) {
      case 'critique': return 4; case 'haute': return 3; case 'moyenne': return 2;
      case 'basse': case 'faible': return 1; default: return 0;
    }
  }
  const entier = x => String(Math.round(x));

  /* ==========================================================================
     SÉANCE 5 — moteur de dates (périodicité temporelle)
     ========================================================================== */
  // k-ième échéance : on repart TOUJOURS de la date d'origine (pas de dérive)
  function prochaineDate(dDerniere, periode, unite, k = 1) {
    switch (codeUnite(unite)) {
      case 'm': return ajouterMois(dDerniere, Math.round(k * periode));
      case 's': return dDerniere + Math.round(7 * k * periode);
      case 'j': return dDerniere + Math.round(k * periode);
      case 'a': return ajouterMois(dDerniere, Math.round(12 * k * periode));
      default: throw new Error('Unité de périodicité inconnue : ' + unite);
    }
  }
  function etatTemporel(dDerniere, periode, unite, dRef, seuilJours) {
    const d1 = prochaineDate(dDerniere, periode, unite, 1);
    if (dRef - d1 > seuilJours) {
      const d2 = prochaineDate(dDerniere, periode, unite, 2);
      return d2 < dRef ? 'Retard critique' : 'En retard';
    }
    return 'Planifiée';
  }

  /* ==========================================================================
     SÉANCE 6 — périodicité d'usage (compteur)
     ========================================================================== */
  function etatUsage(cptActuel, cible, periode, alerteH) {
    if (cptActuel >= cible + periode) return 'Retard critique';
    if (cptActuel >= cible) return 'En retard';
    if (cible - cptActuel <= alerteH) return 'À surveiller';
    return 'Planifiée';
  }
  function dateUsageEstimee(cptActuel, cible, heuresParJour, dRef) {
    if (cible <= cptActuel) return dRef;
    return dRef + Math.ceil((cible - cptActuel) / heuresParJour);   // = dRef - Int(-x) en VBA
  }
  function usageMoyen(cptActuel, cptDernier, dDerniere, dRef) {
    if (dDerniere == null) return 0;
    if (dRef > dDerniere && cptActuel > cptDernier) return (cptActuel - cptDernier) / (dRef - dDerniere);
    return 0;
  }

  /* ==========================================================================
     CALCUL COMPLET (équivalent de GenererPlanMaintenance)
     ========================================================================== */
  function lireParametres(p = {}) {
    const val = (x, def) => (x === null || x === undefined || x === '' ? def : nombre(x));
    const prm = {
      capacite: val(p.capaciteHebdo, 8),
      alerteH: val(p.alerteCompteur, 100),
      horizon: Math.round(val(p.horizonMois, 12)),
      nbDates: Math.round(val(p.nbDatesFutures, 4)),
      seuilRetard: Math.round(val(p.seuilRetardJours, 0)),
      nbMax: Math.round(val(p.nbMaxInterventionsSemaine, 3))
    };
    if (prm.nbDates < 1) prm.nbDates = 4;
    if (prm.horizon < 1) prm.horizon = 12;
    prm.dRef = depuisISO(p.dateReference) ?? aujourdhui();
    prm.finHorizon = ajouterMois(prm.dRef, prm.horizon);
    return prm;
  }

  function lireEquipements(liste) {
    const eqs = [];
    (liste || []).forEach(src => {
      const id = String(src.id ?? '').trim();
      if (!id) return;
      const e = {
        id, nom: String(src.nom ?? '').trim(), ligne: src.ligne || '',
        typeP: normaliserType(src.type), periode: nombre(src.periode), unite: String(src.unite ?? '').trim(),
        derniereDate: depuisISO(src.derniereIntervention),
        cptActuel: nombre(src.compteurActuel), cptDernier: nombre(src.dernierCompteur),
        criticite: String(src.criticite ?? '').trim(), duree: nombre(src.duree),
        technicien: String(src.technicien ?? '').trim() || 'Non affecté',
        usageJour: nombre(src.usageJour), usageEstime: false,
        valide: true, erreur: '', dateTheo: null, cible: 0, restant: 0, retard: '', etat: ''
      };
      if (!e.typeP) e.erreur = 'Type de périodicité inconnu (Temporelle / Usage)';
      else if (e.periode <= 0) e.erreur = 'Périodicité manquante ou nulle';
      else if (e.typeP === 'Temporelle' && e.derniereDate == null) e.erreur = 'Date de dernière intervention manquante';
      else if (e.typeP === 'Temporelle' && !codeUnite(e.unite)) e.erreur = 'Unité inconnue pour une périodicité temporelle : ' + e.unite;
      else if (e.typeP === 'Usage' && e.cptActuel < e.cptDernier) e.erreur = 'Compteur actuel inférieur au dernier compteur';
      if (e.erreur) e.valide = false;
      eqs.push(e);
    });
    return eqs;
  }

  function calculerEquipement(e, prm) {
    e.dateTheo = null; e.cible = 0; e.restant = 0; e.retard = '';
    if (!e.valide) { e.etat = 'À définir'; return; }
    if (e.typeP === 'Temporelle') {
      e.dateTheo = prochaineDate(e.derniereDate, e.periode, e.unite, 1);
      e.etat = etatTemporel(e.derniereDate, e.periode, e.unite, prm.dRef, prm.seuilRetard);
      if (e.etat !== 'Planifiée') e.retard = (prm.dRef - e.dateTheo) + ' j';
    } else {
      e.cible = e.cptDernier + e.periode;
      e.restant = e.cible - e.cptActuel;
      e.etat = etatUsage(e.cptActuel, e.cible, e.periode, prm.alerteH);
      if (e.restant < 0) e.retard = entier(-e.restant) + ' h';
      if (e.usageJour <= 0) { e.usageJour = usageMoyen(e.cptActuel, e.cptDernier, e.derniereDate, prm.dRef); e.usageEstime = true; }
      if (e.usageJour > 0) e.dateTheo = dateUsageEstimee(e.cptActuel, e.cible, e.usageJour, prm.dRef);
      else if (e.restant > 0) { e.etat = 'À définir'; e.erreur = 'Usage (h/jour) inconnu : saisir l’usage moyen ou mettre à jour le compteur'; }
      else e.dateTheo = prm.dRef;
    }
  }

  function cibleEcheance(e, k) {
    if (e.restant <= 0 && k > 1) return e.cptActuel + (k - 1) * e.periode;   // après rattrapage
    return e.cible + (k - 1) * e.periode;
  }
  function dateEcheance(e, k, prm) {
    if (e.etat === 'À définir') return null;
    if (e.typeP === 'Temporelle') {
      if (e.etat === 'Planifiée') return prochaineDate(e.derniereDate, e.periode, e.unite, k);
      if (k === 1) return prm.dRef;                                            // rattrapage immédiat
      return prochaineDate(prm.dRef, e.periode, e.unite, k - 1);
    }
    if (e.usageJour > 0) return dateUsageEstimee(e.cptActuel, cibleEcheance(e, k), e.usageJour, prm.dRef);
    return k === 1 ? prm.dRef : null;
  }

  function genererInterventions(eqs, prm) {
    const ints = [];
    eqs.forEach((e, i) => {
      for (let k = 1; k <= 500; k++) {
        const d = dateEcheance(e, k, prm);
        if (d == null || d > prm.finHorizon) break;
        let decl;
        if (e.typeP === 'Temporelle') {
          decl = (k === 1 && e.etat !== 'Planifiée') ? `Date (prévue le ${fmt(e.dateTheo)})` : `Date (tous les ${e.periode} ${e.unite})`;
        } else {
          decl = `Compteur ${entier(cibleEcheance(e, k))} h` + (d > prm.dRef ? ' (date estimée)' : '');
        }
        ints.push({ idx: i, numero: k, date: d, declenchement: decl, etat: k === 1 ? e.etat : 'Planifiée', alertes: [], cible: e.typeP === 'Usage' ? cibleEcheance(e, k) : null });
      }
    });
    // tri stable : date, puis criticité décroissante (clé = date*10 + (4 - rang))
    const cle = it => it.date * 10 + (4 - rangCriticite(eqs[it.idx].criticite));
    return ints.map((it, ordre) => ({ it, ordre })).sort((a, b) => cle(a.it) - cle(b.it) || a.ordre - b.ordre).map(x => x.it);
  }

  function detecterConflits(eqs, ints, prm, techs) {
    const al = [];
    const ajouter = (quand, equipements, technicien, type, resultat, detail) => al.push({ quand, equipements, technicien, type, resultat, detail });

    // 1. alertes par équipement
    eqs.forEach(e => {
      const lib = `${e.id} - ${e.nom}`;
      if (e.etat === 'En retard' || e.etat === 'Retard critique') {
        if (e.typeP === 'Temporelle') ajouter(e.dateTheo, lib, e.technicien, 'Retard (date dépassée)', e.etat,
          `Échéance du ${fmt(e.dateTheo)} dépassée de ${e.retard} → intervention replanifiée le ${fmt(prm.dRef)}`);
        else ajouter(`Compteur ${entier(e.cptActuel)} h`, lib, e.technicien, 'Retard (compteur dépassé)', e.etat,
          `Cible ${entier(e.cible)} h dépassée de ${e.retard} → intervention immédiate`);
      } else if (e.etat === 'À surveiller') {
        ajouter(`Compteur ${entier(e.cptActuel)} h`, lib, e.technicien, 'Seuil d’usage proche', 'À surveiller',
          `Reste ${entier(e.restant)} h avant ${entier(e.cible)} h (date estimée ${fmt(e.dateTheo)})`);
      } else if (e.etat === 'À définir') {
        ajouter('-', lib, e.technicien, 'Saisie incomplète', 'À définir', e.erreur);
      }
    });

    // 2. charge par semaine
    const lundi1 = lundi(prm.dRef);
    const nbSem = Math.floor((lundi(prm.finHorizon) - lundi1) / 7) + 1;
    const numSem = d => Math.min(nbSem, Math.max(1, Math.floor((lundi(d) - lundi1) / 7) + 1));
    const semaines = Array.from({ length: nbSem }, (_, s) => ({
      lundi: lundi1 + 7 * s, lib: libSemaine(lundi1 + 7 * s), nb: 0, charge: Object.fromEntries(techs.map(t => [t, 0])),
      equipements: [], conflit: '', tropInterventions: false, surcharges: []
    }));
    ints.forEach(it => {
      const s = semaines[numSem(it.date) - 1], e = eqs[it.idx];
      s.nb += 1; s.charge[e.technicien] += e.duree; s.equipements.push(it);
      it.semaine = numSem(it.date);
    });
    semaines.forEach(s => {
      const txt = [];
      if (s.nb > prm.nbMax) {
        s.tropInterventions = true;
        txt.push(`Trop d’interventions : ${s.nb} > ${prm.nbMax}`);
        ajouter(s.lib, s.equipements.map(it => eqs[it.idx].id).join(', '), 'Tous', 'Nombre d’interventions / semaine', 'CONFLIT', txt[0]);
      }
      techs.forEach(t => {
        if (s.charge[t] > prm.capacite) {
          s.surcharges.push(t);
          txt.push(`Surcharge ${t} : ${s.charge[t]} h > ${prm.capacite} h`);
          ajouter(s.lib, s.equipements.filter(it => eqs[it.idx].technicien === t).map(it => eqs[it.idx].id).join(', '), t,
            'Charge hebdomadaire', 'CONFLIT', `${s.charge[t]} h prévues pour ${prm.capacite} h disponibles`);
        }
      });
      s.conflit = txt.join(' ; ');
    });
    ints.forEach(it => { if (semaines[it.semaine - 1].conflit) it.alertes.push('Conflit semaine'); });

    // 3. cas limite : même date
    for (let a = 0; a < ints.length - 1; a++) {
      for (let b = a + 1; b < ints.length; b++) {
        if (ints[b].date !== ints[a].date) break;
        const ea = eqs[ints[a].idx], eb = eqs[ints[b].idx];
        ints[a].alertes.push('Même date que ' + eb.id);
        ints[b].alertes.push('Même date que ' + ea.id);
        const lst = `${ea.id} + ${eb.id}`;
        if (ea.technicien === eb.technicien) {
          const txt = rangCriticite(eb.criticite) < rangCriticite(ea.criticite) ? ' (moins critique)' : ' (même criticité)';
          ajouter(ints[a].date, lst, ea.technicien, 'Même date - même technicien', 'À arbitrer',
            `${ea.duree + eb.duree} h le même jour : enchaîner les deux ou décaler ${eb.id}${txt} au ${fmt(jourOuvreSuivant(ints[b].date))}`);
        } else {
          ajouter(ints[a].date, lst, `${ea.technicien} / ${eb.technicien}`, 'Même date - techniciens différents', 'OK',
            'Interventions en parallèle possibles');
        }
      }
    }
    return { alertes: al, semaines };
  }

  function calculer(donnees) {
    const prm = lireParametres(donnees.parametres);
    const eqs = lireEquipements(donnees.equipements);
    const techs = [...new Set(eqs.map(e => e.technicien))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    eqs.forEach(e => calculerEquipement(e, prm));
    eqs.forEach(e => { e.echeances = Array.from({ length: prm.nbDates }, (_, k) => dateEcheance(e, k + 1, prm)); });
    const ints = genererInterventions(eqs, prm);
    const { alertes, semaines } = detecterConflits(eqs, ints, prm, techs);
    const compter = etat => eqs.filter(e => e.etat === etat).length;
    return {
      prm, equipements: eqs, interventions: ints, alertes, semaines, techniciens: techs,
      stats: {
        nbEq: eqs.length, nbTemp: eqs.filter(e => e.typeP === 'Temporelle').length, nbUsage: eqs.filter(e => e.typeP === 'Usage').length,
        nbInt: ints.length, enRetard: compter('En retard') + compter('Retard critique'), aSurveiller: compter('À surveiller'),
        aDefinir: compter('À définir'), semainesConflit: semaines.filter(s => s.conflit).length,
        memeDate: alertes.filter(a => a.type.startsWith('Même date')).length,
        aArbitrer: alertes.filter(a => a.resultat === 'À arbitrer').length
      }
    };
  }

  /* ==========================================================================
     TESTS (équivalent de TesterMoteur)
     ========================================================================== */
  function tester() {
    const ref = depuisYMD(2026, 10, 16), D = depuisYMD;
    const liste = (d, p, u) => [1, 2, 3, 4].map(k => fmt(prochaineDate(d, p, u, k))).join(' ; ');
    const t = [];
    const v = (seance, cas, attendu, obtenu) => t.push({ n: t.length + 1, seance, cas, attendu, obtenu, ok: attendu === obtenu });
    v(5, 'EQ01 Sérigraphie : dernière 05/09/2026, tous les 3 mois', '05/12/2026 ; 05/03/2027 ; 05/06/2027 ; 05/09/2027', liste(D(2026, 9, 5), 3, 'Mois'));
    v(5, 'EQ03 Four de refusion : dernière 10/07/2026, tous les 6 mois', '10/01/2027 ; 10/07/2027 ; 10/01/2028 ; 10/07/2028', liste(D(2026, 7, 10), 6, 'Mois'));
    v(5, 'EQ05 Convoyeur : dernière 30/09/2026, tous les mois', '30/10/2026 ; 30/11/2026 ; 30/12/2026 ; 30/01/2027', liste(D(2026, 9, 30), 1, 'Mois'));
    v(5, 'EQ08 Compresseur : dernière 25/09/2026, tous les mois', '25/10/2026 ; 25/11/2026 ; 25/12/2026 ; 25/01/2027', liste(D(2026, 9, 25), 1, 'Mois'));
    v(5, 'Fin de mois : 31/01/2026 + 1 mois', '28/02/2026', fmt(prochaineDate(D(2026, 1, 31), 1, 'Mois', 1)));
    v(5, 'Pas de dérive : 31/01/2026, 2e échéance mensuelle', '31/03/2026', fmt(prochaineDate(D(2026, 1, 31), 1, 'Mois', 2)));
    v(5, 'Unité Semaine : 01/10/2026 + 2 semaines', '15/10/2026', fmt(prochaineDate(D(2026, 10, 1), 2, 'Semaine', 1)));
    v(5, 'Échéance tombant le jour même (16/07 + 3 mois, réf. 16/10)', 'Planifiée', etatTemporel(D(2026, 7, 16), 3, 'Mois', ref, 0));
    v(6, 'Usage EQ02 : 4200 h, cible 4300 h, alerte 100 h', 'À surveiller', etatUsage(4200, 4300, 500, 100));
    v(6, 'Usage : 4000 h, cible 4300 h', 'Planifiée', etatUsage(4000, 4300, 500, 100));
    v(6, 'Usage : 4350 h, cible 4300 h (dépassé)', 'En retard', etatUsage(4350, 4300, 500, 100));
    v(6, 'Usage : 4900 h, cible 4300 h (dépasse largement)', 'Retard critique', etatUsage(4900, 4300, 500, 100));
    v(6, 'Usage moyen EQ02 : 400 h en 31 jours', '12,9', usageMoyen(4200, 3800, D(2026, 9, 15), ref).toFixed(1).replace('.', ','));
    v(6, 'Date estimée EQ02 : 100 h restantes à 12,9 h/j', '24/10/2026', fmt(dateUsageEstimee(4200, 4300, 400 / 31, ref)));
    v(6, 'Temporel en retard : 01/06/2026 + 3 mois, réf. 16/10/2026', 'En retard', etatTemporel(D(2026, 6, 1), 3, 'Mois', ref, 0));
    v(6, 'Retard critique : 01/01/2026 + 3 mois (2 échéances manquées)', 'Retard critique', etatTemporel(D(2026, 1, 1), 3, 'Mois', ref, 0));
    v(6, 'Semaine ISO du 19/10/2026', '43', String(isoSemaine(D(2026, 10, 19))));
    v(6, 'Semaine ISO du 01/01/2027 (appartient à 2026)', '53', String(isoSemaine(D(2027, 1, 1))));
    v(6, 'Jour ouvré suivant le vendredi 04/12/2026', '07/12/2026', fmt(jourOuvreSuivant(D(2026, 12, 4))));
    return t;
  }

  const Moteur = {
    calculer, tester, prochaineDate, etatTemporel, etatUsage, dateUsageEstimee, usageMoyen,
    outils: { depuisISO, versISO, depuisYMD, versYMD, fmt, ajouterMois, lundi, isoSemaine, libSemaine, jourSemaine, jourOuvreSuivant, aujourdhui, rangCriticite, nombre }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Moteur;
  else racine.Moteur = Moteur;
})(typeof window !== 'undefined' ? window : globalThis);
