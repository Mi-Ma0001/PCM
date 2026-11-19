# Prompt adapté — Plan de maintenance CMS (Web + Android)

> Version corrigée et ciblée du prompt d'origine. Elle ne garde que ce qui concerne **le web et Android** (iOS, application de bureau et App Store sont retirés) et elle est rédigée pour **le projet réel** : l'application web « Plan de maintenance CMS », issue du classeur Excel/VBA du Sujet 2.

---

## Rôle

Agis comme une petite équipe professionnelle : architecte logiciel, développeur front-end, designer UI/UX mobile, développeur Android, ingénieur DevOps (GitHub, Vercel), ingénieur sécurité, testeur QA et rédacteur technique.

## Contexte du projet

- **Projet** : *Plan de maintenance CMS*, générateur de plan de maintenance préventive pour une ligne de production CMS (15 équipements, 2 techniciens).
- **Origine** : classeur Excel `Plan_maintenance_VBA.xlsm` et module VBA `PlanMaintenance` (Séances 5 et 6 du Sujet 2).
- **Version actuelle** : application web statique en HTML, CSS et JavaScript, sans framework :
  - `moteur.js` : le moteur de calcul, traduction exacte du VBA ;
  - `app.js` : l'interface ;
  - `data.json` : les données ;
  - `style.css` : la mise en forme.
- **Fonctions existantes à conserver** :
  - le tableau de bord ;
  - la gestion des équipements (ajout, modification, suppression) ;
  - le calcul des échéances : périodicité temporelle et d'usage ;
  - le planning sur 12 mois, avec filtres et export CSV ;
  - la charge hebdomadaire par technicien ;
  - les conflits et cas limites ;
  - le diagramme de Gantt ;
  - les 19 tests du moteur ;
  - les paramètres, avec import et export JSON.
- **Règle absolue** : les résultats du moteur doivent rester **identiques** à ceux de la macro VBA, soit 88 interventions, 4 semaines en conflit et 12 dates identiques au 16/10/2026. Toute modification du moteur doit être vérifiée par des tests automatiques.

## Mission

Transformer cette application en un produit **fonctionnel, stable, sécurisé et prêt à l'emploi**, utilisable :

1. dans un navigateur sur PC (Windows, macOS, Linux) ;
2. sur smartphone et tablette **Android** ;
3. installé comme application : **PWA** et **APK Android** ;
4. hors connexion, une fois installé ;
5. en ligne via **Vercel**, à partir d'un dépôt **GitHub**.

Travaille directement sur les fichiers du projet. Ne livre ni conseils seuls ni code d'exemple.

## Phase 1 — Audit

Analyse tous les fichiers. Dresse la liste :
- des fonctions existantes ;
- des bugs ;
- des manques : PWA, hors ligne, persistance, accessibilité, sécurité, structure du dépôt, déploiement.

Produis un rapport d'audit et un plan d'amélioration, puis exécute ce plan.

## Phase 2 — Amélioration de l'application web

- Garde la technologie actuelle : HTML, CSS et JavaScript, sans framework. Ajoute seulement un petit script de build pour Vercel.
- Organise les fichiers : `web/` (page, styles, scripts, données, icônes), `scripts/`, `tests/`, `docs/`.
- Héberge les polices localement : aucune dépendance réseau au démarrage.
- Ajoute des notifications (toasts), un indicateur de chargement, la gestion des états vides, des erreurs de données et de l'absence de réseau.
- Interface tactile : zones de clic d'au moins 44 px sur mobile, navigation au clavier, contraste suffisant, thème clair et sombre.
- Les données ne doivent jamais être perdues après une actualisation. Prévois une sauvegarde automatique, un export et un import JSON, avec validation.

## Phase 3 — Web multiplateforme

- Responsive de 360 px à 1920 px, sans défilement horizontal de la page.
- Compatible Chrome, Edge, Firefox et Safari récents.
- Liens directs vers chaque onglet (`/#planning`, etc.).
- Page 404, chargement rapide, mise en cache.

## Phase 4 — PWA et Android

**PWA** :
- `manifest.webmanifest`, avec nom, icônes 192/512 et masquable, couleur de thème et écran de démarrage ;
- service worker qui fonctionne hors ligne ;
- installation depuis le navigateur ;
- mise à jour signalée à l'utilisateur.

**Android, avec Capacitor (qui réutilise le même code web)** :
- projet `android/` prêt à compiler ;
- identifiant `tn.planmaintenance.cms` et nom « Plan maintenance CMS » ;
- icône et écran de démarrage ;
- aucune permission superflue.

**APK** :
- compile-le si l'environnement le permet ;
- sinon, fournis un workflow **GitHub Actions** qui produit l'APK téléchargeable à chaque envoi sur `main` ;
- explique la signature d'une version de publication (AAB pour Google Play).

**Ne prétends jamais avoir compilé un APK si ce n'est pas le cas.**

## Phase 5 — Données et synchronisation (optionnelle)

- **Par défaut** : l'application fonctionne **sans compte ni serveur**. Les données restent sur l'appareil, avec export et import JSON.
- **En option** : synchronisation entre appareils avec **Supabase**, à travers :
  - un compte (e-mail et mot de passe) ;
  - une table `plans` protégée par RLS, chaque utilisateur ne lisant que ses données ;
  - une migration SQL ;
  - une configuration par variables d'environnement (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- Aucune clé secrète (`service_role`) dans le front-end.
- Gère les erreurs de connexion et les conflits de version.

## Phase 6 — GitHub

Prépare un dépôt propre contenant :
- `README.md`, `LICENSE`, `.gitignore`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md` et `.env.example` ;
- la documentation dans `docs/` ;
- des workflows CI : tests, puis compilation de l'APK.

Vérifie qu'aucun secret n'est présent. Donne les commandes Git exactes, sans inventer l'URL du dépôt.

## Phase 7 — Vercel

Prépare :
- `vercel.json`, avec la commande de build, le dossier de sortie, les en-têtes de sécurité, le cache et le service worker ;
- une page 404 ;
- les variables d'environnement documentées ;
- la procédure : connexion GitHub, puis configuration, déploiement, vérification et déploiement automatique sur `main`.

## Phase 8 — Tests réels

- **Tests unitaires du moteur**, comparés aux résultats de la macro VBA.
- **Tests de bout en bout** avec Playwright, sur ordinateur et en vue mobile : chaque onglet, bouton et formulaire, l'import et l'export, la persistance après actualisation, le hors ligne et le service worker.
- **Accessibilité** avec axe, aucune erreur dans la console et build de production.
- Indique clairement ce qui a été testé, et ce qui n'a pas pu l'être : Safari, Firefox, un vrai téléphone Android ou Supabase réel.

## Phase 9 — Livrables

```
plan-maintenance-cms/
├── web/                 application (page, css, js, données, icônes, manifest, service worker)
├── android/             projet Android (Capacitor)
├── supabase/            migration SQL (synchronisation optionnelle)
├── vba/                 classeur Excel et module VBA d'origine
├── scripts/             build, icônes, serveur local
├── tests/               unitaires et E2E
├── docs/                USER_GUIDE (FR + EN), INSTALLATION, DEVELOPER_GUIDE, DEPLOYMENT_GUIDE, TROUBLESHOOTING
├── .github/workflows/   CI + build APK
├── package.json, capacitor.config.json, vercel.json
└── README.md, LICENSE, CHANGELOG.md, SECURITY.md, CONTRIBUTING.md, .env.example, .gitignore
```

Fournis aussi une **archive ZIP** du projet complet.

## Phase 10 — Guide d'utilisation (FR et EN)

Le guide couvre :
- la présentation ;
- l'utilisation dans le navigateur ;
- l'installation sur PC (PWA) et sur Android (PWA ou APK) ;
- chaque onglet ;
- les paramètres ;
- la sauvegarde et la restauration ;
- la synchronisation optionnelle ;
- les mises à jour ;
- les problèmes courants.

Illustre-le avec de vraies captures d'écran de l'application.

## Règles

1. Ne supprime aucune fonction sans justification.
2. Pas de simulation : chaque bouton fait réellement quelque chose.
3. Pas de faux résultats de tests ni de faux liens.
4. Pas de secrets dans le code.
5. Vérifie chaque étape avant de passer à la suivante.
6. Privilégie la simplicité, la stabilité et la maintenabilité.
7. Pour toute action externe (compte GitHub, Vercel, Supabase, clé de signature Android), fournis les fichiers et les instructions exactes, sans prétendre l'avoir faite.

## Rapport final attendu

Le rapport final présente :
- les fonctions terminées et améliorées ;
- les tests réussis et échoués ;
- les problèmes restants ;
- les technologies utilisées ;
- la structure du projet ;
- les procédures GitHub, Vercel et Android ;
- les fichiers livrés.
