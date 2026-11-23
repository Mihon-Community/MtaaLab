import { BriefingPage } from "../../features/briefing/BriefingPage";
import { LobbyPage } from "../../features/mission-lobby/LobbyPage";
import { SimulationPage } from "../../features/simulation/SimulationPage";
import { ReplayPage } from "../../features/replay/ReplayPage";
import { ReportPage } from "../../features/learning-report/ReportPage";
import { TeacherPage } from "../../features/teacher-view/TeacherPage";

export const routePages = [
  {
    path: "/",
    title: "Mission lobby",
    description: "Available mission placeholder.",
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
    title: "Simulation",
    description: "Mtoni simulation placeholder.",
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
    title: "Teacher view",
    description: "Teacher view placeholder.",
    component: TeacherPage,
  },
];
