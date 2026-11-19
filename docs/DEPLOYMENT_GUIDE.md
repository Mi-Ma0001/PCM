# Guide de déploiement

Ce guide couvre quatre étapes : publier le code sur GitHub, mettre l'application en ligne avec Vercel, activer si besoin la synchronisation Supabase, et produire l'APK Android.

> Ces étapes demandent **vos** comptes GitHub, Vercel, Supabase et, pour Google Play, un compte développeur. Elles n'ont pas été effectuées pour vous. Les fichiers nécessaires sont prêts.

---

## 1. Publier sur GitHub

1. Créez un dépôt **vide** sur <https://github.com/new>, sans README ni licence : le projet les contient déjà.
2. Dans le dossier du projet, lancez les commandes suivantes, en remplaçant `VOTRE_DEPOT` par l'adresse de votre dépôt, par exemple `https://github.com/votre-nom/plan-maintenance-cms.git` :

```bash
git init
git add .
git commit -m "Initial production release"
git branch -M main
git remote add origin VOTRE_DEPOT
git push -u origin main
```

**Vérifications avant l'envoi :**
- `git status` ne doit lister ni `.env`, ni `node_modules/`, ni `dist/`, ni aucun fichier `*.jks`. Le fichier `.gitignore` les exclut.
- Aucun secret ne se trouve dans le code. La seule configuration possible est la clé **publique** Supabase, qui est injectée au moment du build.

Après l'envoi, l'onglet **Actions** lance deux workflows :
- **CI** : les tests unitaires, les tests de bout en bout et le test SQL ;
- **Android (APK)** : la compilation de l'APK.

---

## 2. Mettre en ligne avec Vercel

1. Connectez-vous sur <https://vercel.com> avec votre compte GitHub.
2. Cliquez sur **Add New… → Project**, choisissez le dépôt, puis **Import**.
3. Ne modifiez pas les réglages de build : `vercel.json` fournit déjà les valeurs suivantes.

   | Réglage | Valeur |
   |---|---|
   | Framework | *Other* |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

4. *(Facultatif)* Dans **Environment Variables**, ajoutez `SUPABASE_URL` et `SUPABASE_ANON_KEY` (voir la partie 3).
5. Cliquez sur **Deploy**. Vercel affiche l'adresse publique, par exemple `https://plan-maintenance-cms.vercel.app`.

**Déploiement automatique** : chaque `git push` sur `main` redéploie l'application. Chaque *pull request* reçoit sa propre adresse de prévisualisation.

**Domaine personnalisé** : dans **Settings → Domains**, ajoutez votre domaine et suivez les instructions DNS de Vercel. Le HTTPS est automatique.

**Ce que fait `vercel.json` :**
- il applique les en-têtes de sécurité : CSP, `X-Frame-Options`, `nosniff`, HSTS, `Permissions-Policy` ;
- il interdit la mise en cache de `sw.js`, pour que les mises à jour arrivent ;
- il met en cache longue durée les polices et les icônes ;
- il sert la page `404.html` pour les adresses inconnues.

**Vérification après déploiement :**
1. L'adresse publique affiche le tableau de bord.
2. L'onglet **Tests** affiche **19 / 19**.
3. Dans Chrome, **F12 → Application → Manifest** ne signale aucune erreur, et la section *Service workers* indique « activated ».
4. Une adresse au hasard, par exemple `/abc`, affiche la page 404.

---

## 3. Synchronisation entre appareils (optionnelle)

Sans cette étape, l'application fonctionne entièrement sur l'appareil, sans compte. Cette étape ajoute un compte (e-mail et mot de passe) et le même plan sur le PC et le téléphone.

1. Créez un projet gratuit sur <https://supabase.com>.
2. Ouvrez **SQL Editor**, collez le contenu de `supabase/migrations/20261110000000_plans.sql`, puis cliquez sur **Run**. Avec la CLI Supabase, l'équivalent est `supabase db push`.
3. Ouvrez **Project Settings → API**. Copiez :
   - **Project URL**, qui devient `SUPABASE_URL` ;
   - la clé **anon / publishable**, qui devient `SUPABASE_ANON_KEY`.

   ⚠ Ne copiez **jamais** la clé `service_role` ni une clé `sb_secret_…`. Le build les refuse de toute façon.
4. Ouvrez **Authentication → URL Configuration**. Mettez l'adresse Vercel dans *Site URL*.
5. Ouvrez **Authentication → Providers → Email** :
   - laissez *Confirm email* activé pour exiger la confirmation de l'adresse ;
   - ou désactivez-le pour un usage interne simple.
6. Ajoutez les deux variables :
   - dans **Vercel**, puis redéployez ;
   - dans **GitHub → Settings → Secrets and variables → Actions → Variables**, pour l'APK.

**Sécurité :**
- La table `plans` est protégée par Row Level Security : chaque utilisateur ne lit et ne modifie que ses propres plans.
- La version d'un plan est gérée par la base, ce qui permet de détecter les modifications faites sur un autre appareil.
- Le test `npm run test:sql` vérifie ces règles sur un PostgreSQL local.

Si votre adresse Supabase n'est pas en `*.supabase.co` (domaine personnalisé), ajoutez-la dans la directive `connect-src` de `vercel.json`.

---

## 4. Application Android

### APK de test (le plus simple)

À chaque envoi sur `main`, le workflow **Android (APK)** compile `plan-maintenance-cms-N-debug.apk`. Pour le récupérer :
1. Ouvrez **GitHub → Actions → Android (APK)** et cliquez sur la dernière exécution.
2. En bas de la page, section **Artifacts**, téléchargez **plan-maintenance-cms-android** (fichier .zip contenant l'APK).
3. Installez l'APK sur le téléphone : voir [INSTALLATION.md](INSTALLATION.md).

### Version signée (publication, Google Play)

1. Créez une fois pour toutes une clé de signature, et **conservez-la précieusement**. Si elle est perdue, l'application ne pourra plus être mise à jour sur Google Play.

   ```bash
   keytool -genkey -v -keystore publication.jks -keyalg RSA -keysize 2048 -validity 10000 -alias planmaintenance
   ```

2. Dans **GitHub → Settings → Secrets and variables → Actions → Secrets**, ajoutez :

   | Secret | Valeur |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | le résultat de `base64 -w0 publication.jks` (Linux) ou de `certutil -encode` (Windows), sans les lignes d'en-tête |
   | `ANDROID_KEYSTORE_PASSWORD` | le mot de passe du keystore |
   | `ANDROID_KEY_ALIAS` | `planmaintenance` |
   | `ANDROID_KEY_PASSWORD` | le mot de passe de la clé |

3. Le workflow produit alors aussi :
   - `plan-maintenance-cms-N.apk`, la version signée ;
   - `plan-maintenance-cms-N.aab`, le format à déposer sur Google Play.
4. Pour publier une version, créez un tag :

   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

   Les fichiers sont joints automatiquement à une **Release** GitHub.
5. **Google Play** : dans la console développeur, créez l'application avec l'identifiant `tn.planmaintenance.cms`, déposez le `.aab`, puis remplissez la fiche (captures dans `docs/images/`), la politique de confidentialité et le questionnaire de contenu.

### Compiler sur votre ordinateur

Installez **Android Studio** (il inclut le SDK et le JDK 21), puis :

```bash
npm run android:sync      # build web + copie dans android/
npm run android:open      # ouvre Android Studio → Build → Build APK(s)
# ou en ligne de commande :
npm run android:apk       # → android/app/build/outputs/apk/debug/app-debug.apk
```

Pour une version signée en local, créez `android/keystore.properties`. Ce fichier n'est jamais commité.

```
storeFile=app/publication.jks
storePassword=…
keyAlias=planmaintenance
keyPassword=…
```

Placez ensuite `publication.jks` dans `android/app/` et lancez `cd android && ./gradlew assembleRelease bundleRelease`.
