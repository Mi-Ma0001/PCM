// Copie les polices (Fontsource, licence OFL) dans web/fonts et génère web/css/fonts.css.
// Usage : npm run fonts   (seulement si vous changez de police ou de graisse)
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const POLICES = [
  { paquet: 'barlow-condensed', graisses: [500, 600, 700] },
  { paquet: 'public-sans', graisses: [400, 500, 600, 700] },
  { paquet: 'ibm-plex-mono', graisses: [400, 500, 600] }
];
const SOUS_ENSEMBLES = ['latin', 'latin-ext'];
const racine = new URL('..', import.meta.url).pathname;
const dossierPolices = join(racine, 'web/fonts');
mkdirSync(dossierPolices, { recursive: true });

let css = '/* Généré par scripts/fonts.mjs — polices sous licence SIL Open Font License 1.1 */\n';
for (const { paquet, graisses } of POLICES) {
  const base = join(racine, 'node_modules/@fontsource', paquet);
  if (!existsSync(base)) throw new Error(`Paquet manquant : @fontsource/${paquet} (lancez npm install)`);
  for (const g of graisses) {
    const source = readFileSync(join(base, `${g}.css`), 'utf8');
    for (const bloc of source.split('/*').slice(1)) {
      const nom = /^\s*([\w-]+)\s*\*\//.exec(bloc)?.[1] || '';
      const sous = nom.replace(`${paquet}-`, '').replace(`-${g}-normal`, '');
      if (!SOUS_ENSEMBLES.includes(sous)) continue;
      let face = bloc.slice(bloc.indexOf('@font-face'));
      const fichier = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(face)[1];
      copyFileSync(join(base, 'files', fichier), join(dossierPolices, fichier));
      face = face.replace(/src:[^;]+;/, `src: url(../fonts/${fichier}) format('woff2');`);
      css += `/* ${paquet} ${g} ${sous} */\n${face.trim()}\n`;
    }
  }
}
writeFileSync(join(racine, 'web/css/fonts.css'), css);
writeFileSync(join(dossierPolices, 'LICENCE.txt'),
  'Barlow Condensed, Public Sans et IBM Plex Mono sont distribuées sous licence SIL Open Font License 1.1.\n' +
  'Fichiers issus des paquets npm @fontsource (https://fontsource.org).\n');
console.log('Polices copiées dans web/fonts');
