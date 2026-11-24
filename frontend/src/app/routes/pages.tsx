import { BriefingPage } from "../../features/briefing/BriefingPage";
import { LobbyPage } from "../../features/mission-lobby/LobbyPage";
import { SimulationPage } from "../../features/simulation/SimulationPage";
import { ReplayPage } from "../../features/replay/ReplayPage";
import { ReportPage } from "../../features/learning-report/ReportPage";
import { TeacherPage } from "../../features/teacher-view/TeacherPage";

export const routePages = [
  {
    path: "/",
    title: "Game lobby",
    description: "Browse teacher-assigned games.",
    component: LobbyPage,
  },
  {
    path: "/briefing",
    title: "Briefing",
    description: "Mission briefing placeholder.",
    component: BriefingPage,
  },
  {
    path: "/simulation",
    title: "Game simulation",
    description: "Play and review a saved simulation run.",
    component: SimulationPage,
  },
  {
    path: "/replay",
    title: "Replay",
    description: "Replay comparison placeholder.",
    component: ReplayPage,
  },
  {
    path: "/report",
    title: "Learning report",
    description: "Learning report placeholder.",
    component: ReportPage,
  },
  {
    path: "/teacher",
    title: "Teacher access",
    description: "Issue one-time feature-phone learner codes.",
    component: TeacherPage,
  },
];
