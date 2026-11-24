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
    description: "Missions assigned to your classes.",
    component: LobbyPage,
  },
  {
    path: "/briefing",
    title: "Briefing",
    description: "Mission objectives, rules and controls.",
    component: BriefingPage,
  },
  {
    path: "/simulation",
    title: "Simulation",
    description: "Inspect the world and make a confirmed decision.",
    component: SimulationPage,
  },
  {
    path: "/replay",
    title: "Replay",
    description: "Compare the original and an alternative run.",
    component: ReplayPage,
  },
  {
    path: "/report",
    title: "Learning report",
    description: "Review outcomes and reasoning evidence.",
    component: ReportPage,
  },
  {
    path: "/teacher",
    title: "Teacher view",
    description: "Manage mobile access and review learner reports.",
    component: TeacherPage,
  },
];
