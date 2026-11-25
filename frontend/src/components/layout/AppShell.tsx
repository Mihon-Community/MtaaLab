import { Suspense, useEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { findRoutePage, routePages } from "@/app/routes/pages";
import { NotFoundPage } from "@/app/routes/NotFoundPage";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { AppSidebar } from "./AppSidebar";
import { TopNav } from "./TopNav";
import { MobileTabBar } from "./MobileTabBar";

/**
 * Application chrome: skip link, sidebar, sticky top bar, routed content and
 * the phone tab bar. Navigation is client-side, so the shell stays mounted and
 * only the main region changes.
 */
export function AppShell() {
  const location = useLocation();
  const page = findRoutePage(location.pathname);
  const [announcement, setAnnouncement] = useState("");
  const isFirstRender = useRef(true);

  useEffect(() => {
    document.title = page
      ? `${page.title} · MtaaLab`
      : "Page not found · MtaaLab";

    // Wait one tick so a lazily loaded route has mounted its heading.
    const timer = window.setTimeout(() => {
      if (!isFirstRender.current) {
        const heading = document.querySelector<HTMLElement>("main h1");
        heading?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, left: 0 });
      }
      isFirstRender.current = false;
      setAnnouncement(page ? `${page.title} page loaded` : "Page not found");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.pathname, page]);

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset>
        <TopNav />
        <div className="px-4 md:px-6">
          <DemoModeBanner />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 outline-none md:px-6 md:pb-10"
        >
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
          <LazyMotion features={domAnimation} strict>
            <m.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  {routePages.map(({ path, component: Page }) => (
                    <Route key={path} path={path} element={<Page />} />
                  ))}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </m.div>
          </LazyMotion>
        </main>
        <footer className="border-t border-border px-4 py-6 text-sm text-muted-foreground md:px-6 print:hidden">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-foreground">MtaaLab</span>
            <span>Explore carefully. Decide together.</span>
          </div>
        </footer>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
