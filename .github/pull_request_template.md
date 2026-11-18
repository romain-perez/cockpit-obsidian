## Ce qui change

<!-- En quelques lignes : la fonctionnalité ou la correction, et pourquoi. Ajouter « Closes #<numéro> » si une issue existe. -->

## Comment tester

<!-- Étapes, adresse de la vue (#space/view), captures si l'interface change. -->

## Vérifications

- [ ] `npm run check` (types, Prettier, tests) et `npm run build` passent
- [ ] Code en anglais, textes affichés en français
- [ ] Aucune valeur personnelle dans le code : nouvelle option dans `server/config.ts`, `cockpit.config.example.json` et le README
- [ ] Écritures de fichiers par `server/core/safe-write.ts`
- [ ] Tests ajoutés ou mis à jour pour la nouvelle logique
- [ ] Identifiants stables inchangés (agenda, événements Google)
