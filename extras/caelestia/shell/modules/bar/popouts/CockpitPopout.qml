pragma ComponentBehavior: Bound

// Popout of the Cockpit bar entry: course in progress (with progress) or next course, the following courses,
// exam within 7 days, number of tasks.
import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import qs.components
import qs.services

ColumnLayout {
    id: root

    readonly property var info: CockpitData.info
    readonly property var course: CockpitData.shown

    function remaining(minutes: int): string {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h > 0 ? `encore ${h} h ${String(m).padStart(2, "0")}` : `encore ${m} min`;
    }

    spacing: Tokens.spacing.small
    width: 270

    StyledText {
        visible: !CockpitData.online
        text: "Cockpit injoignable (service arrêté ?)"
        color: Colours.palette.m3onSurfaceVariant
    }

    StyledText {
        visible: CockpitData.online
        text: CockpitData.inProgress ? "MAINTENANT" : root.course ? "PROCHAIN COURS" : "AUCUN COURS DANS LES 14 JOURS"
        font: Tokens.font.body.builders.small.scale(0.85).build()
        color: Colours.palette.m3onSurfaceVariant
    }

    StyledRect {
        visible: CockpitData.online && !!root.course
        Layout.fillWidth: true
        implicitHeight: card.implicitHeight + Tokens.padding.medium * 2
        radius: Tokens.rounding.medium
        color: Qt.alpha(root.course?.color ?? "transparent", 0.15)
        border.width: 1
        border.color: Qt.alpha(root.course?.color ?? "transparent", 0.4)

        ColumnLayout {
            id: card

            anchors.fill: parent
            anchors.margins: Tokens.padding.medium
            spacing: Tokens.spacing.extraSmall

            StyledText {
                text: root.course ? root.course.label : ""
                font: Tokens.font.body.builders.medium.build()
                color: Colours.palette.m3onSurface
            }

            StyledText {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: root.course ? [`${CockpitData.inProgress ? "" : root.course.day + " · "}${root.course.start} – ${root.course.end}`, root.course.room, root.course.teacher].filter(s => s).join(" · ") : ""
                font: Tokens.font.body.builders.small.build()
                color: Colours.palette.m3onSurfaceVariant
            }

            StyledRect {
                visible: CockpitData.inProgress
                Layout.fillWidth: true
                Layout.topMargin: Tokens.spacing.extraSmall
                implicitHeight: 5
                radius: 3
                color: Qt.alpha(Colours.palette.m3onSurface, 0.1)

                StyledRect {
                    width: parent.width * (root.info?.now?.progress ?? 0)
                    height: parent.height
                    radius: 3
                    color: root.course?.color ?? "transparent"
                }
            }

            StyledText {
                visible: CockpitData.inProgress
                text: CockpitData.inProgress ? root.remaining(root.info.now.remainingMinutes) : ""
                font: Tokens.font.body.builders.small.build()
                color: Colours.palette.m3onSurfaceVariant
            }
        }
    }

    StyledText {
        visible: CockpitData.online && (root.info?.following?.length ?? 0) > 0
        Layout.topMargin: Tokens.spacing.small
        text: "ENSUITE"
        font: Tokens.font.body.builders.small.scale(0.85).build()
        color: Colours.palette.m3onSurfaceVariant
    }

    // Three columns (day and time, colour dot, course): the first one takes the width of its longest text
    GridLayout {
        visible: CockpitData.online && (root.info?.following?.length ?? 0) > 0
        columns: 3
        columnSpacing: Tokens.spacing.medium
        rowSpacing: Tokens.spacing.extraSmall

        Repeater {
            model: CockpitData.online ? (root.info?.following ?? []) : []

            StyledText {
                required property var modelData

                Layout.row: index
                Layout.column: 0
                required property int index
                text: `${modelData.day === "aujourd'hui" ? "" : modelData.day.split(" ")[0] + " "}${modelData.start}`
                font: Tokens.font.body.builders.small.build()
                color: Colours.palette.m3onSurfaceVariant
            }
        }

        Repeater {
            model: CockpitData.online ? (root.info?.following ?? []) : []

            StyledRect {
                required property var modelData
                required property int index

                Layout.row: index
                Layout.column: 1
                Layout.alignment: Qt.AlignVCenter
                implicitWidth: 8
                implicitHeight: 8
                radius: 4
                color: modelData.color
            }
        }

        Repeater {
            model: CockpitData.online ? (root.info?.following ?? []) : []

            StyledText {
                required property var modelData
                required property int index

                Layout.row: index
                Layout.column: 2
                text: `${modelData.label} · ${modelData.roomShort}`
                font: Tokens.font.body.builders.small.build()
                color: Colours.palette.m3onSurface
            }
        }
    }

    StyledText {
        visible: CockpitData.online && !!root.info?.exam
        Layout.topMargin: Tokens.spacing.small
        text: root.info?.exam ? `📝 ${root.info.exam.title} · ${root.info.exam.day}${root.info.exam.inDays > 0 ? ` (dans ${root.info.exam.inDays} j)` : " (aujourd'hui)"}` : ""
        color: Colours.palette.m3error
    }

    StyledText {
        visible: CockpitData.online
        Layout.topMargin: Tokens.spacing.small
        text: `${root.info?.tasks ?? 0} tâche${(root.info?.tasks ?? 0) > 1 ? "s" : ""}`
        font: Tokens.font.body.builders.small.scale(0.9).build()
        color: Colours.palette.m3onSurfaceVariant
    }
}
