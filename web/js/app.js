/* ==========================================================================
   app.js — Interface du plan de maintenance CMS
   Dépend de : moteur.js (calcul), donnees.js (stockage), plateforme.js
   (navigateur / Android), sync.js (synchronisation optionnelle).
   ========================================================================== */
(function () {
  'use strict';
  const M = window.Moteur, O = M.outils, fmt = O.fmt, D = window.Donnees, P = window.Plateforme, S = window.Synchro;
  const CFG = window.PMCMS_CONFIG || {};

  const etat = {
    donnees: null, defaut: null, res: null, vue: 'tableau', jour: null,
    filtres: { tech: 'Tous', etat: 'Tous', q: '' }, filtreConflit: 'Tous',
    edition: null, aSupprimer: null, confirmerReset: false, rapportImport: null,
    enregistreLe: null, erreurEnregistrement: null,
    enLigne: P.enLigne(), installable: false,
    sync: { etat: 'inactif', message: '', conflit: null, enCours: false }
  };
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nbFr = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR');
  const clone = D.clone;
  const heure = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

  /* ---------------- Notifications ---------------- */
  function notifier(texte, { type = 'info', action = null, duree = 5000 } = {}) {
    const zone = $('#notifications'); if (!zone) return;
    const n = document.createElement('div');
    n.className = 'notif notif-' + type;
    n.setAttribute('role', type === 'erreur' ? 'alert' : 'status');
    n.innerHTML = `<span>${esc(texte)}</span>${action ? `<button type="button" class="btn lien">${esc(action.lib)}</button>` : ''}<button type="button" class="fermer" aria-label="Fermer">×</button>`;
    const fermer = () => { n.classList.add('sortie'); setTimeout(() => n.remove(), 200); };
    n.querySelector('.fermer').onclick = fermer;
    if (action) n.querySelector('.btn').onclick = () => { fermer(); action.fn(); };
    zone.appendChild(n);
    while (zone.children.length > 3) zone.firstChild.remove();
    if (duree) setTimeout(fermer, action ? Math.max(duree, 8000) : duree);
  }

  /* ---------------- Enregistrement ---------------- */
  let minuteurSync = null;
  function sauver({ silencieux = false } = {}) {
    const r = D.ecrire(etat.donnees);
    if (r.ok) { etat.enregistreLe = r.quand; etat.erreurEnregistrement = null; }
    else { etat.erreurEnregistrement = r.erreur; notifier(r.erreur + ' Exportez vos données pour ne rien perdre.', { type: 'erreur', duree: 0 }); }
    if (S.actif && S.connecte) { S.signalerModification(); clearTimeout(minuteurSync); minuteurSync = setTimeout(() => synchroniser({ silencieux: true }), 2500); }
    if (!silencieux) rendreEtatBandeau();
    return r.ok;
  }
  // Modifie les données, enregistre, recalcule ; propose d'annuler
  function modifier(fn, { message, annulable = true } = {}) {
    const avant = clone(etat.donnees);
    fn(etat.donnees);
    sauver({ silencieux: true });
    recalculer();
    if (message) notifier(message, { type: 'ok', action: annulable ? { lib: 'Annuler', fn: () => { etat.donnees = avant; sauver({ silencieux: true }); recalculer(); notifier('Modification annulée.'); } } : null });
  }

  /* ---------------- États → classes ---------------- */
  const classeEtat = e => ({ 'Planifiée': 'e-ok', 'OK': 'e-ok', 'À surveiller': 'e-att', 'À arbitrer': 'e-att', 'En retard': 'e-ret', 'Retard critique': 'e-crit', 'CONFLIT': 'e-crit', 'À définir': 'e-def' }[e] || 'e-def');
  const pastille = e => `<span class="etat ${classeEtat(e)}">${esc(e)}</span>`;
  const gravite = r => ({ 'Retard critique': 0, 'CONFLIT': 1, 'En retard': 2, 'À arbitrer': 3, 'À surveiller': 4, 'À définir': 5, 'OK': 9 }[r] ?? 8);
  const quandTxt = q => (typeof q === 'number' ? fmt(q) : q);
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const jourCourt = d => JOURS[O.jourSemaine(d) - 1];

  /* ---------------- Calcul ---------------- */
  function recalculer() {
    try {
      etat.res = M.calculer(etat.donnees);
      etat.jour = O.aujourdhui();
    } catch (e) {
      console.error(e);
      $('#vue').innerHTML = `<div class="message erreur" role="alert">Le calcul a échoué : ${esc(e.message)}. Vérifiez les données (onglet Paramètres → importer une sauvegarde) ou revenez aux données d’origine.</div>
        <div class="actions" style="margin-top:12px"><button class="btn danger" type="button" data-action="reset-ok">Revenir aux données d’origine</button></div>`;
      return;
    }
    rendre();
  }

  /* ---------------- Rendu général ---------------- */
  const VUES = [
    ['tableau', 'Tableau de bord'], ['equipements', 'Équipements'], ['calcul', 'Calcul'], ['planning', 'Planning'],
    ['charge', 'Charge'], ['conflits', 'Conflits'], ['gantt', 'Gantt'], ['tests', 'Tests'], ['parametres', 'Paramètres']
  ];
  function rendreNav() {
    const nbProblemes = etat.res.alertes.filter(a => a.resultat !== 'OK').length;
    $('#nav').innerHTML = VUES.map(([id, lib]) =>
      `<a class="onglet" href="#${id}" data-vue="${id}" ${etat.vue === id ? 'aria-current="page"' : ''}>${lib}${id === 'conflits' && nbProblemes ? `<span class="compte" aria-label="${nbProblemes} contrôles à voir">${nbProblemes}</span>` : ''}</a>`).join('');
    rendreEtatBandeau();
  }
  function rendreEtatBandeau() {
    if (!etat.res) return;
    const p = etat.res.prm;
    let enreg;
    if (etat.erreurEnregistrement) enreg = `<span class="puce-meta alerte" title="${esc(etat.erreurEnregistrement)}">Non enregistré</span>`;
    else if (etat.enregistreLe) enreg = `<span class="puce-meta">Enregistré <b>${heure(etat.enregistreLe)}</b></span>`;
    else enreg = `<span class="puce-meta">Données d’origine</span>`;
    let sync = '';
    if (S.actif && S.connecte) {
      const t = { ok: `Synchronisé <b>${heure(S.meta.derniere)}</b>`, encours: 'Synchronisation…', erreur: 'Synchro en échec', conflit: 'Conflit à résoudre', attente: 'À synchroniser' }[etat.sync.etat] || 'Compte connecté';
      sync = `<a class="puce-meta ${etat.sync.etat === 'erreur' || etat.sync.etat === 'conflit' ? 'alerte' : ''}" href="#parametres">${t}</a>`;
    }
    $('#meta').innerHTML = `${!etat.enLigne ? '<span class="puce-meta alerte">Hors ligne</span>' : ''}<span class="puce-meta">Référence <b>${fmt(p.dRef)}</b></span>${enreg}${sync}` +
      (etat.installable ? '<button class="puce-meta bouton" type="button" data-action="installer">Installer l’application</button>' : '');
  }
  function rendre() {
    rendreNav();
    const f = { tableau: vueTableau, equipements: vueEquipements, calcul: vueCalcul, planning: vuePlanning, charge: vueCharge, conflits: vueConflits, gantt: vueGantt, tests: vueTests, parametres: vueParametres }[etat.vue] || vueTableau;
    $('#vue').innerHTML = f();
    apresRendu();
  }
  function entete(titre, texte, droite = '') {
    return `<div class="entete-vue"><div><h2>${titre}</h2>${texte ? `<p>${texte}</p>` : ''}</div>${droite}</div>`;
  }

  /* ================= Tableau de bord ================= */
  function vueTableau() {
    const r = etat.res, s = r.stats, p = r.prm;
    const tuiles = [
      ['Interventions', s.nbInt, `sur ${p.horizon} mois · ${s.nbEq} équipements (${s.nbTemp} temporels, ${s.nbUsage} à l’usage)`, 'var(--barre)'],
      ['En retard', s.enRetard, s.enRetard ? 'date ou compteur dépassé' : 'aucune échéance dépassée', s.enRetard ? 'var(--ret-marque)' : 'var(--ok-marque)'],
      ['À surveiller', s.aSurveiller, `compteur à ${p.alerteH} h ou moins du seuil`, 'var(--att-marque)'],
      ['Semaines en conflit', s.semainesConflit, `sur ${r.semaines.length} · max ${p.nbMax} interventions, ${p.capacite} h / technicien`, s.semainesConflit ? 'var(--crit-marque)' : 'var(--ok-marque)'],
      ['Dates identiques', s.memeDate, `dont ${s.aArbitrer} à arbitrer (même technicien)`, s.aArbitrer ? 'var(--att-marque)' : 'var(--def-marque)']
    ];
    const prio = r.alertes.filter(a => a.resultat !== 'OK').sort((a, b) => gravite(a.resultat) - gravite(b.resultat)).slice(0, 8);
    const prochaines = r.interventions.filter(it => it.date >= p.dRef && it.date <= p.dRef + 30);
    return entete('Tableau de bord', `Situation du parc au <b class="num">${fmt(p.dRef)}</b> : ce qui demande une action, puis les interventions des 30 prochains jours.`) +
      `<div class="pile">
        <div class="indicateurs">${tuiles.map(([l, v, sous, c]) => `<div class="indic" style="--marque:${c}"><div class="lib">${l}</div><div class="val">${v}</div><div class="sous">${sous}</div></div>`).join('')}</div>
        <div class="grille-2">
          <section class="panneau"><header><h3>À traiter en priorité</h3><small>${prio.length ? 'trié par gravité' : ''}</small></header>
            ${prio.length ? `<ul class="liste">${prio.map(a => `<li><span class="quand">${esc(quandTxt(a.quand))}</span><span class="quoi"><b>${esc(a.type)}</b><span>${esc(a.equipements)} — ${esc(a.detail)}</span></span>${pastille(a.resultat)}</li>`).join('')}</ul>` : '<div class="vide">Rien à traiter : aucun retard ni conflit.</div>'}
            <div class="corps"><button class="btn lien" data-aller="conflits" type="button">Voir tous les contrôles →</button></div>
          </section>
          <section class="panneau"><header><h3>30 prochains jours</h3><small>${prochaines.length} intervention${prochaines.length > 1 ? 's' : ''}</small></header>
            ${prochaines.length ? `<ul class="liste">${prochaines.map(it => { const e = r.equipements[it.idx]; return `<li><span class="quand">${jourCourt(it.date)} ${fmt(it.date)}</span><span class="quoi"><b>${esc(e.id)} · ${esc(e.nom)}</b><span>${esc(e.technicien)} · ${nbFr(e.duree)} h · ${esc(it.declenchement)}</span></span>${pastille(it.etat)}</li>`; }).join('')}</ul>` : '<div class="vide">Aucune intervention dans les 30 prochains jours.</div>'}
            <div class="corps"><button class="btn lien" data-aller="planning" type="button">Ouvrir le planning complet →</button></div>
          </section>
        </div>
        <section class="panneau"><header><h3>Interventions par semaine</h3><small>barre rouge = semaine en conflit</small></header>
          <div class="corps defile">${graphBarres(r.semaines.map(s => ({ s, v: s.nb, conflit: s.tropInterventions || s.surcharges.length > 0 })), p.nbMax, 'interventions', `max ${p.nbMax}`)}</div>
          <div class="legende"><span><i style="--c:var(--barre)"></i>Nombre d’interventions</span><span><i style="--c:var(--crit-marque)"></i>Semaine en conflit</span><span><i class="trait"></i>Limite (${p.nbMax} par semaine)</span></div>
        </section>
      </div>`;
  }

  /* --------- Graphique en barres (SVG, une série, ligne de limite) --------- */
  function graphBarres(points, limite, unite, libLimite) {
    const n = points.length, L = Math.max(640, n * 16), H = 190, g = 34, d = 8, h0 = 18, b = 34;
    const max = Math.max(limite, ...points.map(p => p.v), 1);
    const pas = max <= 6 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
    const top = Math.ceil(max / pas) * pas;
    const y = v => H - b - (v / top) * (H - b - h0);
    const lx = (L - g - d) / n, lb = Math.max(4, lx - 4);
    let svg = `<svg class="graph" viewBox="0 0 ${L} ${H}" role="img" aria-label="Nombre d’${unite} par semaine" style="min-width:${L}px">`;
    for (let v = 0; v <= top; v += pas) svg += `<line class="grille" x1="${g}" x2="${L - d}" y1="${y(v)}" y2="${y(v)}"/><text x="${g - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
    points.forEach((p, i) => {
      const x = g + i * lx + (lx - lb) / 2, hh = H - b - y(p.v);
      const r = Math.min(3, lb / 2, hh);
      const path = hh > 0 ? `M${x},${H - b} V${y(p.v) + r} Q${x},${y(p.v)} ${x + r},${y(p.v)} H${x + lb - r} Q${x + lb},${y(p.v)} ${x + lb},${y(p.v) + r} V${H - b} Z` : '';
      const tip = `<b>${esc(p.s.lib)}</b> · du ${fmt(p.s.lundi)} au ${fmt(p.s.lundi + 6)}<br>${p.v} ${unite}${p.s.conflit ? `<br>⚠ ${esc(p.s.conflit)}` : ''}`;
      svg += `<g class="col" data-tip="${esc(tip)}"><rect class="cible" x="${g + i * lx}" y="${h0}" width="${lx}" height="${H - b - h0}"/>${path ? `<path class="barre${p.conflit ? ' conflit' : ''}" d="${path}"/>` : ''}</g>`;
      if (i % 4 === 0) svg += `<text x="${x + lb / 2}" y="${H - b + 14}" text-anchor="middle">S${String(O.isoSemaine(p.s.lundi)).padStart(2, '0')}</text>`;
      if (i % 4 === 0 && (i === 0 || O.versYMD(p.s.lundi).m !== O.versYMD(points[Math.max(0, i - 4)].s.lundi).m)) svg += `<text x="${x + lb / 2}" y="${H - b + 27}" text-anchor="middle">${MOIS_COURT[O.versYMD(p.s.lundi).m - 1]}</text>`;
    });
    svg += `<line class="limite" x1="${g}" x2="${L - d}" y1="${y(limite)}" y2="${y(limite)}"/><text class="lib-limite" x="${L - d}" y="${y(limite) - 4}" text-anchor="end">${esc(libLimite)}</text>`;
    return svg + '</svg>';
  }

  /* ================= Équipements ================= */
  const VIDE_EQ = { id: '', nom: '', ligne: 'CMS', type: 'Temporelle', periode: 3, unite: 'Mois', derniereIntervention: '', compteurActuel: null, dernierCompteur: null, criticite: 'Haute', duree: 2, technicien: 'Technicien 1', usageJour: null };
  function vueEquipements() {
    const r = etat.res, d = etat.donnees.equipements;
    const techs = [...new Set(d.map(e => e.technicien).filter(Boolean).concat(['Technicien 1', 'Technicien 2']))].sort();
    let form = '';
    if (etat.edition) {
      const e = etat.edition.valeurs, u = e.type === 'Usage';
      form = `<section class="panneau" id="form-eq"><header><h3>${etat.edition.index == null ? 'Nouvel équipement' : 'Modifier ' + esc(etat.edition.idOrigine)}</h3><small>les champs marqués * sont obligatoires</small></header>
        <form class="corps pile" id="f-eq" novalidate>
          <div class="form-grille">
            ${champ('f-id', 'ID *', `<input id="f-id" name="id" value="${esc(e.id)}" placeholder="EQ16" required>`)}
            ${champ('f-nom', 'Équipement *', `<input id="f-nom" name="nom" value="${esc(e.nom)}" placeholder="Nom de la machine" required>`)}
            ${champ('f-ligne', 'Ligne', `<input id="f-ligne" name="ligne" value="${esc(e.ligne)}">`)}
            ${champ('f-type', 'Type de périodicité *', `<select id="f-type" name="type">${['Temporelle', 'Usage'].map(t => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
            ${champ('f-periode', u ? 'Périodicité (heures) *' : 'Périodicité *', `<input id="f-periode" name="periode" type="number" min="0" step="any" value="${esc(e.periode)}">`)}
            ${u ? `<input type="hidden" name="unite" value="h">` : champ('f-unite', 'Unité *', `<select id="f-unite" name="unite">${['Mois', 'Semaine', 'Jour', 'An'].map(t => `<option ${e.unite === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
            ${champ('f-date', u ? 'Dernière intervention' : 'Dernière intervention *', `<input id="f-date" name="derniereIntervention" type="date" value="${esc(e.derniereIntervention || '')}">`, u ? 'sert à estimer l’usage moyen' : '')}
            ${u ? champ('f-cd', 'Dernier compteur (h) *', `<input id="f-cd" name="dernierCompteur" type="number" step="any" value="${esc(e.dernierCompteur ?? '')}">`, 'relevé lors de la dernière intervention') : ''}
            ${u ? champ('f-ca', 'Compteur actuel (h) *', `<input id="f-ca" name="compteurActuel" type="number" step="any" value="${esc(e.compteurActuel ?? '')}">`) : ''}
            ${u ? champ('f-uj', 'Usage moyen (h/jour)', `<input id="f-uj" name="usageJour" type="number" step="any" value="${esc(e.usageJour ?? '')}" placeholder="vide = estimé">`, 'facultatif') : ''}
            ${champ('f-crit', 'Criticité', `<select id="f-crit" name="criticite">${['Critique', 'Haute', 'Moyenne', 'Basse'].map(t => `<option ${e.criticite === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
            ${champ('f-duree', 'Durée prévue (h) *', `<input id="f-duree" name="duree" type="number" min="0" step="0.5" value="${esc(e.duree)}">`)}
            ${champ('f-tech', 'Technicien', `<input id="f-tech" name="technicien" list="l-tech" value="${esc(e.technicien)}"><datalist id="l-tech">${techs.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`)}
            ${champ('f-gcode', 'Code gamme', `<input id="f-gcode" name="gammeCode" value="${esc(e.gammeCode || '')}" placeholder="G16">`, 'feuille « Gamme »')}
          </div>
          ${champ('f-gops', 'Opérations de maintenance (gamme)', `<textarea id="f-gops" name="gammeOperations" rows="2" class="texte" placeholder="Nettoyer…, vérifier…, remplacer…">${esc(e.gammeOperations || '')}</textarea>`, 'affichées dans le planning pour chaque intervention')}
          ${etat.edition.erreur ? `<div class="message erreur" role="alert">${esc(etat.edition.erreur)}</div>` : ''}
          <div class="actions"><button class="btn principal" type="submit">Enregistrer</button><button class="btn" type="button" data-action="annuler-eq">Annuler</button></div>
        </form></section>`;
    }
    const lignes = d.map((src, i) => {
      const e = r.equipements.find(x => x.id === String(src.id).trim());
      if (etat.aSupprimer === i) return `<tr class="confirmer"><td colspan="9">Supprimer <b>${esc(src.id)} · ${esc(src.nom)}</b> ? Ses interventions disparaîtront du planning.</td><td class="d"><div class="actions" style="justify-content:flex-end"><button class="btn danger" type="button" data-action="supprimer-ok" data-i="${i}">Oui, supprimer</button><button class="btn" type="button" data-action="supprimer-non">Annuler</button></div></td></tr>`;
      const usage = String(src.type).toLowerCase().startsWith('usa');
      return `<tr><td class="id">${esc(src.id)}</td><td>${esc(src.nom)}</td><td>${esc(src.ligne)}</td><td>${esc(src.type)}</td>
        <td class="d num">${usage ? `${esc(src.periode)} h` : `${esc(src.periode)} ${esc(String(src.unite || '').toLowerCase())}`}</td>
        <td class="num">${src.derniereIntervention ? fmt(O.depuisISO(src.derniereIntervention)) : '—'}</td>
        <td class="d num">${usage ? `${esc(src.dernierCompteur ?? '—')} → ${esc(src.compteurActuel ?? '—')}` : '—'}</td>
        <td>${esc(src.criticite)}</td><td>${esc(src.technicien)} · <span class="num">${nbFr(O.nombre(src.duree))} h</span></td>
        <td class="d"><span style="display:inline-flex;gap:6px;align-items:center">${e ? pastille(e.etat) : ''}<button class="btn lien" type="button" data-action="modifier" data-i="${i}">Modifier</button><button class="btn lien" type="button" data-action="supprimer" data-i="${i}">Supprimer</button></span></td></tr>`;
    }).join('');
    return entete('Équipements', 'La saisie du parc (feuille « Equipement »). Chaque modification recalcule immédiatement tout le plan.',
      `<div class="actions"><button class="btn principal" type="button" data-action="ajouter">+ Ajouter un équipement</button></div>`) +
      `<div class="pile">${form}
      <section class="panneau"><header><h3>Parc</h3><small>${d.length} équipements</small></header><div class="defile"><table class="donnees">
        <thead><tr><th>ID</th><th>Équipement</th><th>Ligne</th><th>Type</th><th class="d">Périodicité</th><th>Dernière interv.</th><th class="d">Compteur (dernier → actuel)</th><th>Criticité</th><th>Technicien · durée</th><th class="d">État</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="10" class="vide">Aucun équipement. Ajoutez le premier avec le bouton ci-dessus.</td></tr>'}</tbody></table></div></section></div>`;
  }
  const champ = (id, lib, ctrl, aide = '') => `<div class="champ"><label for="${id}">${lib}</label>${ctrl}${aide ? `<span class="aide">${aide}</span>` : ''}</div>`;

  function enregistrerEquipement(form) {
    const fd = new FormData(form), v = Object.fromEntries(fd.entries());
    const num = x => (x === '' || x == null ? null : Number(String(x).replace(',', '.')));
    const eq = {
      id: v.id.trim().toUpperCase(), nom: v.nom.trim(), ligne: v.ligne.trim(), type: v.type, periode: num(v.periode),
      unite: v.type === 'Usage' ? 'h' : v.unite, derniereIntervention: v.derniereIntervention || null,
      compteurActuel: v.type === 'Usage' ? num(v.compteurActuel) : null, dernierCompteur: v.type === 'Usage' ? num(v.dernierCompteur) : null,
      criticite: v.criticite, duree: num(v.duree), technicien: v.technicien.trim() || 'Technicien 1', usageJour: v.type === 'Usage' ? num(v.usageJour) : null
    };
    const liste = etat.donnees.equipements, idx = etat.edition.index;
    let err = '';
    if (!eq.id) err = 'Saisissez un ID (par exemple EQ16).';
    else if (liste.some((x, i) => i !== idx && String(x.id).trim().toUpperCase() === eq.id)) err = `L’ID ${eq.id} existe déjà : choisissez-en un autre.`;
    else if (!eq.nom) err = 'Saisissez le nom de l’équipement.';
    else if (!(eq.periode > 0)) err = 'La périodicité doit être un nombre supérieur à 0.';
    else if (!(eq.duree >= 0)) err = 'Saisissez la durée prévue en heures.';
    else if (eq.type === 'Temporelle' && !eq.derniereIntervention) err = 'Saisissez la date de la dernière intervention.';
    else if (eq.type === 'Usage' && (eq.compteurActuel == null || eq.dernierCompteur == null)) err = 'Saisissez le dernier compteur et le compteur actuel.';
    else if (eq.type === 'Usage' && eq.compteurActuel < eq.dernierCompteur) err = 'Le compteur actuel ne peut pas être inférieur au dernier compteur.';
    if (err) { etat.edition = { ...etat.edition, valeurs: { ...etat.edition.valeurs, ...eq }, erreur: err }; rendre(); return; }
    const ancienId = idx == null ? null : String(liste[idx].id).trim().toUpperCase();
    const code = (v.gammeCode || '').trim().toUpperCase(), ops = (v.gammeOperations || '').trim();
    etat.edition = null;
    modifier(d => {
      if (idx == null) d.equipements.push(eq); else d.equipements[idx] = eq;
      d.gammes = d.gammes || [];
      const g = d.gammes.find(x => x.equipement === (ancienId || eq.id));
      if (g) { g.equipement = eq.id; g.duree = eq.duree; if (code) g.code = code; g.operations = ops; if (!ops && !code) d.gammes.splice(d.gammes.indexOf(g), 1); }
      else if (ops) d.gammes.push({ code: code || 'G' + String(d.gammes.length + 1).padStart(2, '0'), equipement: eq.id, operations: ops, frequence: eq.type === 'Usage' ? `Toutes les ${eq.periode} h` : `Tous les ${eq.periode} ${String(eq.unite).toLowerCase()}`, duree: eq.duree, ressources: eq.technicien });
    }, { message: `${eq.id} ${idx == null ? 'ajouté' : 'modifié'}. Le plan a été recalculé.` });
    $('#vue').scrollIntoView({ block: 'start' });
  }
  /* ================= Calcul ================= */
  function vueCalcul() {
    const r = etat.res, n = r.prm.nbDates;
    const lignes = r.equipements.map(e => `<tr>
      <td class="id">${esc(e.id)}</td><td>${esc(e.nom)}</td><td>${esc(e.typeP || '—')}</td>
      <td class="d num">${e.typeP === 'Usage' ? `${e.periode} h` : `${e.periode} ${esc(e.unite.toLowerCase())}`}</td>
      <td class="num">${e.derniereDate != null ? fmt(e.derniereDate) : '—'}</td>
      <td class="d num">${e.typeP === 'Usage' ? `${e.cptDernier} → ${e.cptActuel}` : '—'}</td>
      <td class="d num">${e.typeP === 'Usage' && e.usageJour > 0 ? `${nbFr(e.usageJour)}${e.usageEstime ? '<span class="petit"> est.</span>' : ''}` : '—'}</td>
      <td class="d num">${e.typeP === 'Usage' ? e.cible : '—'}</td>
      <td class="d num">${e.typeP === 'Usage' ? (e.restant <= r.prm.alerteH ? `<span class="etat ${classeEtat(e.etat)}">${e.restant} h</span>` : `${e.restant} h`) : '—'}</td>
      <td class="num">${e.dateTheo != null ? fmt(e.dateTheo) : '—'}</td><td class="num">${esc(e.retard) || '—'}</td><td>${pastille(e.etat)}</td>
      ${e.echeances.map(d => `<td class="num">${d != null ? fmt(d) : '—'}</td>`).join('')}</tr>`).join('');
    return entete('Calcul de maintenance', `Séance 5 : prochaine échéance et <b>${n} dates futures</b> pour chaque équipement. Séance 6 : compteur cible, heures restantes et usage moyen pour les équipements suivis en heures.`) +
      `<section class="panneau"><div class="defile"><table class="donnees"><thead><tr>
        <th>ID</th><th>Équipement</th><th>Type</th><th class="d">Périodicité</th><th>Dernière interv.</th><th class="d">Compteur</th><th class="d">Usage h/j</th><th class="d">Cible (h)</th><th class="d">Restant</th><th>Prochaine date</th><th>Retard</th><th>État</th>
        ${Array.from({ length: n }, (_, k) => `<th>Échéance ${k + 1}</th>`).join('')}</tr></thead><tbody>${lignes}</tbody></table></div>
        <div class="corps petit">« est. » = usage moyen estimé : (compteur actuel − dernier compteur) ÷ jours écoulés depuis la dernière intervention. Les dates des équipements à l’usage sont des estimations.</div></section>`;
  }

  /* ================= Planning ================= */
  function vuePlanning() {
    const r = etat.res, f = etat.filtres, q = f.q.trim().toLowerCase();
    const liste = r.interventions.filter(it => {
      const e = r.equipements[it.idx];
      if (f.tech !== 'Tous' && e.technicien !== f.tech) return false;
      if (f.etat === 'Alertes' && !it.alertes.length && it.etat === 'Planifiée') return false;
      if (f.etat !== 'Tous' && f.etat !== 'Alertes' && it.etat !== f.etat) return false;
      if (q && !(`${e.id} ${e.nom}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const gammes = Object.fromEntries((etat.donnees.gammes || []).map(g => [g.equipement, g]));
    let moisCourant = '', lignes = '', heures = 0;
    liste.forEach(it => {
      const e = r.equipements[it.idx], ymd = O.versYMD(it.date), cleMois = `${MOIS[ymd.m - 1]} ${ymd.y}`;
      heures += e.duree;
      if (cleMois !== moisCourant) { moisCourant = cleMois; lignes += `<tr class="groupe"><td colspan="9">${cleMois}</td></tr>`; }
      const conflit = it.alertes.includes('Conflit semaine');
      const g = gammes[e.id];
      lignes += `<tr class="${conflit ? 'ligne-conflit' : ''}">
        <td class="num" style="white-space:nowrap">${jourCourt(it.date)} ${fmt(it.date)}</td><td class="num petit">${O.libSemaine(it.date)}</td>
        <td><span class="id">${esc(e.id)}</span> ${esc(e.nom)}${g ? `<div class="op">${esc(g.code)} · ${esc(g.operations)}</div>` : ''}</td>
        <td class="d num">n°${it.numero}</td><td class="petit">${esc(it.declenchement)}</td><td class="d num">${nbFr(e.duree)} h</td>
        <td>${esc(e.technicien)}</td><td>${pastille(it.etat)}</td>
        <td>${it.alertes.map(a => `<span class="alerte-puce ${a.startsWith('Conflit') ? 'conflit' : 'meme'}">${esc(a)}</span>`).join('') || '<span class="petit">—</span>'}</td></tr>`;
    });
    const techs = ['Tous', ...r.techniciens];
    return entete('Planning', `Toutes les interventions des ${r.prm.horizon} prochains mois, triées par date (à date égale, l’équipement le plus critique d’abord).`,
      `<div class="actions"><button class="btn" type="button" data-action="export-csv">Exporter le planning (CSV)</button></div>`) +
      `<section class="panneau"><div class="outils">
        ${champ('p-tech', 'Technicien', `<select id="p-tech" data-filtre="tech">${techs.map(t => `<option ${f.tech === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`)}
        ${champ('p-etat', 'Afficher', `<select id="p-etat" data-filtre="etat">${[['Tous', 'Toutes les interventions'], ['Alertes', 'Avec alerte ou à surveiller'], ['À surveiller', 'À surveiller'], ['En retard', 'En retard'], ['Retard critique', 'Retard critique']].map(([v, l]) => `<option value="${v}" ${f.etat === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${champ('p-q', 'Rechercher', `<input id="p-q" data-filtre="q" type="search" value="${esc(f.q)}" placeholder="EQ05, convoyeur…">`)}
        <div class="petit" style="margin-left:auto"><b class="num">${liste.length}</b> intervention${liste.length > 1 ? 's' : ''} · <b class="num">${nbFr(heures)}</b> h</div>
      </div><div class="defile"><table class="donnees"><thead><tr><th>Date prévue</th><th>Semaine</th><th>Équipement · opérations</th><th class="d">Échéance</th><th>Déclenchement</th><th class="d">Durée</th><th>Technicien</th><th>État</th><th>Alertes</th></tr></thead>
      <tbody>${lignes || '<tr><td colspan="9" class="vide">Aucune intervention ne correspond aux filtres.</td></tr>'}</tbody></table></div></section>`;
  }

  /* ================= Charge ================= */
  function vueCharge() {
    const r = etat.res, p = r.prm;
    const panneaux = r.techniciens.map(t => `<section class="panneau"><header><h3>${esc(t)}</h3><small>heures prévues par semaine · capacité ${p.capacite} h</small></header>
      <div class="corps defile">${graphBarres(r.semaines.map(s => ({ s, v: s.charge[t], conflit: s.charge[t] > p.capacite })), p.capacite, 'h', `capacité ${p.capacite} h`)}</div></section>`).join('');
    const lignes = r.semaines.map(s => `<tr class="${s.conflit ? 'ligne-conflit' : ''}"><td class="num">${s.lib}</td><td class="num">${fmt(s.lundi)}</td><td class="num">${fmt(s.lundi + 6)}</td>
      <td class="d num">${s.tropInterventions ? `<span class="etat e-crit">${s.nb}</span>` : s.nb}</td>
      ${r.techniciens.map(t => `<td class="d num">${s.charge[t] > p.capacite ? `<span class="etat e-crit">${nbFr(s.charge[t])}</span>` : nbFr(s.charge[t])}</td>`).join('')}
      <td class="d num">${nbFr(r.techniciens.reduce((a, t) => a + s.charge[t], 0))}</td><td>${s.conflit ? pastille('CONFLIT') : pastille('OK')}</td><td class="petit">${esc(s.conflit)}</td></tr>`).join('');
    return entete('Charge par semaine', `Séance 6 : une semaine est en <b>CONFLIT</b> si elle compte plus de ${p.nbMax} interventions ou si un technicien dépasse ${p.capacite} h.`) +
      `<div class="pile">${panneaux}
      <section class="panneau"><header><h3>Détail des ${r.semaines.length} semaines</h3><small>feuille « Durée »</small></header><div class="defile"><table class="donnees"><thead><tr><th>Semaine</th><th>Début</th><th>Fin</th><th class="d">Interventions</th>${r.techniciens.map(t => `<th class="d">${esc(t)} (h)</th>`).join('')}<th class="d">Total (h)</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>${lignes}</tbody></table></div></section></div>`;
  }

  /* ================= Conflits ================= */
  function vueConflits() {
    const r = etat.res, f = etat.filtreConflit;
    const types = ['Tous', ...new Set(r.alertes.map(a => a.resultat))].sort((a, b) => (a === 'Tous' ? -1 : b === 'Tous' ? 1 : gravite(a) - gravite(b)));
    const liste = r.alertes.map((a, i) => ({ ...a, n: i + 1 })).filter(a => f === 'Tous' || a.resultat === f);
    return entete('Conflits et alertes', 'Retards, compteurs proches du seuil, semaines surchargées et équipements prévus le même jour (feuille « Conflits »).') +
      `<div class="pile"><div class="filtres-puces" role="group" aria-label="Filtrer par résultat">${types.map(t => `<button class="filtre" type="button" data-conflit="${esc(t)}" aria-pressed="${f === t}">${esc(t)} <span class="num">${t === 'Tous' ? r.alertes.length : r.alertes.filter(a => a.resultat === t).length}</span></button>`).join('')}</div>
      ${liste.length ? `<div class="cartes">${liste.map(a => `<article class="alerte-carte ${classeEtat(a.resultat)}"><div class="in">
        <div class="l1"><span class="num petit">CF-${String(a.n).padStart(3, '0')}</span><span class="type">${esc(a.type)}</span>${pastille(a.resultat)}</div>
        <div><b>${esc(a.equipements)}</b> <span class="petit">· ${esc(a.technicien)} · ${esc(quandTxt(a.quand))}</span></div>
        <div class="d">${esc(a.detail)}</div></div></article>`).join('')}</div>` : '<div class="panneau vide">Aucun contrôle de ce type.</div>'}</div>`;
  }

  /* ================= Gantt ================= */
  function vueGantt() {
    const r = etat.res, p = r.prm, S = r.semaines;
    const cases = {};
    r.interventions.forEach(it => { cases[`${it.idx}-${it.semaine}`] = it; });
    let mois = '', groupes = [];
    S.forEach(s => { const ymd = O.versYMD(s.lundi + 3), m = `${MOIS_COURT[ymd.m - 1]} ${String(ymd.y).slice(2)}`; if (m !== mois) { groupes.push({ m, n: 1 }); mois = m; } else groupes[groupes.length - 1].n++; });
    const tete = `<tr class="mois"><th class="fixe">Mois</th>${groupes.map(g => `<th colspan="${g.n}">${g.n > 1 ? g.m : ''}</th>`).join('')}</tr>
      <tr><th class="fixe">Équipement · technicien</th>${S.map((s, i) => `<th class="sem${i === 0 ? ' aujourdhui' : ''}" title="du ${fmt(s.lundi)} au ${fmt(s.lundi + 6)}">${String(O.isoSemaine(s.lundi)).padStart(2, '0')}</th>`).join('')}</tr>`;
    const lignes = r.equipements.map((e, i) => `<tr><td class="fixe"><span class="id">${esc(e.id)}</span> ${esc(e.nom)} <span class="petit">· ${esc(e.technicien.replace('Technicien ', 'T'))}</span></td>${S.map((s, k) => {
      const it = cases[`${i}-${k + 1}`];
      if (!it) return `<td class="sem${s.conflit ? ' semaine-conflit' : ''}"></td>`;
      const tip = `<b>${esc(e.id)}</b> ${esc(e.nom)}<br>${jourCourt(it.date)} ${fmt(it.date)} · échéance n°${it.numero}<br>${esc(it.declenchement)}<br>${esc(it.etat)}${it.alertes.length ? '<br>⚠ ' + esc(it.alertes.join(' ; ')) : ''}`;
      return `<td class="sem on ${classeEtat(it.etat)}" data-tip="${esc(tip)}">${it.numero}</td>`;
    }).join('')}</tr>`).join('');
    const synth = `<tr class="synthese"><td class="fixe">Interventions (max ${p.nbMax})</td>${S.map(s => `<td class="${s.tropInterventions ? 'x' : ''}">${s.nb || ''}</td>`).join('')}</tr>` +
      r.techniciens.map(t => `<tr class="synthese"><td class="fixe">Charge ${esc(t)} (max ${p.capacite} h)</td>${S.map(s => `<td class="${s.charge[t] > p.capacite ? 'x' : ''}">${s.charge[t] ? nbFr(s.charge[t]) : ''}</td>`).join('')}</tr>`).join('') +
      `<tr class="synthese"><td class="fixe">Conflit de charge</td>${S.map(s => `<td class="${s.conflit ? 'x' : ''}" ${s.conflit ? `data-tip="${esc(`<b>${s.lib}</b><br>${esc(s.conflit)}`)}"` : ''}>${s.conflit ? '!' : ''}</td>`).join('')}</tr>`;
    return entete('Diagramme de Gantt', 'Une ligne par équipement, une colonne par semaine ISO. Le chiffre est le numéro d’échéance ; survolez une case pour le détail.') +
      `<section class="panneau"><div class="defile"><table class="gantt"><thead>${tete}</thead><tbody>${lignes}${synth}</tbody></table></div>
      <div class="legende" style="padding-top:12px"><span><i style="--c:var(--ok-marque)"></i>Planifiée</span><span><i style="--c:var(--att-fond);outline:1px solid var(--att-marque)"></i>À surveiller</span><span><i style="--c:var(--ret-fond);outline:1px solid var(--ret-marque)"></i>En retard</span><span><i style="--c:var(--crit-fond)"></i>Retard critique / conflit</span><span><i style="--c:color-mix(in srgb, var(--crit-fond) 14%, transparent)"></i>Semaine en conflit</span></div></section>`;
  }

  /* ================= Tests ================= */
  function vueTests() {
    const t = M.tester(), ok = t.filter(x => x.ok).length, s = etat.res.stats;
    return entete('Tests du moteur', 'Les mêmes vérifications que la macro <code>TesterMoteur</code> : chaque cas est comparé à un résultat calculé à la main.',
      `<div class="indic" style="--marque:${ok === t.length ? 'var(--ok-marque)' : 'var(--crit-marque)'};min-width:180px"><div class="lib">Résultat</div><div class="val">${ok} / ${t.length}</div><div class="sous">tests réussis</div></div>`) +
      `<div class="pile"><section class="panneau"><div class="defile"><table class="donnees"><thead><tr><th>N°</th><th>Séance</th><th>Cas testé</th><th>Attendu</th><th>Obtenu</th><th>Résultat</th></tr></thead><tbody>
        ${t.map(x => `<tr><td class="num">${x.n}</td><td>Séance ${x.seance}</td><td>${esc(x.cas)}</td><td class="num">${esc(x.attendu)}</td><td class="num">${esc(x.obtenu)}</td><td>${x.ok ? pastille('OK') : '<span class="etat e-crit">ÉCHEC</span>'}</td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="panneau"><header><h3>Test sur tout le parc</h3><small>au ${fmt(etat.res.prm.dRef)}</small></header><div class="defile"><table class="donnees"><tbody>
        <tr><td>Équipements traités</td><td class="num">${s.nbEq} (${s.nbTemp} temporels, ${s.nbUsage} à l’usage)</td></tr>
        <tr><td>Interventions générées sur ${etat.res.prm.horizon} mois</td><td class="num">${s.nbInt}</td></tr>
        <tr><td>Équipements en retard</td><td class="num">${s.enRetard}</td></tr>
        <tr><td>Équipements à surveiller (compteur proche)</td><td class="num">${s.aSurveiller}</td></tr>
        <tr><td>Semaines en conflit de charge</td><td class="num">${s.semainesConflit}</td></tr>
        <tr><td>Cas de dates identiques détectés</td><td class="num">${s.memeDate}</td></tr>
      </tbody></table></div></section></div>`;
  }

  /* ================= Paramètres, données et compte ================= */
  function vueParametres() {
    const p = etat.donnees.parametres || {};
    const secours = D.lireSecours();
    const rap = etat.rapportImport;
    return entete('Paramètres et données', 'Les réglages du calcul (feuille « paramétre »), la sauvegarde de vos données et la synchronisation entre appareils.') +
      `<div class="grille-2">
      <section class="panneau"><header><h3>Paramètres du calcul</h3><small>appliqués immédiatement</small></header>
        <form class="corps form-grille" id="f-param" novalidate>
          ${champ('pa-cap', 'Capacité hebdomadaire (h / technicien)', `<input id="pa-cap" name="capaciteHebdo" type="number" inputmode="decimal" min="1" step="0.5" value="${esc(p.capaciteHebdo ?? 8)}">`)}
          ${champ('pa-al', 'Alerte compteur proche (h)', `<input id="pa-al" name="alerteCompteur" type="number" inputmode="numeric" min="0" value="${esc(p.alerteCompteur ?? 100)}">`)}
          ${champ('pa-hz', 'Horizon de planning (mois)', `<input id="pa-hz" name="horizonMois" type="number" inputmode="numeric" min="1" max="60" value="${esc(p.horizonMois ?? 12)}">`)}
          ${champ('pa-nd', 'Nombre de dates futures', `<input id="pa-nd" name="nbDatesFutures" type="number" inputmode="numeric" min="1" max="12" value="${esc(p.nbDatesFutures ?? 4)}">`)}
          ${champ('pa-sr', 'Seuil de retard (jours)', `<input id="pa-sr" name="seuilRetardJours" type="number" inputmode="numeric" min="0" value="${esc(p.seuilRetardJours ?? 0)}">`)}
          ${champ('pa-nm', 'Nb max d’interventions / semaine', `<input id="pa-nm" name="nbMaxInterventionsSemaine" type="number" inputmode="numeric" min="1" value="${esc(p.nbMaxInterventionsSemaine ?? 3)}">`)}
          ${champ('pa-dr', 'Date de référence', `<input id="pa-dr" name="dateReference" type="date" value="${esc(p.dateReference || '')}">`, 'vide = aujourd’hui ; une date permet de simuler un autre jour')}
        </form></section>

      <section class="panneau"><header><h3>Sauvegarde des données</h3><small>${etat.enregistreLe ? 'enregistré à ' + heure(etat.enregistreLe) : 'données d’origine'}</small></header>
        <div class="corps pile">
          <p class="petit">Vos modifications sont enregistrées automatiquement sur cet appareil. Exportez un fichier JSON pour les sauvegarder ailleurs ou les transférer sur un autre appareil.</p>
          <div class="actions">
            <button class="btn principal" type="button" data-action="export-json">Exporter les données (JSON)</button>
            <button class="btn" type="button" data-action="copier-json">Copier le JSON</button>
            <label class="btn" for="imp-fichier">Importer un fichier JSON</label><input id="imp-fichier" type="file" accept=".json,application/json" class="sr">
          </div>
          <div class="champ"><label for="imp-texte">Ou collez un JSON</label><textarea id="imp-texte" placeholder='{ "parametres": { … }, "equipements": [ … ] }'></textarea></div>
          <div class="actions"><button class="btn" type="button" data-action="importer-texte">Charger le JSON collé</button></div>
          ${rap ? `<div class="message ${rap.erreurs.length ? 'erreur' : 'ok'}" role="status"><b>${rap.erreurs.length ? 'Import refusé' : 'Import réussi'}</b>${[...rap.erreurs, ...rap.avert].length ? `<ul>${[...rap.erreurs, ...rap.avert].slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
          <div class="actions">
            ${etat.confirmerReset ? `<span class="message erreur">Vos modifications seront remplacées par les données d’origine du classeur.</span><button class="btn danger" type="button" data-action="reset-ok">Oui, revenir aux données d’origine</button><button class="btn" type="button" data-action="reset-non">Annuler</button>` : `<button class="btn danger" type="button" data-action="reset">Revenir aux données d’origine</button>`}
            ${secours ? `<button class="btn" type="button" data-action="restaurer-secours">Restaurer la copie de sécurité (${esc(new Date(secours.quand).toLocaleString('fr-FR'))})</button>` : ''}
          </div>
        </div></section>

      ${vueCompte()}
      </div>
      <p class="petit" style="margin-top:20px">Version ${esc(CFG.version || 'dév.')} · ${P.estNatif ? 'application Android' : 'application web'} · données format ${D.FORMAT}</p>`;
  }

  function vueCompte() {
    if (!S.actif) {
      return `<section class="panneau"><header><h3>Synchronisation entre appareils</h3><small>optionnelle</small></header>
        <div class="corps pile"><p>La synchronisation n’est pas configurée sur cette installation. L’application fonctionne entièrement sans compte : vos données restent sur cet appareil.</p>
        <p class="petit">Pour l’activer, l’administrateur crée un projet Supabase et renseigne <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> (voir docs/DEPLOYMENT_GUIDE.md).</p></div></section>`;
    }
    const sy = etat.sync;
    if (!S.connecte) {
      return `<section class="panneau"><header><h3>Synchronisation entre appareils</h3><small>compte facultatif</small></header>
        <form class="corps pile" id="f-compte" novalidate>
          <p class="petit">Connectez-vous pour retrouver le même plan sur votre PC et votre téléphone.</p>
          <div class="form-grille">
            ${champ('c-email', 'E-mail', '<input id="c-email" name="email" type="email" autocomplete="email" required>')}
            ${champ('c-mdp', 'Mot de passe', '<input id="c-mdp" name="mdp" type="password" autocomplete="current-password" minlength="6" required>', '6 caractères minimum')}
          </div>
          ${sy.message ? `<div class="message ${sy.etat === 'erreur' ? 'erreur' : 'ok'}" role="status">${esc(sy.message)}</div>` : ''}
          <div class="actions"><button class="btn principal" type="submit" data-mode="connexion" ${sy.enCours ? 'disabled' : ''}>Se connecter</button><button class="btn" type="submit" data-mode="inscription" ${sy.enCours ? 'disabled' : ''}>Créer un compte</button>${sy.enCours ? '<span class="chargement" aria-label="En cours"></span>' : ''}</div>
        </form></section>`;
    }
    const m = S.meta;
    return `<section class="panneau"><header><h3>Synchronisation entre appareils</h3><small>${esc(S.email || '')}</small></header>
      <div class="corps pile">
        <p>${m.derniere ? `Dernière synchronisation : <b>${new Date(m.derniere).toLocaleString('fr-FR')}</b>` : 'Pas encore synchronisé.'} ${m.modifie ? '· modifications locales à envoyer' : ''}</p>
        ${sy.conflit ? `<div class="message erreur" role="alert"><b>Conflit :</b> le plan a été modifié sur un autre appareil (${esc(new Date(sy.conflit.updated_at).toLocaleString('fr-FR'))}) et sur celui-ci. Choisissez la version à garder.</div>
          <div class="actions"><button class="btn principal" type="button" data-action="garder-local">Garder la version de cet appareil</button><button class="btn" type="button" data-action="garder-serveur">Garder la version en ligne</button></div>` : ''}
        ${sy.message && !sy.conflit ? `<div class="message ${sy.etat === 'erreur' ? 'erreur' : 'ok'}" role="status">${esc(sy.message)}</div>` : ''}
        <div class="actions"><button class="btn principal" type="button" data-action="synchroniser" ${sy.enCours || !etat.enLigne ? 'disabled' : ''}>Synchroniser maintenant</button><button class="btn" type="button" data-action="deconnexion">Se déconnecter</button>${sy.enCours ? '<span class="chargement" aria-label="Synchronisation en cours"></span>' : ''}</div>
        ${!etat.enLigne ? '<p class="petit">Hors ligne : la synchronisation reprendra au retour de la connexion.</p>' : ''}
      </div></section>`;
  }

  /* ---------------- Synchronisation ---------------- */
  async function synchroniser({ silencieux = false } = {}) {
    if (!S.actif || !S.connecte || etat.sync.enCours) return;
    if (!etat.enLigne) { etat.sync = { ...etat.sync, etat: 'attente' }; rendreEtatBandeau(); return; }
    etat.sync = { ...etat.sync, enCours: true, etat: 'encours', message: '' };
    rafraichirSiParametres(); rendreEtatBandeau();
    try {
      const r = await S.synchroniser(etat.donnees);
      if (r.action === 'conflit') { etat.sync = { etat: 'conflit', enCours: false, message: '', conflit: r.serveur }; if (!silencieux || etat.vue !== 'parametres') notifier('Conflit de synchronisation : choisissez la version à garder.', { type: 'erreur', action: { lib: 'Résoudre', fn: () => allerA('parametres') } }); }
      else {
        if (r.action === 'recupere') { appliquerDonneesServeur(r.donnees); }
        etat.sync = { etat: 'ok', enCours: false, conflit: null, message: { envoye: 'Données envoyées en ligne.', recupere: 'Données récupérées depuis le cloud.', aJour: 'Tout est à jour.' }[r.action] };
        if (!silencieux && r.action !== 'aJour') notifier(etat.sync.message, { type: 'ok' });
      }
    } catch (e) {
      if (e.code === 'session') { await S.deconnecter(); etat.sync = { etat: 'erreur', enCours: false, conflit: null, message: e.message }; }
      else etat.sync = { ...etat.sync, etat: 'erreur', enCours: false, message: e.message };
      if (!silencieux) notifier(e.message, { type: 'erreur' });
    }
    rafraichirSiParametres(); rendreEtatBandeau();
  }
  function appliquerDonneesServeur(donnees) {
    const d = D.migrer(donnees);
    if (D.valider(d).erreurs.length) throw new S.ErreurSynchro('Les données reçues du serveur sont invalides : elles n’ont pas été appliquées.', 'donnees');
    D.sauverSecours(etat.donnees, 'avant récupération depuis le cloud');
    etat.donnees = d; D.ecrire(d); etat.enregistreLe = new Date().toISOString(); recalculer();
  }
  const rafraichirSiParametres = () => { if (etat.vue === 'parametres') rendre(); };

  /* ---------------- Import ---------------- */
  function importer(texte) {
    let d;
    try { d = JSON.parse(texte); } catch (e) { etat.rapportImport = { erreurs: ['Ce texte n’est pas un JSON valide : ' + e.message], avert: [] }; return rendre(); }
    d = D.migrer(d);
    const rap = D.valider(d);
    etat.rapportImport = rap;
    if (rap.erreurs.length) return rendre();
    D.sauverSecours(etat.donnees, 'avant import');
    const avant = clone(etat.donnees);
    etat.donnees = d; sauver({ silencieux: true }); recalculer();
    notifier(`${d.equipements.length} équipements importés${rap.avert.length ? ` (${rap.avert.length} avertissement${rap.avert.length > 1 ? 's' : ''})` : ''}.`, { type: 'ok', action: { lib: 'Annuler', fn: () => { etat.donnees = avant; sauver({ silencieux: true }); etat.rapportImport = null; recalculer(); notifier('Import annulé.'); } } });
  }

  /* ---------------- Exports ---------------- */
  async function exporter(nom, contenu, type) {
    try {
      const r = await P.exporterFichier(nom, contenu, type);
      if (r.ok) notifier(P.estNatif ? `${nom} prêt : choisissez où l’enregistrer.` : `${nom} téléchargé.`, { type: 'ok' });
    } catch (e) { notifier('Export impossible : ' + (e.message || e), { type: 'erreur' }); }
  }
  async function copier(contenu) {
    try { await navigator.clipboard.writeText(contenu); notifier('JSON copié dans le presse-papiers.', { type: 'ok' }); }
    catch (e) { const t = $('#imp-texte'); if (t) { t.value = contenu; t.select(); } notifier('Copie automatique impossible : le JSON est sélectionné dans la zone de texte, copiez-le avec Ctrl + C.', { type: 'erreur' }); }
  }
  function csvPlanning() {
    const r = etat.res, sep = ';', q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const l = [['ID intervention', 'ID équipement', 'Équipement', 'N° échéance', 'Date prévue', 'Semaine', 'Déclenchement', 'Durée (h)', 'Technicien', 'Criticité', 'État', 'Alerte'].map(q).join(sep)];
    r.interventions.forEach((it, i) => { const e = r.equipements[it.idx]; l.push([`INT-${String(i + 1).padStart(3, '0')}`, e.id, e.nom, it.numero, fmt(it.date), O.libSemaine(it.date), it.declenchement, String(e.duree).replace('.', ','), e.technicien, e.criticite, it.etat, it.alertes.join(' ; ')].map(q).join(sep)); });
    return '﻿' + l.join('\r\n');
  }
  const dateFichier = () => new Date().toISOString().slice(0, 10);

  /* ---------------- Navigation ---------------- */
  function allerA(vue) {
    if (!VUES.some(v => v[0] === vue)) vue = 'tableau';
    etat.vue = vue; etat.edition = null; etat.aSupprimer = null; etat.confirmerReset = false; etat.rapportImport = null;
    if (location.hash.slice(1) !== vue) { location.hash = vue; return; }      // hashchange rappellera allerA
    rendre(); window.scrollTo({ top: 0 });
    const actif = document.querySelector('.onglet[aria-current="page"]'); actif && actif.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  window.addEventListener('hashchange', () => allerA(location.hash.slice(1)));

  /* ---------------- Événements ---------------- */
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b || b.closest('.notif')) return;
    if (b.dataset.aller) return allerA(b.dataset.aller);
    if (b.dataset.conflit) { etat.filtreConflit = b.dataset.conflit; return rendre(); }
    const a = b.dataset.action, i = b.dataset.i != null ? +b.dataset.i : null;
    switch (a) {
      case 'ajouter': {
        const ids = new Set(etat.donnees.equipements.map(e => String(e.id).toUpperCase()));
        let n = etat.donnees.equipements.length + 1; while (ids.has('EQ' + String(n).padStart(2, '0'))) n++;
        etat.edition = { index: null, valeurs: { ...VIDE_EQ, id: 'EQ' + String(n).padStart(2, '0'), derniereIntervention: O.versISO(etat.res.prm.dRef) } };
        etat.aSupprimer = null; rendre(); $('#f-id')?.focus(); break;
      }
      case 'modifier': {
        const e = etat.donnees.equipements[i], g = (etat.donnees.gammes || []).find(x => x.equipement === e.id) || {};
        etat.edition = { index: i, idOrigine: e.id, valeurs: { ...clone(e), gammeCode: g.code || '', gammeOperations: g.operations || '' } };
        etat.aSupprimer = null; rendre(); $('#form-eq')?.scrollIntoView({ block: 'start' }); $('#f-nom')?.focus(); break;
      }
      case 'annuler-eq': etat.edition = null; rendre(); break;
      case 'supprimer': etat.aSupprimer = i; etat.edition = null; rendre(); break;
      case 'supprimer-non': etat.aSupprimer = null; rendre(); break;
      case 'supprimer-ok': { const id = etat.donnees.equipements[i].id; etat.aSupprimer = null; modifier(d => { d.equipements.splice(i, 1); }, { message: `${id} supprimé.` }); break; }
      case 'export-csv': await exporter(`planning_maintenance_${dateFichier()}.csv`, csvPlanning(), 'text/csv'); break;
      case 'export-json': await exporter(`plan_maintenance_${dateFichier()}.json`, JSON.stringify({ ...etat.donnees, formatVersion: D.FORMAT }, null, 2), 'application/json'); break;
      case 'copier-json': await copier(JSON.stringify({ ...etat.donnees, formatVersion: D.FORMAT }, null, 2)); break;
      case 'importer-texte': importer($('#imp-texte').value); break;
      case 'reset': etat.confirmerReset = true; rendre(); break;
      case 'reset-non': etat.confirmerReset = false; rendre(); break;
      case 'reset-ok': {
        etat.confirmerReset = false; D.sauverSecours(etat.donnees, 'avant retour aux données d’origine');
        const avant = clone(etat.donnees);
        etat.donnees = clone(etat.defaut); sauver({ silencieux: true }); recalculer();
        notifier('Données d’origine restaurées.', { type: 'ok', action: { lib: 'Annuler', fn: () => { etat.donnees = avant; sauver({ silencieux: true }); recalculer(); } } });
        break;
      }
      case 'restaurer-secours': {
        const s = D.lireSecours(); if (!s) break;
        const d = D.migrer(s.donnees);
        if (D.valider(d).erreurs.length) { notifier('La copie de sécurité est illisible.', { type: 'erreur' }); break; }
        const avant = clone(etat.donnees);
        etat.donnees = d; sauver({ silencieux: true }); recalculer();
        notifier('Copie de sécurité restaurée.', { type: 'ok', action: { lib: 'Annuler', fn: () => { etat.donnees = avant; sauver({ silencieux: true }); recalculer(); } } });
        break;
      }
      case 'installer': { const ok = await P.installer(); etat.installable = false; rendreEtatBandeau(); if (ok) notifier('Application installée.', { type: 'ok' }); break; }
      case 'recharger': location.reload(); break;
      case 'synchroniser': await synchroniser(); break;
      case 'deconnexion': await S.deconnecter(); etat.sync = { etat: 'inactif', message: 'Déconnecté. Vos données restent sur cet appareil.', conflit: null, enCours: false }; rendre(); break;
      case 'garder-local':
        try { etat.sync.enCours = true; rendre(); await S.garderLocal(etat.donnees); etat.sync = { etat: 'ok', enCours: false, conflit: null, message: 'Version de cet appareil envoyée en ligne.' }; }
        catch (e) { etat.sync = { ...etat.sync, etat: 'erreur', enCours: false, message: e.message }; }
        rendre(); break;
      case 'garder-serveur':
        try { appliquerDonneesServeur(S.garderServeur(etat.sync.conflit)); etat.sync = { etat: 'ok', enCours: false, conflit: null, message: 'Version en ligne récupérée.' }; }
        catch (e) { etat.sync = { ...etat.sync, etat: 'erreur', message: e.message }; }
        rendre(); break;
    }
  });

  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const idForm = f.getAttribute('id');   // (f.id renverrait le champ nommé « id » du formulaire)
    if (idForm === 'f-eq') return enregistrerEquipement(f);
    if (idForm === 'f-compte') {
      const mode = ev.submitter && ev.submitter.dataset.mode, email = f.email.value.trim(), mdp = f.mdp.value;
      if (!/^\S+@\S+\.\S+$/.test(email)) { etat.sync = { ...etat.sync, etat: 'erreur', message: 'Saisissez une adresse e-mail valide.' }; return rendre(); }
      if (mdp.length < 6) { etat.sync = { ...etat.sync, etat: 'erreur', message: 'Le mot de passe doit contenir au moins 6 caractères.' }; return rendre(); }
      etat.sync = { ...etat.sync, enCours: true, message: '' }; rendre();
      try {
        if (mode === 'inscription') {
          const r = await S.inscrire(email, mdp);
          if (!r.connecte) { etat.sync = { etat: 'inactif', enCours: false, conflit: null, message: 'Compte créé : confirmez votre adresse avec le lien reçu par e-mail, puis connectez-vous.' }; return rendre(); }
        } else await S.connecter(email, mdp);
        etat.sync = { etat: 'ok', enCours: false, conflit: null, message: '' };
        rendre(); await synchroniser();
      } catch (e) { etat.sync = { etat: 'erreur', enCours: false, conflit: null, message: e.message }; rendre(); }
    }
  });

  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'f-type' && etat.edition) {
      const fd = Object.fromEntries(new FormData($('#f-eq')).entries());
      const usage = t.value === 'Usage';
      etat.edition.valeurs = { ...etat.edition.valeurs, ...fd, type: t.value, unite: usage ? 'h' : 'Mois', periode: usage ? 500 : 3 };
      return rendre();
    }
    if (t.dataset.filtre && t.dataset.filtre !== 'q') { etat.filtres[t.dataset.filtre] = t.value; return rendre(); }
    if (t.form && t.form.getAttribute('id') === 'f-param') {
      if (t.type !== 'date' && t.value !== '' && !t.checkValidity()) { notifier(`« ${t.labels[0].textContent} » : ${t.validationMessage}`, { type: 'erreur' }); return; }
      const id = t.id;
      modifier(d => { d.parametres = d.parametres || {}; d.parametres[t.name] = t.type === 'date' ? (t.value || null) : (t.value === '' ? null : Number(t.value)); }, { message: 'Paramètre enregistré, plan recalculé.' });
      $('#' + id)?.focus(); return;
    }
    if (t.id === 'imp-fichier' && t.files[0]) {
      if (t.files[0].size > 5e6) { notifier('Fichier trop volumineux (5 Mo maximum).', { type: 'erreur' }); return; }
      const fr = new FileReader();
      fr.onload = () => importer(String(fr.result));
      fr.onerror = () => notifier('Lecture du fichier impossible.', { type: 'erreur' });
      fr.readAsText(t.files[0]);
    }
  });
  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.filtre === 'q') { etat.filtres.q = t.value; const pos = t.selectionStart; rendre(); const n = $('#p-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  });

  /* Infobulle (survol ou toucher des barres et du Gantt) */
  const bulle = () => $('#infobulle');
  function montrerBulle(el, x, y) {
    const b = bulle(); if (!b) return;
    if (!el) { b.hidden = true; return; }
    b.innerHTML = el.dataset.tip; b.hidden = false;
    const w = b.offsetWidth, h = b.offsetHeight;
    let px = x + 14, py = y + 14;
    if (px + w > window.innerWidth - 8) px = x - w - 14;
    if (py + h > window.innerHeight - 8) py = y - h - 14;
    b.style.left = Math.max(8, px) + 'px'; b.style.top = Math.max(8, py) + 'px';
  }
  document.addEventListener('pointerover', ev => { if (ev.pointerType !== 'touch') montrerBulle(ev.target.closest('[data-tip]'), ev.clientX, ev.clientY); });
  document.addEventListener('pointermove', ev => { if (ev.pointerType !== 'touch' && !bulle().hidden) montrerBulle(ev.target.closest('[data-tip]'), ev.clientX, ev.clientY); });
  document.addEventListener('pointerup', ev => { if (ev.pointerType === 'touch') montrerBulle(ev.target.closest('[data-tip]'), ev.clientX, ev.clientY); });
  document.addEventListener('scroll', () => { const b = bulle(); if (b) b.hidden = true; }, true);
  function apresRendu() {
    const b = bulle(); if (b) b.hidden = true;
    // zones à défilement horizontal : accessibles au clavier (flèches) et nommées pour les lecteurs d'écran
    document.querySelectorAll('#vue .defile').forEach(d => {
      const titre = d.closest('.panneau')?.querySelector('h3')?.textContent || document.querySelector('#vue h2')?.textContent || 'Tableau';
      d.tabIndex = 0; d.setAttribute('role', 'region'); d.setAttribute('aria-label', titre + ' (zone défilante)');
    });
  }

  /* ---------------- Démarrage ---------------- */
  async function chargerDefaut() {
    if (window.PMCMS_DONNEES_DEFAUT) return clone(window.PMCMS_DONNEES_DEFAUT);
    const r = await fetch('data/data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('data/data.json introuvable (' + r.status + ')');
    return r.json();
  }
  async function demarrer() {
    try {
      etat.defaut = D.migrer(await chargerDefaut());
    } catch (e) {
      $('#vue').innerHTML = `<div class="message erreur" role="alert">Impossible de charger les données de départ (${esc(e.message)}). Vérifiez votre connexion puis réessayez.</div><div class="actions" style="margin-top:12px"><button class="btn principal" type="button" data-action="recharger">Réessayer</button></div>`;
      return;
    }
    const local = D.lire();
    if (local) { etat.donnees = local.donnees; etat.enregistreLe = local.enregistreLe; if (local.repris) { sauver({ silencieux: true }); } }
    else etat.donnees = clone(etat.defaut);
    const h = location.hash.slice(1);
    etat.vue = VUES.some(v => v[0] === h) ? h : 'tableau';
    recalculer();
    if (local && local.repris) notifier('Vos données de la version précédente ont été reprises.', { type: 'ok' });

    P.preparerNatif();
    P.activerHorsLigne(appliquer => notifier('Une nouvelle version est disponible.', { duree: 0, action: { lib: 'Mettre à jour', fn: appliquer } }));
    P.surInstallable(possible => { etat.installable = possible; rendreEtatBandeau(); });
    P.surReseau(enLigne => {
      etat.enLigne = enLigne; rendreEtatBandeau(); rafraichirSiParametres();
      notifier(enLigne ? 'Connexion rétablie.' : 'Hors ligne : l’application continue de fonctionner, vos données restent sur cet appareil.', { type: enLigne ? 'ok' : 'info' });
      if (enLigne) synchroniser({ silencieux: true });
    });
    // la date de référence « aujourd'hui » change à minuit : recalcul automatique
    setInterval(() => { if (O.aujourdhui() !== etat.jour && !(etat.donnees.parametres || {}).dateReference) recalculer(); }, 60 * 1000);
    if (S.actif && S.connecte) synchroniser({ silencieux: true });
  }
  window.addEventListener('error', e => { console.error(e.error || e.message); notifier('Une erreur inattendue est survenue. Vos données sont enregistrées ; rechargez la page si l’affichage est incorrect.', { type: 'erreur' }); });
  demarrer();
})();
