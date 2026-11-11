# Guide développeur

## Choix techniques

| Choix | Pourquoi |
|---|---|
| **HTML, CSS et JavaScript sans framework** | C'était la technologie de la version 1.0, et elle a été conservée. Le code n'a aucune dépendance au moment de l'exécution, se charge vite et reste lisible pour un étudiant qui connaît la VBA |
| **Un seul petit script de build** (`scripts/build.mjs`) | Il injecte la configuration publique et les données par défaut, et il versionne le service worker. Pas de bundler |
| **Capacitor 8** pour Android | Il réutilise exactement le code web (`dist/`) dans une WebView native, et donne accès au partage et aux fichiers natifs |
| **Supabase, optionnel**, via son API REST | Aucune bibliothèque cliente n'est nécessaire. La sécurité repose sur les règles RLS de la base. Sans configuration, l'application est 100 % locale |
| **node:test** et **Playwright + axe** | Tests unitaires sans dépendance, et tests réels dans Chromium en vue ordinateur et mobile Android |

## Architecture

```
web/index.html
 ├─ js/config.js           configuration publique (générée au build : URL et clé anon Supabase, version)
 ├─ js/donnees-defaut.js   données d'origine (générée au build depuis data/data.json)
 ├─ js/moteur.js           CALCUL — traduction fidèle du module VBA PlanMaintenance
 ├─ js/donnees.js          validation, migration de format, enregistrement local vérifié, copie de sécurité
 ├─ js/plateforme.js       navigateur ou Android : export, service worker, installation, réseau, bouton retour
 ├─ js/sync.js             Supabase : compte, lecture et écriture conditionnelle (version), conflits
 └─ js/app.js              interface : 9 vues, formulaires, notifications, navigation par #ancre
web/sw.js                  service worker (cache des fichiers, hors ligne, mise à jour sur demande)
```

**Flux :**
1. Les données (`localStorage`, clé `pmcms:donnees`) passent par `Moteur.calculer()`, qui produit le résultat.
2. L'interface affiche le résultat dans la vue courante.
3. Chaque modification passe par `modifier()` dans `app.js`. Cette fonction enregistre les données, recalcule, notifie l'utilisateur, propose l'annulation et lance la synchronisation si elle est activée.

**Format des données** (`web/data/data.json`, `formatVersion: 2`) :

```json
{
  "formatVersion": 2,
  "parametres": { "capaciteHebdo": 8, "alerteCompteur": 100, "horizonMois": 12, "nbDatesFutures": 4,
                  "seuilRetardJours": 0, "nbMaxInterventionsSemaine": 3, "dateReference": null },
  "equipements": [ { "id": "EQ01", "nom": "…", "type": "Temporelle", "periode": 3, "unite": "Mois",
                     "derniereIntervention": "2026-09-05", "compteurActuel": null, "dernierCompteur": null,
                     "criticite": "Haute", "duree": 2, "technicien": "Technicien 1", "usageJour": null } ],
  "gammes": [ { "code": "G01", "equipement": "EQ01", "operations": "…", "frequence": "…", "duree": 2, "ressources": "…" } ]
}
```

Si le format évolue, augmentez `FORMAT` dans `donnees.js` et ajoutez l'étape correspondante dans `migrer()`.

## Règle d'or : le moteur reste identique à la VBA

`tests/fixtures/resultats-vba.json` contient les résultats produits par la macro VBA du classeur (`vba/Plan_maintenance_VBA.xlsm`) au 16/10/2026. `tests/unit/moteur.test.mjs` compare le moteur JavaScript à ces résultats **ligne par ligne** :
- 88 interventions ;
- 15 équipements ;
- 18 contrôles ;
- 53 semaines.

Toute modification de `moteur.js` doit garder ce test au vert.

Seul écart volontaire avec la VBA : l'unité est reconnue par le mot entier. La VBA ne regardait que la première lettre, si bien que « Siècle » devenait « Semaine ». Cet écart ne change rien pour les données valides.

## Commandes

| Commande | Effet |
|---|---|
| `npm start` | Build, puis serveur local sur `http://localhost:4173`, avec les en-têtes de `vercel.json`, CSP comprise |
| `npm test` | Tests unitaires, puis de bout en bout |
| `npm run test:unit` | Moteur comparé à la VBA, validation des données, build |
| `npm run test:e2e` | Playwright, projets `ordinateur` et `mobile-android` |
| `npm run test:sql` | Migration Supabase sur un PostgreSQL local jetable (RLS) |
| `npm run icons` | Régénère les icônes depuis le dessin SVG de `scripts/icons.mjs` |
| `npm run fonts` | Recopie les polices depuis `@fontsource` |
| `node scripts/captures.mjs` | Régénère les captures de la documentation |
| `npm run android:sync` | Build, puis copie dans `android/` |
| `npm run android:open` | Ouvre le projet dans Android Studio |

## Ajouter une fonction : la démarche

1. **Calcul** : ajoutez-le dans `moteur.js`, avec un test dans `tests/unit/`.
2. **Interface** : ajoutez une vue dans `app.js`. Ajoutez une entrée au tableau `VUES` et une fonction `vueXxx()` qui renvoie le HTML. Échappez toujours les textes saisis avec `esc()`.
3. **Modification de données** : passez toujours par `modifier(fn, { message })`, qui enregistre, recalcule, propose l'annulation et synchronise.
4. **Test de bout en bout** : ajoutez-le dans `tests/e2e/`.
5. **Documentation** : mettez à jour `docs/USER_GUIDE.md` et `CHANGELOG.md`.

## Android

- Le projet est dans `android/`. Il est généré par Capacitor puis personnalisé :
  - signature dans `app/build.gradle` ;
  - icônes et écran de démarrage dans `res/` ;
  - `keystore.properties` ignoré par git.
- L'identifiant est `tn.planmaintenance.cms`. Pour le changer, modifiez `capacitor.config.json` et `android/app/build.gradle`, puis déplacez `MainActivity.java`.
- Modules natifs : `@capacitor/app` (bouton retour), `filesystem` et `share` (exports), `splash-screen`, `status-bar`.
- **Prérequis pour compiler en local** : Android Studio, avec le JDK 21 et le SDK 36. La CI GitHub compile l'APK sans rien installer chez vous.
- Après chaque modification du code web, lancez `npm run android:sync`.

## Sécurité

Voir [../SECURITY.md](../SECURITY.md). Points d'attention pour le code :
- n'utilisez pas de `innerHTML` avec des données non échappées ;
- n'ajoutez aucun script en ligne, car la CSP l'interdit ;
- ne mettez aucune clé secrète dans `web/` ni dans les variables d'environnement du build.
