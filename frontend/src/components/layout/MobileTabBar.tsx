import { NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  ChartColumn,
  Ellipsis,
  LayoutGrid,
  Map,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useSessionContext } from "@/lib/useSessionContext";
import { useOverlayOpen } from "@/lib/useOverlayState";
import { cn } from "@/lib/utils";

interface TabItem {
  path: string;
  label: string;
  icon: LucideIcon;
  requiresSession: boolean;
}

const TAB_ITEMS: TabItem[] = [
  { path: "/", label: "Lobby", icon: LayoutGrid, requiresSession: false },
  { path: "/briefing", label: "Brief", icon: BookOpen, requiresSession: false },
  { path: "/simulation", label: "World", icon: Map, requiresSession: true },
  {
    path: "/report",
    label: "Report",
    icon: ChartColumn,
    requiresSession: true,
  },
];

/**
 * Phone-only bottom tab bar. 44px targets, icon + label + an indicator bar so
 * the active tab never depends on colour alone.
 */
export function MobileTabBar() {
  const location = useLocation();
  const { buildHref, hasSession } = useSessionContext();
  const { setOpenMobile } = useSidebar();
  const overlayOpen = useOverlayOpen();

  if (overlayOpen) return null;

  return (
    <nav
      aria-label="Primary"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden"
    >
      {TAB_ITEMS.map(({ path, label, icon: Icon, requiresSession }) => {
        const disabled = requiresSession && !hasSession;
        const isActive =
          !disabled &&
          (path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(path));

        const content = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0 h-1 w-8 rounded-full transition-opacity",
                isActive ? "bg-primary opacity-100" : "opacity-0",
              )}
            />
            <Icon aria-hidden="true" size={20} strokeWidth={2} />
            <span className="text-[0.65rem] font-semibold">{label}</span>
          </>
        );

        if (disabled) {
          return (
            <span
              key={path}
              aria-disabled="true"
              title="Start a mission first"
              className="relative flex min-h-11 flex-1 cursor-not-allowed flex-col items-center justify-center gap-1 py-2 text-muted-foreground opacity-55"
            >
              {content}
              <span className="sr-only">Start a mission first</span>
            </span>
          );
        }

        return (
          <NavLink
            key={path}
            to={buildHref(path)}
            end={path === "/"}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring",
              isActive && "font-semibold text-foreground",
            )}
          >
            {content}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-label="More navigation"
        className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Ellipsis aria-hidden="true" size={20} strokeWidth={2} />
        <span className="text-[0.65rem] font-semibold">More</span>
      </button>
    </nav>
  );
}
