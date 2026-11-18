# Changements

Les versions suivent [SemVer](https://semver.org/lang/fr/) : `Y` pour une nouvelle fonctionnalité, `Z` pour une correction.

## [Non publié]

- Ajouté : bouton « Ouvrir dans Google Drive » dans la vue Drive, vers l'adresse de la nouvelle option `drive.webUrl` (facultative).

## [1.0.1] - 2026-11-18

- Vérification automatique des pull requests (GitHub Actions : types, Prettier, tests, build sur Node 24 et 26).
- `CONTRIBUTING.md`, modèle de pull request, `CHANGELOG.md`.
- Corrigé : le bouton « KB » d'une carte de projet pouvait ouvrir une autre note qui avait le même titre affiché ; le lien est maintenant résolu comme dans Obsidian (nom de fichier, puis chemin, puis titre).

## [1.0.0] - 2026-11-18

Première version publique.

- Espaces Aujourd'hui, École, Projets et Perso, recherche dans tout le vault.
- Calendrier avec agenda dans le vault, notes d'examen, activité, journal.
- Synchro Google Agenda facultative, script de partage facultatif, intégration Hyprland facultative.
- Configuration `cockpit.config.json` validée au démarrage, écritures ACID, tests `node --test`.
