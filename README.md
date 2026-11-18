# Cockpit

Tableau de bord local pour un coffre **Obsidian** : cours et examens, projets de code, notes perso, journal, recherche, agenda synchronisé avec le téléphone.
Le vault reste la source de vérité (fichiers Markdown). Le Cockpit les lit et les affiche dans une page web locale.

- Espaces **Aujourd'hui · École · Projets · Perso**, chacun avec un carrousel et des vues (calendrier, à faire, modules, notes d'examen, activité…).
- Recherche dans tout le vault : `/` ou `Ctrl+K` (sans accents, plusieurs mots).
- **Lecture seule** du vault, sauf une note d'agenda (rendez-vous et examens ajoutés depuis le calendrier).
- Dossiers exclus (travail, privé…) jamais lus, jamais affichés, jamais trouvés par la recherche.
- Fonctions facultatives : synchro Google Agenda (et donc le calendrier du téléphone), partage d'un dossier par un script, intégration Hyprland.

## Installation

Il faut **Node.js 24 ou plus récent** (le serveur exécute le TypeScript directement) et `git`.

```bash
git clone <adresse du dépôt> cockpit && cd cockpit
npm install
cp cockpit.config.example.json cockpit.config.json   # puis remplir au moins vault.path
npm run build                                        # compile l'interface dans dist/
npm start                                            # http://localhost:4321
```

Au démarrage, la configuration est vérifiée : en cas d'erreur, le serveur s'arrête avec la liste des problèmes. Une fonction facultative mal configurée est désactivée avec un avertissement, le reste démarre.

### Lancer au démarrage de la session (systemd, facultatif)

`~/.config/systemd/user/cockpit.service` :

```ini
[Unit]
Description=Cockpit (http://localhost:4321)

[Service]
WorkingDirectory=%h/chemin/vers/cockpit
ExecStart=/usr/bin/node server/main.ts
Environment=NODE_NO_WARNINGS=1
Restart=on-failure

[Install]
WantedBy=default.target
```

puis `systemctl --user daemon-reload && systemctl --user enable --now cockpit`.

## Configuration

Tout se règle dans **`cockpit.config.json`** (ignoré par git, commentaires `//` autorisés). Le modèle commenté est [`cockpit.config.example.json`](cockpit.config.example.json). Seul `vault.path` est obligatoire.

| Section    | Contenu                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `server`   | port (le serveur n'écoute que sur 127.0.0.1)                                                                              |
| `locale`   | langue et fuseau horaire (dates, synchro Google)                                                                          |
| `vault`    | chemin et nom du coffre, **dossiers exclus**, emplacement des notes (agenda, notes d'examen, journal, fiches de projets)  |
| `school`   | conventions des notes de modules, couleurs, cours sans module, dossier des PDF téléchargés, calcul de la note CFC (`cfc`) |
| `schedule` | horaire de cours : adresse d'un calendrier `.ics`, cache, fichier de repli, règles titre → code, cours masqués            |
| `projects` | dossiers où chercher du code (et leur groupe), propriétés des fiches de projets                                           |
| `drive`    | script de partage et adresse web du dossier partagé (facultatif)                                                          |
| `desktop`  | ouverture d'Obsidian / VS Code et bascule de fenêtre sous Hyprland (facultatif)                                           |
| `google`   | synchro Google Agenda (facultatif)                                                                                        |

Variables d'environnement : `COCKPIT_CONFIG` (autre fichier de configuration), `COCKPIT_PORT`, `COCKPIT_VAULT`.

### Conventions du vault (valeurs par défaut, modifiables)

- **Modules** : `École/<N>ème année/<module>/-M295.md` (titre = première ligne de texte), séquences `Séquence 3.md`, `refcard.md` facultative. Modules terminés dans `_Terminés/`.
  Propriétés : `catégorie`, `couleur`. Une séquence avec `examen passé: true` est considérée comme déjà évaluée.
  Examens dans la note du module : `- [ ] Test 3 — vendredi 20 novembre 2026` (cocher quand c'est passé).
- **Notes d'examen** : une section `## 2ème année · 1er semestre` par semestre, un tableau `| Branche | Moyenne | Notes | Statut |` (`Statut` contient « définitive » quand c'est fini).
  La vue Stats en tire une **note CFC provisoire** selon l'ordonnance (modules d'école 80 % et cours interentreprises 20 % arrondis à la demi-note, maths + anglais par semestre, culture générale dispensée ou non) et la note nécessaire au TPI : réglages dans `school.cfc`.
- **Projets** : une fiche par projet dans `vault.projectsFolder`, avec les propriétés `espace: projets`, `dossier: ~/code/mon-projet`, `prochaine-etape`, `statut`, `kb: "[[Note]]"`, `depot: https://…`.
- **Journal** : une note `AAAA-MM-JJ.md` par jour dans `vault.journalFolder`, sections `## Sujet` avec puces `- **Demande** : …` et `- **Prochaine étape** : …`.
- **Agenda** : créé au premier ajout (`vault.agendaFile`), un tableau éditable à la main.

## Synchro Google Agenda (facultatif)

Le Cockpit crée deux calendriers (cours et perso) et les tient à jour ; un événement ajouté sur le téléphone dans le calendrier perso devient une ligne de l'agenda (et suit ses modifications). Le Cockpit ne modifie jamais un événement qu'il n'a pas créé.

1. Sur [console.cloud.google.com](https://console.cloud.google.com) : créer un projet, activer **Google Calendar API**, configurer l'écran de consentement (ajouter le champ d'application `…/auth/calendar.app.created`).
2. Créer un identifiant **ID client OAuth → Application de bureau**, télécharger le JSON et l'enregistrer en `~/.config/cockpit/google-client.json` (`chmod 600`).
3. Dans `cockpit.config.json` : `"google": { "enabled": true, … }`, redémarrer.
4. Dans le Cockpit : **Aujourd'hui → Calendrier → Connecter Google**.

Tant que l'application Google est en mode « test », le jeton expire après 7 jours : passer l'application en production (sans validation pour un usage personnel) pour ne plus avoir à se reconnecter.
Fichiers dans `google.secretsFolder` (droits 600, jamais dans le vault ni dans le dépôt) : `google-client.json`, `google-token.json`, `google-calendars.json`, `google-phone-events.json`.

## Comment c'est construit

```
server/                 serveur Node (TypeScript exécuté directement, aucune dépendance)
  main.ts               routes HTTP, chargement de la configuration, tâches périodiques
  config.ts             lecture, valeurs par défaut et validation de cockpit.config.json
  core/                 safe-write (écritures sûres), dates, hachages stables, Markdown
  school/               horaire (.ics), modules, notes d'examen, données de l'espace École
  vault/                index du vault, recherche, perso, journal et activité
  projects/             fiches de projets et état git
  google/               OAuth (PKCE) et synchro des calendriers
  agenda.ts, calendar.ts, today.ts, drive.ts, desktop.ts
shared/types.ts         contrat de données entre le serveur et l'interface
src/                    interface React (Vite)
test/                   tests (node --test)
```

Le code est en anglais, les textes affichés en français.

### Écritures sûres (ACID)

Toutes les écritures passent par `server/core/safe-write.ts` :

- **Atomicité** : écriture dans un fichier temporaire, `fsync`, puis `rename` sur la cible. Un lecteur voit l'ancien ou le nouveau fichier, jamais une moitié, même en cas de coupure.
- **Cohérence** : le nouveau contenu est validé avant l'écriture (le tableau de l'agenda doit rester lisible) et relu après.
- **Isolation** : une file d'attente par fichier dans le serveur, et un contrôle optimiste contre les modifications faites entre-temps par un autre programme (Obsidian) : la modification est alors recalculée sur le contenu frais.
- **Durabilité** : `fsync` du fichier puis du dossier avant de répondre.

### Sécurité

- Le serveur n'écoute que sur `127.0.0.1`.
- Les requêtes `POST` venant d'un autre site sont refusées (contrôle de l'en-tête `Origin`).
- Ouvrir une note : seulement un lien `obsidian://open` vers le coffre configuré. Ouvrir un dossier : seulement les dossiers de code connus du Cockpit. La seule commande exécutable est le script de partage configuré (`-n` pour vérifier, `-y` pour envoyer).
- `/api/config` ne donne à l'interface ni secret ni chemin absolu.

## Commandes

```bash
npm start            # serveur (http://localhost:4321)
npm run dev          # interface en développement (Vite, port 5173) ; lancer aussi npm start
npm run build        # compile l'interface dans dist/
npm test             # tests (node --test)
npm run typecheck    # vérification des types (interface + serveur + tests)
npm run format       # met en forme tout le code (Prettier, lignes de 140)
npm run check        # typecheck + format:check + tests
```

`?date=AAAA-MM-JJ` dans l'adresse simule une autre journée. Adresses des vues : `#<espace>/<vue>` (ex. `#school/stats`).

## API

`GET` : `/api/config`, `/api/today`, `/api/school`, `/api/projects`, `/api/personal`, `/api/activity`, `/api/search?q=`, `/api/calendar?from=&to=`, `/api/schedule`, `/api/drive`, `/api/google`.
`POST` : `/api/agenda`, `/api/agenda/remove`, `/api/open-note`, `/api/open-folder`, `/api/google/sync`, `/api/drive/check`, `/api/drive/upload`.
Les paramètres sont décrits en tête de [`server/main.ts`](server/main.ts).

## Contribuer

Règles du code et chemin d'une nouvelle fonctionnalité : [CONTRIBUTING.md](CONTRIBUTING.md). Historique des versions : [CHANGELOG.md](CHANGELOG.md).

## Licence

[MIT](LICENSE) © 2026 Romain Perez
