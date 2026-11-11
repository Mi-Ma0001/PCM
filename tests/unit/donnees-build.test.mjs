// Tests de la validation des données et du script de build
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const D = require('../../web/js/donnees.js');
const racine = new URL('../..', import.meta.url).pathname;
const donnees = JSON.parse(readFileSync(new URL('../../web/data/data.json', import.meta.url), 'utf8'));

test('les données d’origine sont valides, sans avertissement', () => {
  const r = D.valider(donnees);
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.avert, []);
});

test('la validation refuse les fichiers dangereux pour le calcul', () => {
  assert.ok(D.valider(null).erreurs.length);
  assert.ok(D.valider([]).erreurs.length);
  assert.ok(D.valider({}).erreurs.some(e => e.includes('equipements')));
  const doublon = { equipements: [{ id: 'EQ01', type: 'Usage', periode: 5 }, { id: 'eq01', type: 'Usage', periode: 5 }] };
  assert.ok(D.valider(doublon).erreurs.some(e => e.includes('double')));
  assert.ok(D.valider({ equipements: [{ id: 'A', periode: 'trois' }] }).erreurs.some(e => e.includes('periode')));
  assert.ok(D.valider({ equipements: [{ id: 'A', derniereIntervention: '31/12/2026' }] }).erreurs.some(e => e.includes('date')));
  assert.ok(D.valider({ equipements: [], parametres: { horizonMois: 120 } }).erreurs.length);
});

test('les problèmes non bloquants sont des avertissements', () => {
  const r = D.valider({ equipements: [{ id: 'A', type: 'Annuelle', periode: 0, unite: 'Siècle' }] });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.avert.length, 3);
});

test('migration du format 1 (version web 1.0) vers le format 2', () => {
  const m = D.migrer({ equipements: [] });
  assert.equal(m.formatVersion, 2);
  assert.deepEqual(m.gammes, []);
  assert.deepEqual(m.parametres, {});
});

function build(env) {
  return spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: racine, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
}

test('le build produit dist/ avec données, configuration et service worker versionné', () => {
  const r = build({});
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['index.html', '404.html', 'manifest.webmanifest', 'sw.js', 'js/config.js', 'js/donnees-defaut.js', 'icons/icon-512.png'])
    assert.ok(existsSync(`${racine}dist/${f}`), f);
  const sw = readFileSync(`${racine}dist/sw.js`, 'utf8');
  assert.ok(!sw.includes('__VERSION__') && !sw.includes('__FICHIERS__'));
  assert.match(readFileSync(`${racine}dist/js/config.js`, 'utf8'), /"supabaseUrl":""/);
});

test('le build refuse une clé Supabase secrète', () => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'sig'].join('.');
  assert.notEqual(build({ SUPABASE_URL: 'https://exemple.supabase.co', SUPABASE_ANON_KEY: jwt }).status, 0);
  assert.notEqual(build({ SUPABASE_URL: 'https://exemple.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_abc' }).status, 0);
  assert.notEqual(build({ SUPABASE_URL: 'https://exemple.supabase.co' }).status, 0);
  assert.equal(build({}).status, 0);                       // remet un dist/ neutre
});
