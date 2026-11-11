# Journal des modifications

## 2.0.0 — 10/11/2026

Version produit : web, PWA et Android.

### Ajouté
- **PWA installable** : manifest, icônes (dont la version masquable), service worker hors ligne, mise à jour proposée à l'utilisateur, bouton « Installer l'application ».
- **Application Android** (Capacitor 8) :
  - icône et écran de démarrage ;
  - export par partage natif ;
  - bouton retour ;
  - compilation de l'APK et de l'AAB par GitHub Actions, signature par secrets.
- **Synchronisation optionnelle** entre appareils (Supabase) :
  - compte par e-mail ;
  - table protégée par RLS ;
  - détection des conflits avec choix de la version à garder ;
  - reprise automatique au retour du réseau.
- Notifications, avec **annulation** de la suppression, de l'import et de la restauration.
- Copie de sécurité automatique avant chaque import ou restauration.
- Indicateurs « Enregistré HH:MM », « Hors ligne » et état de la synchronisation.
- Éditeur de **gamme** (opérations de maintenance) dans la fiche équipement.
- Validation complète des fichiers JSON importés, avec un rapport détaillé.
- Page 404, lien d'évitement, zones défilantes accessibles au clavier, cibles tactiles de 44 px.
- Polices hébergées localement : aucune dépendance réseau.
- Tests :
  - 15 tests unitaires, dont la comparaison ligne par ligne avec la macro VBA ;
  - 31 tests de bout en bout sur ordinateur et mobile, avec accessibilité axe ;
  - test SQL de la Row Level Security ;
  - intégration continue GitHub Actions.
- Configuration Vercel avec CSP et en-têtes de sécurité. Documentation complète, avec le guide utilisateur en français et en anglais.

### Corrigé
- **Ajout d'équipement impossible** : le formulaire contenait un champ nommé `id`, qui masquait l'identifiant du formulaire. Ce bug existait depuis la version 1.0.
- Rechargement intempestif de la page lors de la première installation du service worker.
- Unités de périodicité inconnues : elles étaient interprétées d'après leur première lettre, comme dans la VBA (« Siècle » devenait « Semaine »). Elles sont maintenant signalées « À définir ».
- Erreurs d'enregistrement ignorées en silence : elles sont maintenant signalées.
- La date du jour n'était pas mise à jour après minuit.
- Contraste insuffisant de certains textes secondaires et des cases du Gantt (WCAG AA).
- Android : partage de fichiers limité au cache de l’application (le modèle Capacitor exposait tout le stockage externe) ; tests Java déplacés dans le paquet `tn.planmaintenance.cms` (le test sur appareil attendait l’identifiant du modèle et échouait) ; `usesCleartextTraffic=false`.

### Modifié
- Arborescence du dépôt : `web/`, `scripts/`, `tests/`, `android/`, `supabase/`, `vba/`, `docs/`.
- Une seule source de données, `web/data/data.json`.
- Navigation par ancres (`#planning`…) avec historique : le bouton retour revient à l'onglet précédent.

## 1.0.0 — 16/10/2026

Première version web : moteur traduit de la VBA, 9 onglets, export CSV et JSON.
