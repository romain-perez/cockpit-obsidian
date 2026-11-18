# Widget Cockpit pour la barre Caelestia

Facultatif. Ajoute à la barre de [Caelestia](https://github.com/caelestia-dots/shell) une pastille du Cockpit : cours en cours (heure de fin) ou prochain cours (jour et heure de début), salle, pastille rouge « Test » la veille et le jour d'un examen. Au survol, une bulle montre la progression du cours, les cours suivants, l'examen de la semaine et le nombre de tâches ; un clic ouvre le Cockpit.

## Installer

```bash
python3 extras/caelestia/caelestia-overlay.py install            # Cockpit sur http://127.0.0.1:4321
python3 extras/caelestia/caelestia-overlay.py install --url URL  # autre adresse
python3 extras/caelestia/caelestia-overlay.py install --open-command "mon-script"  # commande lancée au clic (ex. passer sur un onglet déjà ouvert)
```

Le script :

1. construit une **surcouche** du shell dans `~/.config/quickshell/caelestia` (Quickshell la charge avant le shell du paquet, `/etc/xdg/quickshell/caelestia`) : des **liens** vers tous les fichiers du paquet, sauf `modules/bar/Bar.qml` et `modules/bar/popouts/Content.qml` (copiés avec quelques lignes en plus) et les trois fichiers de `shell/` ajoutés ;
2. ajoute l'entrée `cockpit` après `workspaces` dans `~/.config/caelestia/shell.json` (sauvegarde `shell.json.bak-cockpit`) ;
3. installe `cockpit-caelestia.path` (systemd utilisateur) : après chaque opération de pacman, `check` reconstruit la surcouche si `caelestia-shell` a changé ;
4. redémarre le shell (une seule instance, lancée par Hyprland) et lit son journal.

## Sécurité

- **Jamais pendant que la session est verrouillée** : l'écran de verrouillage fait partie du shell ; le redémarrage est alors reporté.
- Un dossier `~/.config/quickshell/caelestia` qui n'a pas été créé par ce script (pas de fichier `.cockpit-overlay.json`) n'est jamais touché.
- Si un point d'insertion a disparu après une mise à jour de Caelestia, ou si le shell redémarré signale une erreur, la surcouche est retirée et le shell d'origine relancé, avec une notification.
- Sans la surcouche, l'entrée `cockpit` restée dans `shell.json` est simplement ignorée.

## Retirer

```bash
python3 extras/caelestia/caelestia-overlay.py remove
```

Retire la surcouche, l'entrée de `shell.json` et les unités systemd, puis relance le shell d'origine.

## Données

La pastille lit `GET /api/widget` toutes les minutes : cours en cours (`now`, avec progression et minutes restantes), prochain cours (`next`), cours suivants (`following`), examen dans les 7 jours (`exam`) et nombre de tâches (`tasks`).
