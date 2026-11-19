// Fonctionnement de l'application : navigation, calcul, équipements, paramètres,
// import / export, persistance, annulation. Lancé sur ordinateur et sur mobile Android.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ouvrir, dateVBA, aller } from './outils.mjs';

test.describe('Application', () => {
  test('les 9 onglets s’ouvrent sans erreur et l’URL suit la navigation', async ({ page }) => {
    const erreurs = await ouvrir(page);
    const vues = ['equipements', 'calcul', 'planning', 'charge', 'conflits', 'gantt', 'tests', 'parametres', 'tableau'];
    for (const v of vues) {
      await aller(page, v);
      await expect(page.locator('#vue h2')).toBeVisible();
      await expect(page.locator(`#nav [data-vue="${v}"]`)).toHaveAttribute('aria-current', 'page');
    }
    await page.goBack();                                           // bouton retour : onglet précédent
    await expect(page).toHaveURL(/#parametres$/);
    await expect(page.locator('#vue h2')).toHaveText('Paramètres et données');
    expect(erreurs).toEqual([]);
  });

  test('au 16/10/2026, les résultats sont ceux de la macro VBA', async ({ page }) => {
    await ouvrir(page);
    await dateVBA(page);
    await aller(page, 'tableau');
    await expect(page.locator('.indic .val')).toHaveText(['88', '0', '2', '4', '12']);
    await aller(page, 'tests');
    await expect(page.locator('.entete-vue .indic .val')).toHaveText('19 / 19');
    await aller(page, 'planning');
    await expect(page.locator('.outils')).toContainText('88 interventions');
    await aller(page, 'gantt');
    await expect(page.locator('table.gantt tbody tr')).toHaveCount(15 + 4);   // 15 équipements + 4 lignes de synthèse
  });

  test('ajouter, modifier, supprimer un équipement (avec annulation) et retrouver les données après rechargement', async ({ page }) => {
    await ouvrir(page, 'equipements');
    await page.getByRole('button', { name: '+ Ajouter un équipement' }).click();
    // validation : nom obligatoire
    await page.locator('#f-nom').fill('');
    await page.locator('#f-eq button[type=submit]').click();
    await expect(page.locator('#f-eq .message.erreur')).toContainText('nom de l’équipement');
    // ajout d'un équipement suivi en heures, avec sa gamme
    await page.locator('#f-type').selectOption('Usage');
    await page.locator('#f-nom').fill('Four de séchage');
    await page.locator('#f-cd').fill('1000');
    await page.locator('#f-ca').fill('1350');
    await page.locator('#f-date').fill('2026-10-01');
    await page.locator('#f-gops').fill('Nettoyer les filtres, contrôler les résistances');
    await page.locator('#f-eq button[type=submit]').click();
    await expect(page.locator('.notif').last()).toContainText('EQ16 ajouté');
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(16);
    // l'opération de gamme apparaît dans le planning
    await aller(page, 'planning');
    await page.locator('#p-q').fill('EQ16');
    await expect(page.locator('table.donnees')).toContainText('Nettoyer les filtres');
    // modification
    await aller(page, 'equipements');
    await page.locator('tr', { hasText: 'Four de séchage' }).getByRole('button', { name: 'Modifier' }).click();
    await page.locator('#f-nom').fill('Four de séchage UV');
    await page.locator('#f-eq button[type=submit]').click();
    await expect(page.locator('table.donnees')).toContainText('Four de séchage UV');
    // persistance après rechargement
    await page.reload();
    await expect(page.locator('table.donnees')).toContainText('Four de séchage UV');
    // suppression avec confirmation puis annulation
    await page.locator('tr', { hasText: 'Four de séchage UV' }).getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(15);
    await page.locator('.notif').last().getByRole('button', { name: 'Annuler' }).click();
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(16);
  });

  test('un paramètre modifié recalcule le plan et peut être annulé', async ({ page }) => {
    await ouvrir(page);
    await dateVBA(page);
    await page.locator('#pa-nm').fill('4');
    await page.locator('#pa-nm').dispatchEvent('change');
    await aller(page, 'tableau');
    await expect(page.locator('.indic').nth(3).locator('.val')).toHaveText('0');      // plus aucune semaine > 4 interventions
    await aller(page, 'parametres');
    await page.locator('#pa-nm').fill('3');
    await page.locator('#pa-nm').dispatchEvent('change');
    await aller(page, 'tableau');
    await expect(page.locator('.indic').nth(3).locator('.val')).toHaveText('4');
  });

  test('export CSV du planning et export / import JSON', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-android', 'Téléchargement de fichier : testé sur ordinateur');
    await ouvrir(page);
    await dateVBA(page);
    await aller(page, 'planning');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter le planning (CSV)' }).click()]);
    const texteCsv = readFileSync(await csv.path(), 'utf8');
    expect(texteCsv.split('\r\n')).toHaveLength(89);                       // en-tête + 88 interventions
    expect(texteCsv).toContain('"Date prévue"');
    await aller(page, 'parametres');
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter les données (JSON)' }).click()]);
    const exporte = JSON.parse(readFileSync(await json.path(), 'utf8'));
    expect(exporte.equipements).toHaveLength(15);
    expect(exporte.formatVersion).toBe(2);
    // import d'un fichier modifié
    exporte.equipements = exporte.equipements.slice(0, 5);
    await page.locator('#imp-fichier').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exporte)) });
    await expect(page.locator('.notif').last()).toContainText('5 équipements importés');
    await expect(page.locator('#meta')).toContainText('Enregistré');
    // annulation de l'import
    await page.locator('.notif').last().getByRole('button', { name: 'Annuler' }).click();
    await aller(page, 'equipements');
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(15);
  });

  test('un JSON invalide ou incohérent est refusé avec un message clair', async ({ page }) => {
    await ouvrir(page, 'parametres');
    await page.locator('#imp-texte').fill('{ ceci n’est pas du JSON');
    await page.getByRole('button', { name: 'Charger le JSON collé' }).click();
    await expect(page.locator('.message.erreur')).toContainText('n’est pas un JSON valide');
    await page.locator('#imp-texte').fill(JSON.stringify({ equipements: [{ id: 'EQ01', type: 'Usage', periode: 5 }, { id: 'EQ01', type: 'Usage', periode: 5 }] }));
    await page.getByRole('button', { name: 'Charger le JSON collé' }).click();
    await expect(page.locator('.message.erreur')).toContainText('en double');
    await aller(page, 'equipements');
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(15);          // données intactes
  });

  test('retour aux données d’origine avec confirmation, puis copie de sécurité', async ({ page }) => {
    await ouvrir(page, 'equipements');
    await page.locator('tr', { hasText: 'EQ15' }).getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(14);
    await aller(page, 'parametres');
    await page.getByRole('button', { name: 'Revenir aux données d’origine' }).click();
    await page.getByRole('button', { name: 'Oui, revenir aux données d’origine' }).click();
    await expect(page.locator('.notif').last()).toContainText('Données d’origine restaurées');
    await page.getByRole('button', { name: /Restaurer la copie de sécurité/ }).click();
    await aller(page, 'equipements');
    await expect(page.locator('table.donnees tbody tr')).toHaveCount(14);
  });

  test('page 404 pour une adresse inconnue', async ({ page }) => {
    const r = await page.goto('/cette-page-n-existe-pas');
    expect(r.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Cette page n’existe pas' })).toBeVisible();
    await page.getByRole('link', { name: 'Revenir à l’accueil' }).click();
    await expect(page.locator('#nav .onglet').first()).toBeVisible();
  });
});
