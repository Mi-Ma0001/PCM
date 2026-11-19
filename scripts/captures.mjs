// Captures d'écran réelles pour la documentation : node scripts/captures.mjs (après npm run build)
import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
const racine = new URL('..', import.meta.url).pathname;
const serveur = spawn(process.execPath, ['scripts/serve.mjs', 'dist', '4174'], { cwd: racine, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const nav = await chromium.launch();
async function preparer(ctx) {
  const p = await ctx.newPage();
  await p.goto('http://localhost:4174/#parametres');
  await p.locator('#pa-dr').fill('2026-10-16'); await p.locator('#pa-dr').dispatchEvent('change');
  await p.waitForTimeout(300); await p.evaluate(() => document.querySelectorAll('.notif').forEach(n => n.remove()));
  return p;
}
const vues = async (p, liste, prefixe, pleine = false) => {
  for (const [v, nom, action] of liste) {
    await p.goto('http://localhost:4174/#' + v); await p.waitForTimeout(250);
    if (action) await action(p);
    await p.evaluate(() => document.querySelectorAll('.notif').forEach(n => n.remove()));
    await p.screenshot({ path: `${racine}docs/images/${prefixe}-${nom}.png`, fullPage: pleine });
  }
};
const bureau = await nav.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, locale: 'fr-FR' });
const pb = await preparer(bureau);
await vues(pb, [['tableau', 'tableau'], ['planning', 'planning'], ['charge', 'charge'], ['gantt', 'gantt'], ['conflits', 'conflits'], ['tests', 'tests'],
  ['equipements', 'equipement-formulaire', p => p.locator('[data-action="ajouter"]').click()], ['parametres', 'parametres']], 'bureau');
const mobile = await nav.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' });
const pm = await preparer(mobile);
await vues(pm, [['tableau', 'tableau'], ['planning', 'planning'], ['equipements', 'equipements'], ['parametres', 'parametres']], 'mobile');
const sombre = await nav.newContext({ ...devices['Pixel 7'], colorScheme: 'dark', locale: 'fr-FR' });
const ps = await preparer(sombre);
await vues(ps, [['gantt', 'gantt-sombre'], ['tableau', 'tableau-sombre']], 'mobile');
await nav.close(); serveur.kill();
console.log('Captures enregistrées dans docs/images/');
