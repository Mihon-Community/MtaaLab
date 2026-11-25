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
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to={buildHref("/")}>Mission</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">
              {page?.title ?? "Not found"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ConnectionBadge />
        <DisplaySettings />
      </div>
    </header>
  );
}
