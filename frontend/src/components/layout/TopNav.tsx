import { Link, useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { findRoutePage } from "@/app/routes/pages";
import { useSessionContext } from "@/lib/useSessionContext";
import { AccountMenu } from "./AccountMenu";
import { DisplaySettings } from "./DisplaySettings";
import { ConnectionBadge } from "./ConnectionBadge";

/**
 * Sticky top bar: navigation trigger, breadcrumb trail, connection state and
 * display settings. It stays static across route changes so navigation feels
 * instant.
 */
export function TopNav() {
  const location = useLocation();
  const { buildHref } = useSessionContext();
  const page = findRoutePage(location.pathname);

  return (
    <header className="app-topnav sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border px-3 md:px-5">
      <SidebarTrigger />
      <Link
        to={buildHref("/")}
        aria-label="MtaaLab home"
        className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-lg bg-primary font-serif text-base font-bold text-primary-foreground"
        >
          M
        </span>
        <span className="hidden text-sm font-bold tracking-tight text-foreground sm:inline">
          MtaaLab
        </span>
      </Link>
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to={buildHref("/")}>Mission</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate font-semibold text-foreground">
              {page?.title ?? "Not found"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ConnectionBadge />
        <AccountMenu />
        <DisplaySettings />
      </div>
    </header>
  );
}
