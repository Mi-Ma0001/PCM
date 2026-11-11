# Installation

L'application s'utilise de trois façons. Toutes partagent le même code et donnent les mêmes résultats.

| Façon | Pour qui | Hors ligne |
|---|---|---|
| Dans le navigateur | Tout le monde : PC, Mac, Linux, Android | après la première visite |
| **PWA installée** (icône sur le bureau ou l'écran d'accueil) | PC, Mac, Linux, Android | oui |
| **APK Android** | téléphones et tablettes Android 7.0 ou plus récents | oui |

L'adresse en ligne est celle que Vercel vous donne après le déploiement (voir [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)), par exemple `https://plan-maintenance-cms.vercel.app`.

---

## Sur PC : Windows, macOS ou Linux

1. Ouvrez l'adresse de l'application dans **Chrome** ou **Edge**.
2. Cliquez sur le bouton **Installer l'application** dans l'en-tête vert, ou sur l'icône ⊕ à droite de la barre d'adresse.
3. Confirmez avec **Installer**. L'application s'ouvre dans sa propre fenêtre, et un raccourci est ajouté au menu Démarrer, au Launchpad ou au menu Applications.

Avec **Firefox** ou **Safari**, l'application fonctionne dans le navigateur. Safari sur macOS 14 ou plus récent propose aussi **Fichier → Ajouter au Dock**.

**Désinstaller :** ouvrez l'application, cliquez sur le menu ⋮ de sa fenêtre, puis sur **Désinstaller**.

---

## Sur Android

### Option A : PWA, sans téléchargement de fichier (recommandée)

1. Ouvrez l'adresse de l'application dans **Chrome**.
2. Touchez le menu **⋮**, puis **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
3. L'icône « Maintenance CMS » apparaît sur l'écran d'accueil.

Les mises à jour arrivent automatiquement : l'application affiche « Nouvelle version disponible ».

### Option B : APK

1. Récupérez le fichier `.apk` :
   - dans **GitHub → Actions → Android (APK)**, section **Artifacts** (fichier .zip à décompresser) ;
   - ou dans **Releases** pour une version publiée.
2. Copiez-le sur le téléphone, ou téléchargez-le directement depuis le téléphone.
3. Ouvrez le fichier. Android demande d'**autoriser l'installation d'applications inconnues** pour l'application utilisée (Fichiers ou Chrome) : acceptez pour cette fois.
4. Touchez **Installer**, puis **Ouvrir**.

> L'APK « debug » est destiné aux tests. Il n'est pas signé avec une clé de publication, et Play Protect peut afficher un avertissement. Pour une diffusion large, utilisez la version signée ou Google Play (voir [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).

**Autorisations demandées :**
- **Internet** uniquement, pour la synchronisation optionnelle.

Aucun accès à la caméra, aux contacts ni à la localisation n'est demandé.

---

## Sur iPhone et iPad

Il n'existe pas de version App Store : ce projet cible le web et Android. L'application fonctionne cependant dans **Safari**. Pour l'ajouter à l'écran d'accueil :
1. Touchez **Partager**.
2. Touchez **Sur l'écran d'accueil**.

---

## Pour les développeurs : lancer le projet

```bash
git clone VOTRE_DEPOT && cd plan-maintenance-cms
npm install
npm start          # → http://localhost:4173
```

Prérequis : Node.js 22. Pour Android, il faut en plus Android Studio : voir [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).
