import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  BookOpen,
  ChartColumn,
  GitCompareArrows,
  GraduationCap,
  LayoutGrid,
  Map,
  type LucideIcon,
} from "lucide-react";
import { routeNeedsSession } from "@/lib/useSessionContext";

export type RouteGroup = "Mission" | "Review" | "Teacher";

export interface RoutePage {
  path: string;
  title: string;
  description: string;
  group: RouteGroup;
  icon: LucideIcon;
  /** Routes that cannot show anything useful before a mission starts. */
  requiresSession: boolean;
  component: LazyExoticComponent<ComponentType>;
}

/**
 * Route table for the whole app. Each screen is its own lazy chunk so the shell
 * stays small; Phaser, Recharts and motion load only with the routes that use them.
 */
export const routePages: RoutePage[] = [
  {
    path: "/",
    title: "Mission lobby",
    description: "Missions assigned to your classes.",
    group: "Mission",
    icon: LayoutGrid,
    requiresSession: false,
    component: lazy(() =>
      import("@/features/mission-lobby/LobbyPage").then((module) => ({
        default: module.LobbyPage,
      })),
    ),
  },
  {
    path: "/briefing",
    title: "Briefing",
    description: "Mission objectives, rules and controls.",
    group: "Mission",
    icon: BookOpen,
    requiresSession: false,
    component: lazy(() =>
      import("@/features/briefing/BriefingPage").then((module) => ({
        default: module.BriefingPage,
      })),
    ),
  },
  {
    path: "/simulation",
    title: "Simulation",
    description: "Inspect the world and make a confirmed decision.",
    group: "Mission",
    icon: Map,
    requiresSession: true,
    component: lazy(() =>
      import("@/features/simulation/SimulationPage").then((module) => ({
        default: module.SimulationPage,
      })),
    ),
  },
  {
    path: "/replay",
    title: "Replay",
    description: "Compare the original and an alternative run.",
    group: "Review",
    icon: GitCompareArrows,
    requiresSession: true,
    component: lazy(() =>
      import("@/features/replay/ReplayPage").then((module) => ({
        default: module.ReplayPage,
      })),
    ),
  },
  {
    path: "/report",
    title: "Learning report",
    description: "Review outcomes and reasoning evidence.",
    group: "Review",
    icon: ChartColumn,
    requiresSession: true,
    component: lazy(() =>
      import("@/features/learning-report/ReportPage").then((module) => ({
        default: module.ReportPage,
      })),
    ),
  },
  {
    path: "/teacher",
    title: "Teacher view",
    description: "Review assigned missions and learner reports.",
    group: "Teacher",
    icon: GraduationCap,
    requiresSession: false,
    component: lazy(() =>
      import("@/features/teacher-view/TeacherPage").then((module) => ({
        default: module.TeacherPage,
      })),
    ),
  },
];

export const routeGroups: RouteGroup[] = ["Mission", "Review", "Teacher"];

/** Find the route entry for a pathname, ignoring the query string. */
export function findRoutePage(pathname: string): RoutePage | undefined {
  if (pathname !== "/" && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return routePages.find((page) => page.path === pathname);
}

export { routeNeedsSession };
