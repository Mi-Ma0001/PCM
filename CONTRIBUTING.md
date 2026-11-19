# Contribuer

1. Créez une branche : `git checkout -b ma-modification`.
2. Installez le projet et vérifiez que tout passe : `npm install && npm test`.
3. Faites vos changements en suivant [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md). Ajoutez un test pour chaque nouvelle règle de calcul ou fonction de l'interface.
4. Vérifiez à nouveau : `npm test` (et `npm run test:sql` si vous touchez à `supabase/`).
5. Ajoutez une ligne dans `CHANGELOG.md` et ouvrez une *pull request* avec une description claire.

**Conventions :**
- le code et les commentaires sont en français ;
- indentation de 2 espaces, voir `.editorconfig` ;
- pas de dépendance d'exécution côté web sans discussion préalable ;
- le moteur de calcul doit rester identique aux résultats VBA de référence.
