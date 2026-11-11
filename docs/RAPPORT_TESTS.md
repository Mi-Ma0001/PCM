# Rapport de tests — version 2.0.0

Tests exécutés le 10/11/2026 dans l'environnement de développement (Linux, Node.js 22, Chromium 141 via Playwright 1.56, PostgreSQL 16). Ils ont été relancés depuis une **copie neuve du dépôt** (`npm ci`), comme sur un nouvel ordinateur.

## Résultats

| Suite | Commande | Résultat |
|---|---|---|
| Tests unitaires | `npm run test:unit` | **15 / 15 réussis** |
| Tests de bout en bout (ordinateur et mobile Android émulé) | `npm run test:e2e` | **31 réussis**, 5 ignorés volontairement, 0 échec |
| Migration SQL et Row Level Security | `npm run test:sql` | **Réussi** |
| Build de production | `npm run build` | Réussi : 38 fichiers mis en cache. Les clés secrètes sont refusées (testé) |
| Projet Android | `npm run android:sync` | Réussi : 6 modules natifs détectés, fichiers web copiés |

### Ce que couvrent les tests unitaires
- **Moteur comparé à la macro VBA**, ligne par ligne, au 16/10/2026 :
  - 88 interventions ;
  - 15 équipements, avec leurs 4 échéances et leur état ;
  - 18 contrôles de conflits ;
  - 53 semaines de charge.
- Les 19 tests intégrés du moteur, équivalents de `TesterMoteur`.
- Cas limites :
  - année bissextile ;
  - semaine ISO 53 ;
  - unités inconnues ;
  - retards et retards critiques, temporels et à l'usage ;
  - équipements mal saisis.
- Validation des fichiers importés : JSON invalide, ID en double, types et dates incorrects, migration du format 1.
- Build : les fichiers sont générés, et les clés `service_role` et `sb_secret_` sont refusées.

### Ce que couvrent les tests de bout en bout
Tous les tests tournent avec les **en-têtes de sécurité de production** de `vercel.json`, CSP comprise, appliqués par le serveur local.

- **Navigation** : les 9 onglets, l'URL par ancre, le bouton retour, aucune erreur dans la console.
- **Résultats identiques à la VBA** dans l'interface : 88, 0, 2, 4 et 12, les tests à 19 / 19, le Gantt complet.
- **Équipements** :
  - validation des saisies ;
  - ajout d'une machine à l'usage avec sa gamme, visible dans le planning ;
  - modification ;
  - persistance après rechargement ;
  - suppression avec confirmation, puis annulation.
- **Paramètres** : recalcul immédiat, retour à l'état précédent.
- **Exports et imports** :
  - export CSV : 89 lignes, en-tête compris ;
  - export JSON ;
  - import de fichier, puis annulation ;
  - JSON invalide et ID en double refusés avec un message.
- **Données d'origine** : retour avec confirmation, restauration de la copie de sécurité.
- **Page 404.**
- **PWA** :
  - manifest complet et icônes disponibles ;
  - service worker installé ;
  - **fonctionnement hors ligne** après rechargement ;
  - indicateur « Hors ligne ».
- **Affichage** :
  - aucun défilement horizontal sur les 9 onglets, en vue ordinateur et en vue mobile ;
  - cibles tactiles d'au moins 44 px sur mobile ;
  - thème sombre.
- **Accessibilité (axe, WCAG 2.1 AA)** : aucune violation grave ni critique sur les 9 onglets, en thème clair et en thème sombre.
- **Synchronisation**, contre un serveur Supabase simulé :
  - création de compte et envoi des données ;
  - envoi automatique après une modification ;
  - deuxième appareil ;
  - détection d'un conflit et choix de la version ;
  - déconnexion sans perte de données ;
  - messages d'erreur (e-mail invalide, mauvais mot de passe).

**Tests ignorés volontairement (5) :**
- 3 tests de synchronisation et l'export de fichiers ne tournent qu'une fois, sur ordinateur, et pas une seconde fois en vue mobile ;
- le test des cibles tactiles ne concerne que la vue mobile.

### Ce que couvre le test SQL
Sur un vrai PostgreSQL 16, avec un environnement minimal qui imite Supabase :
- la table est créée, et rejouer la migration est sans effet ;
- c'est la base qui gère la version, le client ne peut pas la forcer ;
- un utilisateur B ne voit ni ne modifie le plan de l'utilisateur A ;
- B ne peut pas créer de plan au nom de A ;
- le rôle anonyme n'a aucun accès.

## Défauts trouvés et corrigés pendant les tests

1. **L'ajout d'un équipement ne s'enregistrait jamais.** Un champ nommé `id` masquait l'identifiant du formulaire. Ce bug existait déjà dans la version 1.0.
2. **Rechargement intempestif** de la page lors de la première installation du service worker.
3. **Unités inconnues interprétées par leur première lettre**, comportement hérité de la VBA.
4. **Contraste insuffisant**, selon WCAG AA, sur les textes secondaires et les cases du Gantt.
5. **Zones défilantes inaccessibles au clavier.**

## Ce qui n'a PAS pu être testé ici

| Élément | Raison | Ce qui est prêt |
|---|---|---|
| **Compilation de l'APK** et test sur un vrai téléphone Android | Les serveurs Google (SDK Android, Gradle Android) sont bloqués dans cet environnement : erreur 403 sur `dl.google.com` | Projet `android/` complet ; workflow `.github/workflows/android.yml` qui compile l'APK sur GitHub. L'interface a été testée en vue Android émulée dans Chromium |
| **Workflows GitHub Actions** | Pas d'accès à votre compte GitHub | Fichiers YAML validés syntaxiquement. Ils s'exécuteront au premier `git push` |
| **Déploiement Vercel réel** | Pas d'accès à votre compte Vercel | `vercel.json` ; ses en-têtes ont été testés en local avec l'application |
| **Projet Supabase réel** | Pas de projet Supabase | Migration testée sur PostgreSQL ; client testé contre un serveur simulé qui reproduit les mêmes API |
| **Firefox et Safari** | Seul Chromium est disponible ici | Code standard sans API propre à Chrome. Le bouton « Installer » n'apparaît que dans Chrome et Edge, comportement documenté |
| **iPhone / iPad** | Hors périmètre (web + Android) | Fonctionne dans Safari comme site web, non testé |
| **Fenêtre d'installation PWA** (`beforeinstallprompt`) | Le navigateur de test sans interface ne l'affiche pas | Le code est prêt ; le manifest et le service worker remplissent les critères d'installation |

## Performance

- Application complète : **472 Ko**, soit 362 Ko transférés en compression gzip.
- Premier affichage : environ **104 Ko** transférés.
- Aucune requête vers un service tiers au démarrage.
- Après la première visite, tout est servi depuis le cache, y compris hors ligne.
