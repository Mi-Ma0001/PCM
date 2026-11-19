// Tests unitaires du moteur de calcul : node --test tests/unit/
// Référence : résultats produits par la macro VBA (tests/fixtures/resultats-vba.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const M = require('../../web/js/moteur.js');
const O = M.outils;
const donnees = JSON.parse(readFileSync(new URL('../../web/data/data.json', import.meta.url), 'utf8'));
const vba = JSON.parse(readFileSync(new URL('../fixtures/resultats-vba.json', import.meta.url), 'utf8'));
const iso = n => (n == null ? null : O.versISO(n));
const normaliser = s => String(s ?? '').replace(/->/g, '→').replace(/'/g, '’');

const res = M.calculer({ ...donnees, parametres: { ...donnees.parametres, dateReference: vba.dateReference } });

test('le moteur passe ses 19 tests intégrés (équivalent de TesterMoteur)', () => {
  const t = M.tester();
  assert.equal(t.length, 19);
  for (const x of t) assert.ok(x.ok, `${x.cas} : attendu ${x.attendu}, obtenu ${x.obtenu}`);
});

test('chiffres clés identiques à la macro VBA au 16/10/2026', () => {
  assert.equal(res.stats.nbEq, 15);
  assert.equal(res.stats.nbInt, 88);
  assert.equal(res.stats.semainesConflit, 4);
  assert.equal(res.stats.memeDate, 12);
  assert.equal(res.stats.aSurveiller, 2);
  assert.equal(res.stats.enRetard, 0);
});

test('planning identique à la macro VBA, ligne par ligne', () => {
  assert.equal(res.interventions.length, vba.planning.length);
  res.interventions.forEach((it, i) => {
    const e = res.equipements[it.idx], ref = vba.planning[i];
    assert.deepEqual(
      [e.id, it.numero, iso(it.date), it.declenchement, it.etat, it.alertes.join(' ; ')],
      [ref.equipement, ref.numero, ref.date, ref.declenchement, ref.etat, ref.alerte], `ligne ${i + 2}`);
  });
});

test('échéances et états identiques à la feuille Calcul_Maintenance', () => {
  res.equipements.forEach((e, i) => {
    const ref = vba.calcul[i];
    assert.deepEqual([e.id, e.etat, iso(e.dateTheo), e.echeances.map(iso), e.retard], [ref.id, ref.etat, ref.prochaineDate, ref.echeances, ref.retard]);
  });
});

test('conflits identiques à la feuille Conflits', () => {
  assert.equal(res.alertes.length, vba.conflits.length);
  res.alertes.forEach((a, i) => {
    const ref = vba.conflits[i];
    const quand = typeof a.quand === 'number' ? iso(a.quand) : a.quand;
    assert.deepEqual([quand, a.equipements, a.technicien, normaliser(a.type), a.resultat], [ref.quand, ref.equipements, ref.technicien, normaliser(ref.type), ref.resultat]);
  });
});

test('charge hebdomadaire identique à la feuille Durée', () => {
  assert.equal(res.semaines.length, vba.semaines.length);
  res.semaines.forEach((s, i) => {
    const ref = vba.semaines[i];
    assert.deepEqual([s.lib, s.nb, s.charge['Technicien 1'], s.charge['Technicien 2'], s.conflit ? 'CONFLIT' : 'OK'], [ref.semaine, ref.nb, ref.t1, ref.t2, ref.resultat]);
  });
});

test('cas limites du calendrier', () => {
  const D = O.depuisYMD;
  assert.equal(O.fmt(M.prochaineDate(D(2028, 2, 29), 12, 'Mois', 1)), '28/02/2029');   // année bissextile
  assert.equal(O.fmt(M.prochaineDate(D(2028, 2, 29), 1, 'An', 4)), '29/02/2032');
  assert.equal(O.fmt(M.prochaineDate(D(2026, 12, 31), 2, 'Jour', 1)), '02/01/2027');
  assert.equal(O.isoSemaine(D(2027, 1, 4)), 1);
  assert.equal(O.isoSemaine(D(2026, 12, 28)), 53);
  assert.throws(() => M.prochaineDate(D(2026, 1, 1), 1, 'Décennie', 1));
  assert.equal(O.fmt(M.prochaineDate(D(2026, 1, 1), 2, 'semaines', 1)), '15/01/2026');
  assert.equal(O.fmt(M.prochaineDate(D(2026, 1, 1), 1, 'Année', 1)), '01/01/2027');
});

test('un équipement mal saisi est signalé « À définir » sans bloquer le calcul', () => {
  const r = M.calculer({ parametres: { dateReference: '2026-10-16' }, equipements: [
    { id: 'X1', nom: 'Sans type', periode: 3, unite: 'Mois', derniereIntervention: '2026-01-01' },
    { id: 'X2', nom: 'Unité inconnue', type: 'Temporelle', periode: 3, unite: 'Siècle', derniereIntervention: '2026-01-01' },
    { id: 'X3', nom: 'Compteur incohérent', type: 'Usage', periode: 500, unite: 'h', compteurActuel: 100, dernierCompteur: 900 },
    { id: 'X4', nom: 'Correct', type: 'Temporelle', periode: 1, unite: 'Mois', derniereIntervention: '2026-10-01', duree: 1, technicien: 'T' }
  ] });
  assert.deepEqual(r.equipements.map(e => e.etat), ['À définir', 'À définir', 'À définir', 'Planifiée']);
  assert.equal(r.alertes.filter(a => a.type === 'Saisie incomplète').length, 3);
  assert.ok(r.interventions.length > 0);
});

test('retards : rattrapage immédiat puis échéances recalculées depuis aujourd’hui', () => {
  const r = M.calculer({ parametres: { dateReference: '2026-10-16' }, equipements: [
    { id: 'R1', nom: 'Oublié', type: 'Temporelle', periode: 3, unite: 'Mois', derniereIntervention: '2026-01-01', duree: 1, technicien: 'T' },
    { id: 'R2', nom: 'Compteur dépassé', type: 'Usage', periode: 500, unite: 'h', derniereIntervention: '2026-09-16', dernierCompteur: 1000, compteurActuel: 2100, duree: 1, technicien: 'T' }
  ] });
  assert.equal(r.equipements[0].etat, 'Retard critique');
  assert.equal(r.equipements[1].etat, 'Retard critique');            // cible 1500 h dépassée de 600 h (> 1 période)
  const premiers = r.interventions.filter(it => it.numero === 1).map(it => O.fmt(it.date));
  assert.deepEqual(premiers, ['16/10/2026', '16/10/2026']);
  const r1 = r.interventions.filter(it => r.equipements[it.idx].id === 'R1').map(it => O.fmt(it.date));
  assert.equal(r1[1], '16/01/2027');
});
