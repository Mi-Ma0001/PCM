// Génère toutes les icônes (PWA, favicon, Android) à partir d'un dessin SVG unique.
// Usage : npm run icons   (nécessite @playwright/test et son navigateur Chromium)
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const racine = new URL('..', import.meta.url).pathname;
const VERT = '#0f3d2e', CUIVRE = '#d68c50', PASTILLE = '#e8a46e';

// Dessin : pistes de circuit imprimé (grille 44 × 44, centrée)
function motif(echelle, cx, cy) {
  const t = (x, y) => `${(cx + (x - 22) * echelle).toFixed(1)},${(cy + (y - 19.7) * echelle).toFixed(1)}`;
  const e = 2.3 * echelle, r = 2.7 * echelle;
  return `<g fill="none" stroke="${CUIVRE}" stroke-width="${e}" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="${t(10, 14)} ${t(20, 14)} ${t(25, 19)} ${t(34, 19)}"/>
    <polyline points="${t(10, 30)} ${t(16, 30)} ${t(19, 27)} ${t(34, 27)}"/>
    <polyline points="${t(22, 14)} ${t(22, 9)}"/></g>
    <g fill="${PASTILLE}">${[[10, 14], [10, 30], [34, 19], [34, 27]].map(([x, y]) => `<circle cx="${t(x, y).split(',')[0]}" cy="${t(x, y).split(',')[1]}" r="${r}"/>`).join('')}
    <circle cx="${t(22, 9).split(',')[0]}" cy="${t(22, 9).split(',')[1]}" r="${r * 0.8}"/></g>`;
}
const svg = (taille, { arrondi = 0, echelle, fond = true }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">` +
  (fond ? `<rect width="${taille}" height="${taille}" rx="${arrondi}" fill="${VERT}"/>` : '') +
  motif(echelle, taille / 2, taille / 2) + '</svg>';

const SORTIES = [
  // [fichier, taille, options]
  ['web/icons/icon-192.png', 192, { arrondi: 36, echelle: 4.2 }],
  ['web/icons/icon-512.png', 512, { arrondi: 96, echelle: 11.2 }],
  ['web/icons/maskable-512.png', 512, { echelle: 8.4 }],          // zone sûre : cercle de 80 %
  ['web/icons/apple-touch-icon.png', 180, { echelle: 3.6 }],
  ['web/icons/favicon-32.png', 32, { arrondi: 6, echelle: 0.75 }],
  ['assets/icon-only.png', 1024, { echelle: 17 }],
  ['assets/icon-foreground.png', 1024, { echelle: 13, fond: false }],
  ['assets/icon-background.png', 1024, { echelle: 0, fond: true, vide: true }],
  ['assets/splash.png', 2732, { echelle: 22 }],
  ['assets/splash-dark.png', 2732, { echelle: 22 }]
];

mkdirSync(join(racine, 'web/icons'), { recursive: true });
mkdirSync(join(racine, 'assets'), { recursive: true });
writeFileSync(join(racine, 'web/icons/favicon.svg'), svg(64, { arrondi: 12, echelle: 1.45 }));
const nav = await chromium.launch();
const page = await nav.newPage();
for (const [fichier, taille, opt] of SORTIES) {
  const contenu = opt.vide ? `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}"><rect width="100%" height="100%" fill="${VERT}"/></svg>` : svg(taille, opt);
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(`<html><body style="margin:0;background:transparent">${contenu}</body></html>`);
  await page.locator('svg').screenshot({ path: join(racine, fichier), omitBackground: true });
  console.log('✓', fichier);
}
await nav.close();
