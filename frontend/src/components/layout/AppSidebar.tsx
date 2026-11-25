import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
  sidebarItemClasses,
  useSidebar,
} from "@/components/ui/sidebar";
import { routeGroups, routePages } from "@/app/routes/pages";
import { useSessionContext } from "@/lib/useSessionContext";
import { cn } from "@/lib/utils";

const SESSION_REASON = "Start a mission first";

/**
 * Persistent navigation. On phones it becomes a focus-trapping sheet; on
 * desktop it collapses to an icon rail. Session-only routes stay visible but
 * disabled with a reason instead of disappearing.
 */
export function AppSidebar() {
  const { collapsed, isMobile, setOpenMobile } = useSidebar();
  const { buildHref, hasSession } = useSessionContext();
  const location = useLocation();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar aria-label="Main navigation">
      <SidebarHeader
        className={cn(
          "border-b border-sidebar-border",
          collapsed && "justify-center px-0",
        )}
      >
        <Link
          to={buildHref("/")}
          onClick={closeMobile}
          aria-label="MtaaLab home"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl rounded-bl-sm bg-primary font-serif text-xl font-bold text-primary-foreground"
          >
            M
          </span>
          {collapsed ? null : (
            <span className="grid gap-0.5">
              <strong className="text-base leading-none tracking-tight">
                MtaaLab
              </strong>
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                The living world lab
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {routeGroups.map((group) => {
          const pages = routePages.filter((page) => page.group === group);
          if (pages.length === 0) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarMenu>
                {pages.map((page) => {
                  const disabled = page.requiresSession && !hasSession;
                  const isActive =
                    !disabled &&
                    (page.path === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(page.path));
                  const Icon = page.icon;

                  return (
                    <SidebarMenuItem key={page.path}>
                      {disabled ? (
                        <span
                          aria-disabled="true"
                          title={SESSION_REASON}
                          className={sidebarItemClasses({
                            collapsed,
                            className: "cursor-not-allowed opacity-55",
                          })}
                        >
                          <Icon aria-hidden="true" size={20} strokeWidth={2} />
                          {collapsed ? (
                            <span className="sr-only">
                              {page.title} — {SESSION_REASON}
                            </span>
                          ) : (
                            <>
                              <span>{page.title}</span>
                              <span className="ml-auto text-[0.65rem] font-semibold uppercase tracking-wide">
                                Locked
                              </span>
                              <span className="sr-only">{SESSION_REASON}</span>
                            </>
                          )}
                        </span>
                      ) : (
                        <NavLink
                          to={buildHref(page.path)}
                          end={page.path === "/"}
                          aria-label={page.title}
                          onClick={closeMobile}
                          className={sidebarItemClasses({
                            isActive,
                            collapsed,
                          })}
                        >
                          <Icon aria-hidden="true" size={20} strokeWidth={2} />
                          {collapsed ? null : <span>{page.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className={cn(collapsed && "items-center px-0")}>
        {isMobile ? null : (
          <div className="flex items-center gap-2">
            <SidebarTrigger className="shrink-0" />
            {collapsed ? null : (
              <span className="text-xs text-muted-foreground">
                Collapse the menu for more space
              </span>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
