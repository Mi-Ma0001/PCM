// Synchronisation optionnelle entre deux appareils, contre un serveur Supabase simulé
// (tests/e2e/supabase-simule.mjs). La configuration est injectée en remplaçant js/config.js.
import { test, expect } from '@playwright/test';
import { ouvrir, aller } from './outils.mjs';

const SIMULE = 'http://127.0.0.1:54399';
const CONFIG = `window.PMCMS_CONFIG = { supabaseUrl: '${SIMULE}', supabaseAnonKey: 'cle-test-anon', version: 'test' };`;

async function appareil(browser) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  return { ctx, page: await ctx.newPage() };
}
async function connecter(page, email, mode) {
  await aller(page, 'parametres');
  await page.locator('#c-email').fill(email);
  await page.locator('#c-mdp').fill('motdepasse-test');
  await page.getByRole('button', { name: mode === 'inscription' ? 'Créer un compte' : 'Se connecter' }).click();
}

test.describe('Synchronisation (Supabase simulé)', () => {
  test.skip(({ isMobile }) => isMobile, 'Scénario à deux appareils : exécuté une fois, sur ordinateur');
  test.beforeEach(async ({ request }) => { await request.post(SIMULE + '/__test/reinitialiser'); });

  test('sans configuration, l’application fonctionne sans compte', async ({ page }) => {
    await ouvrir(page, 'parametres');
    await expect(page.locator('#vue')).toContainText('La synchronisation n’est pas configurée');
  });

  test('compte, envoi, récupération sur un 2e appareil, puis conflit résolu', async ({ browser, request }) => {
    // Appareil A : création du compte, envoi des 15 équipements
    const A = await appareil(browser);
    await ouvrir(A.page, 'parametres');
    await connecter(A.page, 'technicien@exemple.tn', 'inscription');
    await expect(A.page.locator('.notif').last()).toContainText('Données envoyées en ligne');
    let plans = await (await request.get(SIMULE + '/__test/plans')).json();
    expect(plans).toHaveLength(1);
    expect(plans[0].donnees.equipements).toHaveLength(15);

    // Appareil A : suppression d'un équipement → envoi automatique
    await aller(A.page, 'equipements');
    await A.page.locator('tr', { hasText: 'EQ15' }).getByRole('button', { name: 'Supprimer' }).click();
    await A.page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect.poll(async () => (await (await request.get(SIMULE + '/__test/plans')).json())[0].donnees.equipements.length, { timeout: 10000 }).toBe(14);

    // Appareil B (données d'origine non modifiées) : connexion → conflit car B a ses propres données
    const B = await appareil(browser);
    await ouvrir(B.page, 'parametres');
    await connecter(B.page, 'technicien@exemple.tn', 'connexion');
    await expect(B.page.locator('.message.erreur')).toContainText('Conflit');
    await B.page.getByRole('button', { name: 'Garder la version en ligne' }).click();
    await aller(B.page, 'equipements');
    await expect(B.page.locator('table.donnees tbody tr')).toHaveCount(14);

    // Modification sur A pendant que B modifie aussi → conflit détecté sur B
    await aller(A.page, 'equipements');
    await A.page.locator('tr', { hasText: 'EQ14' }).getByRole('button', { name: 'Supprimer' }).click();
    await A.page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect.poll(async () => (await (await request.get(SIMULE + '/__test/plans')).json())[0].version, { timeout: 10000 }).toBe(3);
    await B.page.locator('tr', { hasText: 'EQ01' }).getByRole('button', { name: 'Supprimer' }).click();
    await B.page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(B.page.locator('#meta')).toContainText('Conflit', { timeout: 10000 });
    await aller(B.page, 'parametres');
    await B.page.getByRole('button', { name: 'Garder la version de cet appareil' }).click();
    await expect(B.page.locator('#vue')).toContainText('Version de cet appareil envoyée');
    plans = await (await request.get(SIMULE + '/__test/plans')).json();
    expect(plans[0].donnees.equipements.map(e => e.id)).not.toContain('EQ01');
    expect(plans[0].donnees.equipements).toHaveLength(13);

    // Déconnexion : les données restent sur l'appareil
    await B.page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(B.page.locator('#vue')).toContainText('Déconnecté');
    await aller(B.page, 'equipements');
    await expect(B.page.locator('table.donnees tbody tr')).toHaveCount(13);
    await A.ctx.close(); await B.ctx.close();
  });

  test('mauvais mot de passe et e-mail invalide : messages compréhensibles', async ({ browser }) => {
    const A = await appareil(browser);
    await ouvrir(A.page, 'parametres');
    await connecter(A.page, 'pas-un-email', 'connexion');
    await expect(A.page.locator('#f-compte .message')).toContainText('adresse e-mail valide');
    await connecter(A.page, 'inconnu@exemple.tn', 'connexion');
    await expect(A.page.locator('#f-compte .message')).toContainText('E-mail ou mot de passe incorrect');
    await A.ctx.close();
  });
});
