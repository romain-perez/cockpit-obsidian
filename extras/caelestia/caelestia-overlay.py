#!/usr/bin/env python3
"""Cockpit widget for the Caelestia bar, installed as an overlay of the packaged shell.

Quickshell loads ~/.config/quickshell/caelestia before /etc/xdg/quickshell/caelestia. The overlay is a mirror
of the packaged shell made of symbolic links, except:
  - modules/bar/Bar.qml and modules/bar/popouts/Content.qml: copies with a few lines inserted (the "cockpit"
    bar entry, its popout);
  - services/CockpitData.qml, modules/bar/components/CockpitWidget.qml, modules/bar/popouts/CockpitPopout.qml:
    added from this folder.
Every other file stays the packaged one, so updates of caelestia-shell apply as usual. After an update,
`check` rebuilds the overlay (run by the systemd path unit when pacman changes packages).

Safety: the overlay folder is only replaced if it carries our marker; if an insertion point is missing
(the packaged shell changed too much) or the restarted shell logs an error, the overlay is removed and the
packaged shell is restarted, with a desktop notification.

Usage:
  caelestia-overlay.py install [--url URL] [--open-command CMD] [--no-restart]
                                                             build the overlay, restart and verify the shell
  caelestia-overlay.py check                                 rebuild only if the packaged shell changed
  caelestia-overlay.py remove                                back to the packaged shell
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

SOURCE = Path(os.environ.get("CAELESTIA_SHELL_SOURCE", "/etc/xdg/quickshell/caelestia"))
TARGET = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "quickshell" / "caelestia"
EXTRA = Path(__file__).resolve().parent / "shell"
MARKER = ".cockpit-overlay.json"
DEFAULT_URL = "http://127.0.0.1:4321"
VERIFY_SECONDS = 6
SHELL_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "caelestia" / "shell.json"
UNITS = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "systemd" / "user"
UNIT_NAME = "cockpit-caelestia"
ENTRY = {"enabled": True, "id": "cockpit"}

ADDED = [
    "services/CockpitData.qml",
    "modules/bar/components/CockpitWidget.qml",
    "modules/bar/popouts/CockpitPopout.qml",
]

# file → [(anchor that must appear exactly once, text inserted just before it)]
PATCHES = {
    "modules/bar/Bar.qml": [
        (
            '            DelegateChoice {\n                roleValue: "clock"',
            '            DelegateChoice {\n'
            '                roleValue: "cockpit"\n'
            "                delegate: EntryWrapper {\n"
            "                    CockpitWidget {\n"
            '                        objectName: "taskbarCockpit"\n'
            "                    }\n"
            "                }\n"
            "            }\n",
        ),
        (
            '        } else if (id === "activeWindow"',
            '        } else if (id === "cockpit") {\n'
            '            popouts.currentName = "cockpit";\n'
            "            popouts.currentCenter = (ch.item as Item).mapToItem(root, 0, (ch.item as Item).implicitHeight / 2).y ?? 0;\n"
            "            popouts.hasCurrent = true;\n",
        ),
    ],
    "modules/bar/popouts/Content.qml": [
        (
            '        Popout {\n            name: "activewindow"',
            '        Popout {\n            name: "cockpit"\n            sourceComponent: CockpitPopout {}\n        }\n\n',
        ),
    ],
}

TOUCHED = set(ADDED) | set(PATCHES)


class OverlayError(Exception):
    pass


def notify(message: str) -> None:
    subprocess.run(["notify-send", "-a", "Cockpit", "Widget Cockpit", message], check=False)


def open_command(url: str, command: str | None) -> list[str]:
    """Command run when the widget is clicked: a custom one through sh, or the browser."""
    return ["sh", "-c", command] if command else ["xdg-open", url]


def fingerprint(url: str, command: str | None = None) -> str:
    """Changes when the packaged shell (files we patch, listing of mirrored folders) or our files change."""
    digest = hashlib.sha256(f"{url}\n{command or ''}".encode())
    for relative in sorted(PATCHES):
        digest.update((SOURCE / relative).read_bytes())
    for folder in sorted({str(Path(p).parent) for p in TOUCHED} | {"."}):
        digest.update("\n".join(sorted(os.listdir(SOURCE / folder))).encode())
    for relative in ADDED:
        digest.update((EXTRA / relative).read_bytes())
    digest.update(Path(__file__).read_bytes())
    return digest.hexdigest()


def patched(relative: str) -> str:
    text = (SOURCE / relative).read_text()
    for anchor, insertion in PATCHES[relative]:
        if text.count(anchor) != 1:
            raise OverlayError(f"point d'insertion introuvable dans {relative} (caelestia-shell a changé)")
        text = text.replace(anchor, insertion + anchor)
    return text


def mirror(source: Path, target: Path, relative: str) -> None:
    """Real folders on the way to touched files, symbolic links everywhere else."""
    target.mkdir()
    for entry in sorted(os.listdir(source)):
        path = f"{relative}/{entry}" if relative else entry
        if path in PATCHES:
            (target / entry).write_text(patched(path))
        elif any(t.startswith(path + "/") for t in TOUCHED):
            mirror(source / entry, target / entry, path)
        elif path not in TOUCHED:
            (target / entry).symlink_to(source / entry)


def owned(path: Path) -> bool:
    return (path / MARKER).is_file()


def build(url: str, command: str | None = None) -> None:
    if not (SOURCE / "shell.qml").is_file():
        raise OverlayError(f"shell Caelestia introuvable dans {SOURCE}")
    if TARGET.exists() and not owned(TARGET):
        raise OverlayError(f"{TARGET} existe et n'a pas été créé par le Cockpit : rien n'est touché")
    staging = TARGET.with_name(TARGET.name + ".cockpit-new")
    shutil.rmtree(staging, ignore_errors=True)
    staging.parent.mkdir(parents=True, exist_ok=True)
    try:
        mirror(SOURCE, staging, "")
        for relative in ADDED:
            text = (
                (EXTRA / relative)
                .read_text()
                .replace("@COCKPIT_URL@", url)
                .replace("@COCKPIT_OPEN_COMMAND@", json.dumps(open_command(url, command), ensure_ascii=False))
            )
            (staging / relative).write_text(text)
        state = {"fingerprint": fingerprint(url, command), "url": url, "openCommand": command, "built": time.strftime("%Y-%m-%d %H:%M")}
        (staging / MARKER).write_text(json.dumps(state, indent=2, ensure_ascii=False))
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    # Swap: the previous overlay (ours) is replaced in one rename
    previous = TARGET.with_name(TARGET.name + ".cockpit-old")
    shutil.rmtree(previous, ignore_errors=True)
    if TARGET.exists():
        TARGET.rename(previous)
    staging.rename(TARGET)
    shutil.rmtree(previous, ignore_errors=True)


def write_json(path: Path, data: dict) -> None:
    """Same layout as caelestia (4 spaces, characters kept as is); temporary file then rename."""
    temporary = path.with_name(path.name + ".cockpit-tmp")
    temporary.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n")
    os.replace(temporary, path)


def set_bar_entry(present: bool) -> None:
    """Adds the "cockpit" entry after "workspaces" in shell.json bar.entries (or removes it)."""
    if not SHELL_CONFIG.is_file():
        return
    config = json.loads(SHELL_CONFIG.read_text())
    entries = config.setdefault("bar", {}).setdefault("entries", [])
    has = any(e.get("id") == ENTRY["id"] for e in entries)
    if present == has:
        return
    shutil.copy2(SHELL_CONFIG, SHELL_CONFIG.with_name(SHELL_CONFIG.name + ".bak-cockpit"))
    if present:
        after = next((i for i, e in enumerate(entries) if e.get("id") == "workspaces"), len(entries) - 1)
        entries.insert(after + 1, dict(ENTRY))
    else:
        config["bar"]["entries"] = [e for e in entries if e.get("id") != ENTRY["id"]]
    write_json(SHELL_CONFIG, config)


def set_units(present: bool) -> None:
    """systemd user units: after each pacman transaction, `check` rebuilds the overlay if caelestia-shell changed."""
    path_unit, service_unit = UNITS / f"{UNIT_NAME}.path", UNITS / f"{UNIT_NAME}.service"
    if present:
        UNITS.mkdir(parents=True, exist_ok=True)
        path_unit.write_text(
            "[Unit]\nDescription=Widget Cockpit : surveille les mises à jour de paquets\n\n"
            "[Path]\nPathChanged=/var/lib/pacman/local\n\n[Install]\nWantedBy=default.target\n"
        )
        service_unit.write_text(
            "[Unit]\nDescription=Widget Cockpit : reconstruit la surcouche de Caelestia si besoin\n\n"
            f"[Service]\nType=oneshot\nExecStart=/usr/bin/python3 {Path(__file__).resolve()} check\n"
        )
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        subprocess.run(["systemctl", "--user", "enable", "--now", f"{UNIT_NAME}.path"], check=False, capture_output=True)
    else:
        subprocess.run(["systemctl", "--user", "disable", "--now", f"{UNIT_NAME}.path"], check=False, capture_output=True)
        for unit in (path_unit, service_unit):
            unit.unlink(missing_ok=True)
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)


def remove_overlay() -> bool:
    if TARGET.exists() and owned(TARGET):
        shutil.rmtree(TARGET)
        return True
    return False


def session_locked() -> bool:
    """The lock screen is part of the shell: restarting the shell while locked kills the lock screen."""
    result = subprocess.run(["caelestia", "shell", "lock", "isLocked"], capture_output=True, text=True, timeout=10)
    return result.returncode != 0 or result.stdout.strip().lower() != "false"


def shell_instances() -> list[str]:
    result = subprocess.run(["pgrep", "-f", "^qs -c caelestia"], capture_output=True, text=True)
    return result.stdout.split()


def restart_shell() -> bool:
    """Stops every instance of the shell, then starts one through Hyprland (graphical session environment).
    Never while the session is locked: returns False, the overlay is then used at the next start of the shell."""
    if session_locked():
        print("Session verrouillée (ou état inconnu) : le shell n'est pas redémarré.")
        return False
    # `caelestia shell -r` only stops the instance of the same config path: stop them all
    subprocess.run(["pkill", "-f", "^qs -c caelestia"], check=False)
    for _ in range(20):
        if not shell_instances():
            break
        time.sleep(0.25)
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        subprocess.run(["hyprctl", "dispatch", 'hl.dsp.exec_cmd("caelestia shell -d")'], check=False, capture_output=True)
    else:
        subprocess.Popen(["caelestia", "shell", "-d"], start_new_session=True)
    return True


def shell_errors() -> list[str]:
    time.sleep(VERIFY_SECONDS)
    log = subprocess.run(["caelestia", "shell", "-l"], capture_output=True, text=True, timeout=10).stdout
    lines = [line for line in log.splitlines() if "ERROR" in line or "Failed to load" in line]
    errors = [line for line in lines if "Cockpit" in line or "Failed to load" in line or "bar/Bar.qml" in line or "popouts/Content.qml" in line]
    if len(shell_instances()) != 1:
        errors.append(f"{len(shell_instances())} instances du shell au lieu d'une")
    return errors


def install(url: str, restart: bool, command: str | None = None) -> int:
    try:
        build(url, command)
    except OverlayError as error:
        removed = remove_overlay()
        if removed and restart:
            restart_shell()
        notify(f"Widget désactivé : {error}.")
        print(f"Erreur : {error}", file=sys.stderr)
        return 1
    set_bar_entry(True)
    set_units(True)
    if not restart:
        print(f"Surcouche prête dans {TARGET} (redémarrer le shell : caelestia shell -r)")
        return 0
    if not restart_shell():
        notify("Widget prêt : il apparaîtra au prochain démarrage du shell (session verrouillée).")
        return 0
    errors = shell_errors()
    if errors:
        remove_overlay()
        restart_shell()
        notify("Le widget a provoqué une erreur : retour au shell d'origine.")
        print("Erreurs du shell, surcouche retirée :\n" + "\n".join(errors), file=sys.stderr)
        return 1
    print(f"Widget Cockpit installé ({TARGET}), shell redémarré sans erreur.")
    return 0


def check() -> int:
    """For the systemd path unit: rebuild only if the packaged shell or our files changed."""
    if not owned(TARGET):
        return 0
    state = json.loads((TARGET / MARKER).read_text())
    url, command = state.get("url", DEFAULT_URL), state.get("openCommand")
    try:
        if state.get("fingerprint") == fingerprint(url, command):
            return 0
    except FileNotFoundError:
        pass  # a patched file disappeared: rebuild fails below and falls back to the packaged shell
    return install(url, restart=True, command=command)


def main() -> int:
    parser = argparse.ArgumentParser(description="Widget Cockpit dans la barre Caelestia")
    sub = parser.add_subparsers(dest="command", required=True)
    install_parser = sub.add_parser("install", help="construire la surcouche, redémarrer et vérifier le shell")
    install_parser.add_argument("--url", default=DEFAULT_URL, help=f"adresse du Cockpit (défaut : {DEFAULT_URL})")
    install_parser.add_argument("--open-command", help="commande lancée au clic (par défaut : ouvrir l'adresse dans le navigateur)")
    install_parser.add_argument("--no-restart", action="store_true", help="ne pas redémarrer le shell")
    sub.add_parser("check", help="reconstruire seulement si caelestia-shell a changé")
    sub.add_parser("remove", help="retirer la surcouche et revenir au shell d'origine")
    args = parser.parse_args()

    if args.command == "install":
        return install(args.url, restart=not args.no_restart, command=args.open_command)
    if args.command == "check":
        return check()
    set_units(False)
    set_bar_entry(False)
    if remove_overlay():
        restart_shell()
        print("Surcouche retirée, shell d'origine redémarré.")
    else:
        print("Aucune surcouche du Cockpit à retirer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
