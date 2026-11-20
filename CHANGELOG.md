# Changements

Les versions suivent [SemVer](https://semver.org/lang/fr/) : `Y` pour une nouvelle fonctionnalité, `Z` pour une correction.

## [Non publié]

- Corrigé : après un démarrage du PC, les boutons qui ouvrent une note dans Obsidian ou un dossier dans l'éditeur ne faisaient rien (le service démarrait avant Hyprland) ; le Cockpit trouve maintenant l'instance de Hyprland en cours à chaque clic.

## [1.3.0] - 2026-11-18

- Ajouté : « À faire » : bouton « Fait » qui masque une tâche jusqu'à ce qu'elle change (fichier d'état `server.stateFolder`), « Cocher » qui coche un test passé dans la note du module, liste des tâches masquées avec « Remettre ».
- Ajouté : widget facultatif pour la barre Caelestia (`extras/caelestia`) : pastille du cours en cours ou du prochain cours, salle, « Test » la veille et le jour d'un examen, bulle de détails ; un clic ouvre le Cockpit ou lance une commande choisie (`--open-command`) ; surcouche du shell reconstruite automatiquement après une mise à jour, retour au shell d'origine en cas d'erreur, jamais de redémarrage quand la session est verrouillée ; route `GET /api/widget`.

## [1.2.0] - 2026-11-18

- Ajouté : dock avec le nom de la vue dans une bulle au survol (au lieu de l'infobulle du navigateur), icônes qui grossissent autour de la souris, une couleur pastel par rôle d'icône (la même dans tous les espaces), point sous la vue active.
- Ajouté : bouton « Modifier » dans le calendrier pour les rendez-vous et examens de l'agenda (route `POST /api/agenda/update`) ; un événement créé sur le téléphone et modifié dans le Cockpit est ensuite géré par le Cockpit (l'original est retiré de Google à la synchro suivante).
- Ajouté : onglets Activité et Activité git en tableau de bord : chiffres clés (notes, commits, jours actifs, série en cours, jour le plus actif), grilles agrandies, projets les plus actifs, derniers commits.
- Ajouté : « Autres dossiers de code » classés par groupe (un par dossier racine, nom réglable avec `projects.codeRoots[].group`).
- Corrigé : la liste des résultats de la recherche défile (molette et flèches ↑ ↓) au lieu de déborder.

## [1.1.0] - 2026-11-18

- Ajouté : bouton « Ouvrir dans Google Drive » dans la vue Drive, vers l'adresse de la nouvelle option `drive.webUrl` (facultative).
- Ajouté : **note CFC provisoire** dans la vue Stats (calcul de l'ordonnance : domaines, arrondis, notes éliminatoires, dispense de culture générale) et note nécessaire au TPI pour 4, 5 et 5,5 ; nouvelle section de configuration `school.cfc`.
- Ajouté : la vue Stats affiche les barres de **tous les semestres notés** (le plus récent en haut) ; un clic sur une tuile de semestre y fait défiler et les faits suivent ce semestre.
- Corrigé : note CFC, chaque note de module et chaque note semestrielle de maths + anglais est arrondie à la demi-note avant les moyennes, comme sur les bulletins et ISA.

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
