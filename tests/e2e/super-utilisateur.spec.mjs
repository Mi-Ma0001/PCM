// Super-utilisateur (nom de l'application, techniciens, code) et saisie d'un équipement
import { test, expect } from '@playwright/test';
import { ouvrir, aller } from './outils.mjs';

test.describe('Super-utilisateur', () => {
  test('création du code, nom de l’application, ajout et retrait de techniciens', async ({ page }) => {
    const erreurs = await ouvrir(page, 'parametres');
    await expect(page.locator('#nom-app')).toHaveText('OptiMaint CMS');
    await expect(page).toHaveTitle('OptiMaint CMS');

    // code trop court puis codes différents : refusés
    await page.locator('#ad-code').fill('12'); await page.locator('#ad-code2').fill('12');
    await page.getByRole('button', { name: /Créer le code/ }).click();
    await expect(page.locator('#admin .message')).toContainText('4 caractères');
    await page.locator('#ad-code').fill('1234'); await page.locator('#ad-code2').fill('1235');
    await page.getByRole('button', { name: /Créer le code/ }).click();
    await expect(page.locator('#admin .message')).toContainText('pas identiques');
    await page.locator('#ad-code').fill('1234'); await page.locator('#ad-code2').fill('1234');
    await page.getByRole('button', { name: /Créer le code/ }).click();

    // nom + 3e technicien + renommage du premier
    await page.locator('#ad-nom').fill('OptiMaint CMS Sfax');
    await page.getByRole('button', { name: '+ Ajouter un technicien' }).click();
    await page.locator('#ad-t2').fill('Ahmed');
    await page.locator('#ad-t0').fill('Mahdi');
    await page.locator('#f-admin').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#nom-app')).toHaveText('OptiMaint CMS Sfax');
    await expect(page).toHaveTitle('OptiMaint CMS Sfax');

    // le nouveau technicien apparaît dans la charge, l'ancien nom a disparu
    await aller(page, 'charge');
    await expect(page.locator('.panneau h3').filter({ hasText: 'Ahmed' })).toBeVisible();
    await expect(page.locator('.panneau h3').filter({ hasText: 'Technicien 1' })).toHaveCount(0);

    // verrouillage, mauvais code, bon code ; retrait d'un technicien avec réaffectation
    await aller(page, 'parametres');
    await page.getByRole('button', { name: /Verrouiller/ }).click();
    await page.locator('#ad-code').fill('0000'); await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await expect(page.locator('#admin .message')).toHaveText('Code incorrect.');
    await page.locator('#ad-code').fill('1234'); await page.getByRole('button', { name: 'Déverrouiller' }).click();
    await page.getByRole('button', { name: 'Retirer le technicien 2' }).click();
    await page.locator('#ad-reaff').selectOption('Ahmed');
    await page.locator('#f-admin').getByRole('button', { name: 'Enregistrer' }).click();
    await aller(page, 'equipements');
    await expect(page.locator('table.donnees tbody')).not.toContainText('Technicien 2');

    // tout est conservé après rechargement, et l'espace est de nouveau verrouillé
    await page.reload();
    await expect(page.locator('#nom-app')).toHaveText('OptiMaint CMS Sfax');
    await aller(page, 'parametres');
    await expect(page.getByRole('button', { name: 'Déverrouiller' })).toBeVisible();
    expect(erreurs).toEqual([]);
  });

  test('ajout d’un équipement : virgule acceptée, champ en erreur signalé, ligne ajoutée mise en évidence', async ({ page }) => {
    const erreurs = await ouvrir(page, 'equipements');
    await page.getByRole('button', { name: '+ Ajouter un équipement' }).click();
    await page.locator('#f-nom').fill('Four de refusion test');
    await page.locator('#f-periode').fill('trois');
    await page.locator('#f-duree').fill('1,5');
    await page.locator('#f-eq').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('#err-eq')).toContainText('périodicité');
    await expect(page.locator('#f-periode')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#f-periode')).toBeFocused();
    await expect(page.locator('#f-nom')).toHaveValue('Four de refusion test');       // la saisie n'est pas perdue
    await page.locator('#f-periode').fill('2');
    await page.locator('#f-eq').getByRole('button', { name: 'Enregistrer' }).click();
    const ligne = page.locator('tr.nouveau');
    await expect(ligne).toContainText('Four de refusion test');
    await expect(ligne).toContainText('1,5 h');
    await expect(ligne).toBeInViewport();
    expect(erreurs).toEqual([]);
  });
});
