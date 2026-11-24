import { Link, NavLink, Route, Routes } from "react-router-dom";
import { ContrastToggle } from "../components/ContrastToggle";
import { DemoModeBanner } from "../components/DemoModeBanner";
import { routePages } from "./routes/pages";

export default function App() {
  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="MtaaLab home">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span className="brand-copy">
            <strong>MtaaLab</strong>
            <span>THE LIVING WORLD LAB</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          {routePages.map(({ path, title }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <div className="header-status">
            <span className="status-dot" aria-hidden="true" />
            Learning workspace
          </div>
          <ContrastToggle />
        </div>
      </header>
      <DemoModeBanner />
      <div id="main-content" className="page-content" tabIndex={-1}>
        <Routes>
          {routePages.map(({ path, component: Page }) => {
            return <Route key={path} path={path} element={<Page />} />;
          })}
          <Route path="*" element={<LobbyFallback />} />
        </Routes>
      </div>
      <footer className="site-footer">
        <span>MtaaLab</span>
        <span>Explore carefully. Decide together.</span>
      </footer>
    </main>
  );
}

function LobbyFallback() {
  const Lobby = routePages[0].component;
  return <Lobby />;
}
