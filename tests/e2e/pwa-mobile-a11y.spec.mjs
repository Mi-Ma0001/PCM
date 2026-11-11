// PWA (installation, hors ligne), affichage mobile et accessibilité
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ouvrir, aller } from './outils.mjs';

const VUES = ['tableau', 'equipements', 'calcul', 'planning', 'charge', 'conflits', 'gantt', 'tests', 'parametres'];

test.describe('PWA', () => {
  test('manifest complet et icônes disponibles', async ({ page, request }) => {
    await ouvrir(page);
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const m = await (await request.get('/' + href)).json();
    expect(m.name).toBe('Plan de maintenance CMS');
    expect(m.display).toBe('standalone');
    expect(m.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect((await request.get('/' + i.src)).status(), i.src).toBe(200);
  });

  test('le service worker s’installe et l’application fonctionne hors ligne', async ({ page, context }) => {
    await ouvrir(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                                   // la page est maintenant contrôlée
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.indic').first()).toBeVisible();
    await aller(page, 'gantt');
    await expect(page.locator('table.gantt')).toBeVisible();
    // l'indicateur hors ligne apparaît quand la connexion tombe en cours d'utilisation
    await context.setOffline(false); await page.reload(); await expect(page.locator('table.gantt')).toBeVisible();
    await context.setOffline(true);
    await expect(page.locator('#meta')).toContainText('Hors ligne');
    await context.setOffline(false);
  });
});

test.describe('Affichage', () => {
  test('aucun défilement horizontal de la page, sur chaque onglet', async ({ page }) => {
    await ouvrir(page);
    for (const v of VUES) {
      await aller(page, v);
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord, `débordement sur ${v}`).toBeLessThanOrEqual(0);
    }
  });

  test('zones tactiles d’au moins 44 px sur mobile', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-android', 'Spécifique au tactile');
    await ouvrir(page, 'equipements');
    const tailles = await page.locator('#vue button.btn').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
    expect(tailles.length).toBeGreaterThan(10);
    for (const h of tailles) expect(h).toBeGreaterThanOrEqual(44);
  });

  test('thème sombre appliqué selon le réglage du système', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await ouvrir(page);
    const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fond).toBe('rgb(14, 20, 18)');
  });
});

test.describe('Accessibilité (axe)', () => {
  for (const schema of ['light', 'dark']) {
    test(`aucune violation grave ou critique — thème ${schema === 'light' ? 'clair' : 'sombre'}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: schema });
      await ouvrir(page);
      for (const v of VUES) {
        await aller(page, v);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const graves = r.violations.filter(x => ['serious', 'critical'].includes(x.impact));
        expect(graves.map(x => `${v} : ${x.id} (${x.nodes.length}) ${x.nodes[0]?.target}`)).toEqual([]);
      }
    });
  }
});
