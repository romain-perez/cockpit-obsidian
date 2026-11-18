pragma Singleton

// Cockpit widget data: reads <Cockpit>/api/widget every minute (installed by extras/caelestia/caelestia-overlay.py).
import QtQuick
import Quickshell

Singleton {
    id: root

    // Address of the Cockpit, written by caelestia-overlay.py (--url)
    readonly property string url: "@COCKPIT_URL@"
    // Command run on click, written by caelestia-overlay.py (--open-command); default: open the address in the browser
    readonly property var openCommand: @COCKPIT_OPEN_COMMAND@
    readonly property int refreshMs: 60000

    property var info: null
    property bool online: false

    // Course shown in the bar: the one in progress, else the next one
    readonly property var shown: info ? (info.now ?? info.next) : null
    readonly property bool inProgress: !!info?.now

    function refresh(): void {
        const request = new XMLHttpRequest();
        request.onreadystatechange = () => {
            if (request.readyState !== XMLHttpRequest.DONE)
                return;
            if (request.status === 200) {
                try {
                    root.info = JSON.parse(request.responseText);
                    root.online = true;
                    return;
                } catch (e) {}
            }
            root.online = false;
        };
        request.open("GET", `${root.url}/api/widget`);
        request.send();
    }

    function open(): void {
        Quickshell.execDetached(root.openCommand);
    }

    Timer {
        interval: root.refreshMs
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }
}
