# Dépannage

## Utilisation

| Ce que vous voyez | Cause probable | Solution |
|---|---|---|
| **« Non enregistré »** en rouge dans l'en-tête | Navigation privée, ou stockage du navigateur plein ou bloqué | Exportez immédiatement les données (Paramètres → Exporter). Utilisez une fenêtre normale ou autorisez le stockage pour le site |
| Les chiffres changent d'un jour à l'autre | La date de référence est « aujourd'hui » | C'est normal. Pour figer un jour, renseignez **Date de référence** dans Paramètres |
| Une machine est grise, **« À définir »** | Donnée manquante : date, compteur, type ou usage inconnu | Le détail est dans l'onglet Conflits (type « Saisie incomplète »). Corrigez la machine dans Équipements |
| Import refusé | Fichier non JSON, ID en double, date au mauvais format | La liste des problèmes s'affiche sous le bouton. Les dates doivent être au format `AAAA-MM-JJ` |
| Pas de bouton **Installer l'application** | Le navigateur ne le propose pas (Firefox, Safari), ou l'application est déjà installée | Chrome ou Edge : icône ⊕ de la barre d'adresse. Android : menu ⋮ → Installer. iPhone : Partager → Sur l'écran d'accueil |
| **« Nouvelle version disponible »** | Une mise à jour a été publiée | Touchez **Mettre à jour**. Les données sont conservées |
| La page reste sur l'ancienne version | Ancien cache du service worker | Rechargez deux fois. Sinon, Chrome : F12 → Application → Service workers → *Unregister*, puis rechargez |
| L'export ne télécharge rien (Android, APK) | Le partage a été annulé | Relancez l'export, puis choisissez **Fichiers** ou **Drive** dans la feuille de partage |
| Installation de l'APK bloquée | Sources inconnues non autorisées | Paramètres Android → Applications → *Fichiers* ou *Chrome* → **Installer des applis inconnues** → Autoriser |
| « Application non installée » lors d'une mise à jour de l'APK | Le nouvel APK n'est pas signé avec la même clé que l'ancien | Désinstallez l'ancienne version, après avoir **exporté vos données**, puis installez la nouvelle |

## Synchronisation

| Message | Solution |
|---|---|
| « La synchronisation n'est pas configurée » | `SUPABASE_URL` et `SUPABASE_ANON_KEY` ne sont pas définies. Voir DEPLOYMENT_GUIDE.md, partie 3 |
| « E-mail ou mot de passe incorrect » | Vérifiez la saisie, ou créez un compte |
| « Adresse e-mail non confirmée » | Ouvrez le lien reçu par e-mail (vérifiez les indésirables) |
| « Impossible de joindre le serveur » | Pas d'Internet, ou adresse Supabase bloquée. L'application continue hors ligne |
| « Session expirée » | Reconnectez-vous. Les données locales sont conservées |
| « Conflit » | Le plan a été modifié sur un autre appareil : choisissez la version à garder |

## Développement et déploiement

| Problème | Solution |
|---|---|
| `npm run build` : « Build refusé : … clé SECRÈTE » | Vous avez mis la clé `service_role` ou `sb_secret_…`. Utilisez la clé **anon / publishable** |
| `npm run test:e2e` : navigateur introuvable | Lancez `npx playwright install chromium` |
| `npm run test:sql` : « PostgreSQL introuvable » | Installez PostgreSQL : `sudo apt install postgresql` sous Ubuntu |
| Page blanche avec une erreur CSP dans la console, après ajout d'un script externe | `vercel.json` n'autorise que les fichiers du site. Ajoutez le domaine à la bonne directive |
| Synchro bloquée en production, erreur CSP `connect-src` | Votre Supabase utilise un domaine personnalisé : ajoutez-le à `connect-src` dans `vercel.json` |
| Gradle : `SDK location not found` | Ouvrez le projet une première fois dans Android Studio, ou créez `android/local.properties` avec `sdk.dir=…` |
| Gradle : JDK incompatible | Capacitor 8 demande le **JDK 21**, fourni avec Android Studio |
| Le workflow Android ne produit que l'APK debug | Normal sans les secrets de signature. Voir DEPLOYMENT_GUIDE.md, partie 4 |
