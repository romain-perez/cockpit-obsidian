pragma ComponentBehavior: Bound

// Cockpit bar entry ("cockpit" in shell.json bar.entries): course in progress or next course,
// time (end of the current course or start of the next one), room, red "Test" pill the day before and the day of an exam.
import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import qs.components
import qs.services

StyledRect {
    id: root

    readonly property var course: CockpitData.shown
    readonly property color colour: CockpitData.online && course ? course.color : Colours.palette.m3outline
    readonly property var smallFont: Tokens.font.body.builders.small.scale(0.85).build()
    readonly property int examPillDays: 1 // red pill: the day before and the day of an exam

    // "demain" → "dem.", "ven. 20" → "ven."; nothing for today
    function shortDay(day: string): string {
        if (!day || day === "aujourd'hui")
            return "";
        return day === "demain" ? "dem." : day.split(" ")[0];
    }

    implicitWidth: Tokens.sizes.bar.innerWidth
    implicitHeight: layout.implicitHeight + Tokens.padding.small * 2
    radius: Tokens.rounding.full
    color: Qt.alpha(root.colour, 0.12)

    ColumnLayout {
        id: layout

        anchors.centerIn: parent
        spacing: Tokens.spacing.extraSmall

        MaterialIcon {
            Layout.alignment: Qt.AlignHCenter
            text: "school"
            color: root.colour
            fill: CockpitData.inProgress ? 1 : 0
        }

        StyledText {
            Layout.alignment: Qt.AlignHCenter
            visible: text !== ""
            text: CockpitData.inProgress ? "" : root.shortDay(root.course?.day ?? "")
            font: root.smallFont
            color: Colours.palette.m3onSurfaceVariant
        }

        StyledText {
            Layout.alignment: Qt.AlignHCenter
            text: !CockpitData.online ? "–" : !root.course ? "libre" : CockpitData.inProgress ? root.course.end : root.course.start
            font: Tokens.font.body.builders.small.build()
            color: Colours.palette.m3onSurface
        }

        StyledText {
            Layout.alignment: Qt.AlignHCenter
            visible: text !== ""
            text: CockpitData.online && root.course ? root.course.roomShort : ""
            font: root.smallFont
            color: Colours.palette.m3onSurfaceVariant
        }

        StyledRect {
            Layout.alignment: Qt.AlignHCenter
            visible: CockpitData.online && (CockpitData.info?.exam?.inDays ?? 99) <= root.examPillDays
            implicitWidth: examText.implicitWidth + Tokens.padding.small * 2
            implicitHeight: examText.implicitHeight + 2
            radius: Tokens.rounding.small
            color: Colours.palette.m3error

            StyledText {
                id: examText

                anchors.centerIn: parent
                text: "Test"
                font: root.smallFont
                color: Colours.palette.m3onError
            }
        }
    }

    TapHandler {
        onTapped: CockpitData.open()
    }
}
