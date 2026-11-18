# Contribuer au Cockpit

La V1 fixe le niveau du code : chaque changement doit le garder. Ce fichier décrit les règles et le chemin d'une nouvelle fonctionnalité.

## Règles du code

- **Langues** : code en anglais (fichiers, noms, commentaires, routes, classes CSS), texte affiché à l'utilisateur en français.
- **Configuration** : aucune valeur personnelle dans le code. Un nouveau réglage s'ajoute dans `server/config.ts` (valeur par défaut + validation avec un message en français), dans `cockpit.config.example.json` (commenté) et dans le README.
- **Écritures** : toute écriture de fichier passe par `server/core/safe-write.ts` (atomique, isolée, durable). Le vault reste en lecture seule, sauf la note d'agenda.
- **Identifiants stables** : ne jamais changer les textes hachés des identifiants (`rowId` de l'agenda, `cours|…`, `agenda|…`, `test|…` dans `server/google/sync.ts`), sinon les événements sont dupliqués sur Google Agenda.
- **Contrat de données** : les types partagés entre serveur et interface sont dans `shared/types.ts`.
- **Tests** : toute nouvelle logique du serveur a ses tests dans `test/` (`node --test`). Les fonctions pures (parseurs, calculs) sont testées directement ; un vault temporaire est créé par `test/helpers.ts`.
- **Format** : Prettier, lignes de 140 caractères (`npm run format`).
- **Sécurité** : le serveur n'écoute qu'en local ; les routes `POST` vérifient l'origine et n'acceptent que des valeurs en liste blanche ; aucun secret dans le dépôt ni dans le vault.

## Chemin d'une nouvelle fonctionnalité

1. **Idée** : une issue sur GitHub (ou une demande directe).
2. **Plan** : ce qui change, nouvelles options, tests, rendu attendu ; validé avant de coder.
3. **Branche** depuis `main` : `feat/<nom>` ou `fix/<nom>` (minuscules, tirets). Travailler dans un worktree (`git worktree add …`) si le service local tourne depuis le dossier principal.
4. **Code** selon les règles ci-dessus.
5. **Vérifier** : `npm run check` et `npm run build` ; essayer la branche sur un autre port (`COCKPIT_PORT=4399 npm start`) sans toucher au service habituel.
6. **Pull request** en français (modèle fourni) : la vérification automatique doit être verte. Le propriétaire du dépôt relit et fusionne.
7. **Après la fusion** : `git switch main && git pull && npm run build`, puis redémarrer le service.
8. **Version** : tag `vX.Y.Z` et release GitHub ; `Y` pour une nouvelle fonctionnalité, `Z` pour une correction. Les changements sont résumés dans `CHANGELOG.md`.

## Protection de `main`

`main` n'accepte que des pull requests dont la vérification automatique (`check`) est verte ; push direct, push forcé et suppression sont refusés.
