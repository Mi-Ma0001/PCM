# Rapport d'audit — Plan de maintenance CMS (version web 1.0)

Date de l'audit : 10/11/2026. Version auditée : `Plan_Maintenance_CMS_web.zip` (6 fichiers, application statique).

## 1. Ce qui existe

| Fichier | Rôle | Taille |
|---|---|---|
| `index.html` | Page, en-tête, navigation | 17 lignes de contenu |
| `style.css` | Thèmes clair et sombre, mise en page responsive | 258 lignes |
| `moteur.js` | Moteur de calcul, traduction du module VBA `PlanMaintenance` | 341 lignes |
| `app.js` | Interface : 9 onglets, formulaires, graphiques, exports | 472 lignes |
| `data.json` | 15 équipements, 15 gammes, 6 paramètres | 361 lignes |

**Fonctions présentes et opérationnelles :**
- tableau de bord : indicateurs, priorités, 30 prochains jours, graphique hebdomadaire ;
- équipements : ajout, modification et suppression, avec validation ;
- calcul : 4 échéances, usage et compteur cible ;
- planning : filtres et export CSV ;
- charge hebdomadaire par technicien ;
- conflits ;
- Gantt ;
- 19 tests du moteur ;
- paramètres : import et export JSON, retour aux données d'origine.

**Point fort :** le moteur reproduit exactement les résultats de la macro VBA, ce qui a été vérifié ligne par ligne sur le planning, les échéances, la charge et les conflits.

## 2. Problèmes constatés

### Bloquants pour l'objectif « produit installable, Android + web »

| # | Problème | Effet |
|---|---|---|
| B1 | Pas de manifest ni de service worker | Ni installable (PWA), ni utilisable hors ligne |
| B2 | Polices chargées depuis Google Fonts | Dépendance réseau au démarrage, lenteur sur mobile, appel à un tiers |
| B3 | Aucun projet Android | Pas d'APK possible |
| B4 | Export par lien `<a download>` | Ne fonctionne pas dans la WebView Android : il faut le partage natif |
| B5 | Pas de dépôt structuré : ni `package.json`, ni README, ni licence, ni `.gitignore` | Impossible à publier proprement sur GitHub |
| B6 | Pas de configuration de déploiement : ni `vercel.json`, ni page 404, ni en-têtes de sécurité | Déploiement Vercel non maîtrisé |

### Fiabilité des données

| # | Problème | Effet |
|---|---|---|
| D1 | Une erreur d'écriture dans `localStorage` (stockage plein ou bloqué) est ignorée en silence | L'utilisateur croit avoir enregistré, alors que ce n'est pas le cas |
| D2 | Les données n'ont pas de numéro de version de format | Pas de migration possible lors d'une évolution |
| D3 | L'import JSON vérifie seulement la présence de la liste `equipements` | Un fichier mal formé (ID en double, types faux) est accepté |
| D4 | Import, suppression et restauration n'ont pas d'annulation | Une erreur de manipulation fait perdre des données |
| D5 | Les données sont dupliquées : `data.json` et une copie insérée dans `app.js` par le script de construction | Risque de divergence |
| D6 | Pas de synchronisation entre appareils | Le PC et le téléphone ont des données différentes |

### Interface et accessibilité

| # | Problème |
|---|---|
| U1 | Pas de notifications (toasts) : les messages restent affichés jusqu'au changement d'onglet |
| U2 | Pas d'indicateur hors ligne ni d'indicateur d'enregistrement |
| U3 | Certaines zones de clic font moins de 44 px sur mobile (boutons-liens « Modifier » et « Supprimer ») |
| U4 | Les infobulles des graphiques et du Gantt n'apparaissent qu'au survol, alors que le détail existe aussi dans les tableaux |
| U5 | Les gammes (opérations de maintenance) ne sont pas modifiables dans l'interface |
| U6 | La date de référence est calculée une seule fois : une page laissée ouverte après minuit garde la date de la veille |

### Qualité et tests

| # | Problème |
|---|---|
| Q1 | Les 19 tests ne tournent que dans l'interface : pas de tests automatiques dans le dépôt, pas d'intégration continue |
| Q2 | Pas de tests de bout en bout : boutons, formulaires, persistance, mobile |
| Q3 | Pas de contrôle d'accessibilité automatique |

### Sécurité

| # | Constat |
|---|---|
| S1 | Les textes saisis passent par une fonction d'échappement HTML avant affichage. **Aucune faille d'injection constatée.** |
| S2 | Pas de politique de sécurité du contenu (CSP) ni d'en-têtes de sécurité |
| S3 | Pas de secret dans le code. Il n'y a d'ailleurs aucun serveur. |

## 3. Plan d'amélioration (appliqué dans la version 2.0)

1. **Structure du dépôt** : `web/` (source), `scripts/` (build, serveur, icônes), `tests/`, `android/`, `supabase/`, `vba/`, `docs/`. Un seul fichier de données, `web/data/data.json`. *(B5, D5)*
2. **Polices hébergées localement** (woff2, licence OFL). *(B2)*
3. **PWA** : manifest, icônes 192/512/masquable, service worker hors ligne avec mise à jour signalée. *(B1)*
4. **Android avec Capacitor 8** : même code web ; exports par partage natif (Filesystem et Share) ; icône et écran de démarrage ; compilation de l'APK par GitHub Actions. *(B3, B4)*
5. **Données** :
   - version de format et migration ;
   - validation complète à l'import ;
   - enregistrement vérifié, avec indicateur ;
   - annulation de la suppression, de l'import et de la restauration ;
   - date de référence recalculée chaque jour. *(D1–D4, U6)*
6. **Synchronisation Supabase optionnelle** : compte, table protégée par RLS, migration SQL, détection des conflits ; désactivée tant qu'aucune variable d'environnement n'est fournie. *(D6)*
7. **Interface** :
   - notifications ;
   - indicateur hors ligne ;
   - zones tactiles de 44 px ;
   - éditeur de gamme ;
   - focus clavier visible ;
   - page 404. *(U1–U5)*
8. **Déploiement** : `vercel.json` avec en-têtes de sécurité et CSP, mise en cache et service worker non mis en cache. *(B6, S2)*
9. **Tests** :
   - unitaires du moteur, comparés aux résultats VBA ;
   - de bout en bout avec Playwright, sur ordinateur et en vue mobile ;
   - accessibilité (axe) ;
   - synchronisation contre un serveur Supabase simulé ;
   - migration SQL sur PostgreSQL 16 ;
   - intégration continue sur GitHub. *(Q1–Q3)*
