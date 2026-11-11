// Outils partagés par les tests de bout en bout
import { expect } from '@playwright/test';

export const DATE_VBA = '2026-10-16';

// Ouvre l'application et collecte les erreurs de console
export async function ouvrir(page, vue = 'tableau') {
  const erreurs = [];
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('/#' + vue);
  await expect(page.locator('#nav .onglet').first()).toBeVisible();
  return erreurs;
}

// Fixe la date de référence au 16/10/2026 pour retrouver les résultats de la macro VBA
export async function dateVBA(page) {
  await page.goto('/#parametres');
  await page.locator('#pa-dr').fill(DATE_VBA);
  await page.locator('#pa-dr').dispatchEvent('change');
  await expect(page.locator('.notif').last()).toContainText('Paramètre enregistré');
}

export async function aller(page, vue) {
  await page.locator(`#nav [data-vue="${vue}"]`).click();
  await expect(page).toHaveURL(new RegExp('#' + vue + '$'));
}
