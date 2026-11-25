import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import * as Slot from "@radix-ui/react-slot";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCookieState, useIsMobile } from "@/lib/useMediaQuery";
import { Sheet, SheetContent, SheetTitle } from "./sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

interface SidebarContextValue {
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  /** Hamburger that opened the phone sheet; focus returns here on close. */
  navigationTriggerRef: RefObject<HTMLElement | null>;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used inside <SidebarProvider>");
  return context;
}

interface SidebarProviderProps {
  children: ReactNode;
  /** Desktop icon-rail state used before the cookie is read. */
  defaultCollapsed?: boolean;
}

/**
 * Owns the desktop icon-rail state (persisted in a cookie) and the phone sheet.
 * The provider is the flex container for the sidebar and its inset content.
 */
export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [storedOpen, setStoredOpen] = useCookieState(
    "sidebar_state",
    !defaultCollapsed,
  );
  // The cookie stores "open"/"closed"; the UI state is "collapsed".
  const collapsed = !storedOpen;
  const setCollapsed = useCallback(
    (next: boolean) => setStoredOpen(!next),
    [setStoredOpen],
  );
  const [openMobile, setOpenMobile] = useState(false);
  const navigationTriggerRef = useRef<HTMLElement | null>(null);

  const value = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      openMobile,
      setOpenMobile,
      collapsed,
      setCollapsed,
      toggleCollapsed: () => setCollapsed(!collapsed),
      navigationTriggerRef,
    }),
    [isMobile, openMobile, setOpenMobile, collapsed, setCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={200}>
        <div className="flex min-h-svh w-full bg-background text-foreground">
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
  ...props
}: ComponentProps<"aside">) {
  const {
    isMobile,
    openMobile,
    setOpenMobile,
    collapsed,
    navigationTriggerRef,
  } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] p-0"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            navigationTriggerRef.current?.focus();
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col gap-2 overflow-y-auto bg-sidebar py-3 text-sidebar-foreground">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      data-state={collapsed ? "collapsed" : "expanded"}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.75rem]" : "w-64",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-4", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col gap-2 border-t border-sidebar-border p-3",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1 px-3", className)} {...props} />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<"div">) {
  const { collapsed } = useSidebar();
  if (collapsed) return null;
  return (
    <div
      className={cn(
        "px-2 py-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("list-none", className)} {...props} />;
}

interface SidebarMenuButtonProps extends ComponentProps<"button"> {
  asChild?: boolean;
  isActive?: boolean;
  /** Label shown in a tooltip while the sidebar is collapsed. */
  tooltip?: string;
}

/**
 * Shared item styling, exported so router links can render with the same visual
 * and focus treatment as buttons (a `<button>` is wrong for navigation).
 */
export function sidebarItemClasses({
  isActive = false,
  collapsed = false,
  className,
}: {
  isActive?: boolean;
  collapsed?: boolean;
  className?: string;
} = {}): string {
  return cn(
    "group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring",
    isActive &&
      "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
    collapsed && "justify-center px-0",
    className,
  );
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  className,
  children,
  ...props
}: SidebarMenuButtonProps) {
  const { collapsed, isMobile } = useSidebar();
  const showTooltip = Boolean(tooltip) && collapsed && !isMobile;
  const Comp = asChild ? Slot.Root : "button";

  const button = (
    <Comp
      data-active={isActive ? "true" : undefined}
      aria-current={isActive ? "page" : undefined}
      aria-label={showTooltip ? tooltip : props["aria-label"]}
      className={sidebarItemClasses({
        isActive,
        collapsed: showTooltip,
        className,
      })}
      {...props}
    >
      {children}
    </Comp>
  );

  if (!showTooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />
  );
}

interface SidebarTriggerProps extends ComponentProps<"button"> {
  collapsedLabel?: string;
  expandedLabel?: string;
}

/**
 * One control for both layouts: on phones it opens the navigation sheet, on
 * desktop it collapses or expands the icon rail.
 */
export function SidebarTrigger({
  className,
  collapsedLabel = "Collapse sidebar",
  expandedLabel = "Expand sidebar",
  ...props
}: SidebarTriggerProps) {
  const {
    isMobile,
    openMobile,
    setOpenMobile,
    collapsed,
    toggleCollapsed,
    navigationTriggerRef,
  } = useSidebar();

  if (isMobile) {
    return (
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={openMobile}
        onClick={(event) => {
          navigationTriggerRef.current = event.currentTarget;
          setOpenMobile(true);
        }}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        <MenuIcon />
      </button>
    );
  }

  const label = collapsed ? expandedLabel : collapsedLabel;
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      onClick={toggleCollapsed}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {collapsed ? (
        <PanelLeftOpen aria-hidden="true" size={20} strokeWidth={2} />
      ) : (
        <PanelLeftClose aria-hidden="true" size={20} strokeWidth={2} />
      )}
    </button>
  );
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
