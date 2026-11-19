# Guide de mise à jour

## Pour l'utilisateur

| Version | Comment elle se met à jour | Données |
|---|---|---|
| **Navigateur ou PWA** | Automatique. Le message « Nouvelle version disponible » apparaît : touchez **Mettre à jour** | Conservées |
| **APK** | Installez le nouvel APK par-dessus l'ancien, depuis GitHub Releases ou Actions | Conservées si l'APK est signé avec la **même clé** |
| **Google Play** | Automatique, par le Play Store | Conservées |

Par précaution, avant une mise à jour importante : **Paramètres → Exporter les données (JSON)**.

## Pour le mainteneur : publier une nouvelle version

1. Faites les modifications, puis vérifiez :

   ```bash
   npm test && npm run test:sql
   ```

2. Mettez à jour le numéro de version dans `package.json` (`"version": "2.1.0"`) et dans `android/app/build.gradle` (`versionName "2.1.0"`). Le `versionCode` Android augmente tout seul dans la CI : c'est le numéro d'exécution.
3. Décrivez les changements dans `CHANGELOG.md`.
4. Envoyez le code :

   ```bash
   git add .
   git commit -m "Version 2.1.0 : …"
   git push
   ```

   - Vercel redéploie automatiquement le web. Les utilisateurs voient alors « Nouvelle version disponible », car le service worker change de version à chaque build.
   - GitHub Actions recompile l'APK.
5. Pour une version Android officielle :

   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```

   L'APK et l'AAB signés sont joints à la Release GitHub. Déposez l'AAB sur Google Play.

**Changement du format des données :** si la structure du JSON change, augmentez `FORMAT` dans `web/js/donnees.js` et ajoutez une étape à `migrer()`. Les données des utilisateurs sont alors converties automatiquement au premier lancement, et un test doit le vérifier.

**Changement de la base Supabase :** ajoutez une **nouvelle** migration dans `supabase/migrations/`, avec un nom horodaté. Ne modifiez jamais une migration déjà appliquée. Testez-la avec `npm run test:sql`.

**Mise à jour des dépendances :**

```bash
npm outdated
npm install @capacitor/core@latest @capacitor/android@latest @capacitor/cli@latest   # même version pour les trois
npx cap sync android
npm test
```

Pour Playwright, gardez `@playwright/test` à la version de son navigateur, puis lancez `npx playwright install chromium`.
