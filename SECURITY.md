# Sécurité

## Signaler une vulnérabilité

N'ouvrez pas d'*issue* publique. Utilisez l'onglet **Security → Report a vulnerability** du dépôt GitHub (signalement privé). Décrivez :
- le problème ;
- comment le reproduire ;
- son impact.

Le signalement est traité en priorité, avant toute publication.

## Mesures en place

| Domaine | Mesure |
|---|---|
| Secrets | Aucun secret dans le code. Seule la clé **publique** Supabase est injectée au build. Le build **refuse** les clés `service_role` et `sb_secret_…` |
| Données | Stockées sur l'appareil (`localStorage`). Avec la synchronisation, elles sont protégées par la **Row Level Security** PostgreSQL : chaque utilisateur n'accède qu'à ses propres plans, ce qui est testé par `npm run test:sql` |
| Comptes | Gérés par Supabase Auth : mots de passe hachés côté serveur, jamais stockés par l'application. La session (jeton d'accès et jeton de rafraîchissement) est gardée dans le stockage local de l'appareil, comme le fait la bibliothèque officielle de Supabase |
| Web | Politique de sécurité du contenu (CSP) stricte : aucun script en ligne ni externe. En-têtes `X-Frame-Options: DENY`, `nosniff`, HSTS et `Permissions-Policy` (`vercel.json`). Les textes saisis sont échappés avant affichage |
| Import | Les fichiers JSON sont validés (structure, types, doublons, dates) et limités à 5 Mo. Une copie de sécurité est faite avant chaque import |
| Android | Une seule autorisation : `INTERNET`, pour la synchronisation. Pas de contenu mixte HTTP. Les exports passent par le partage natif |
| Dépendances | Aucune dépendance au moment de l'exécution côté web. Celles de Capacitor sont limitées aux modules officiels |

## Limites connues

- Les données enregistrées sur l'appareil ne sont pas chiffrées par l'application. Toute personne ayant accès à l'appareil déverrouillé peut les lire. Utilisez le verrouillage de l'appareil.
- Une sauvegarde automatique Android (`allowBackup`) peut inclure les données de l'application dans la sauvegarde Google de l'utilisateur.
