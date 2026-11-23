import { Link, Route, Routes } from "react-router-dom";
import { routePages } from "./routes/pages";

export default function App() {
  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">MtaaLab · The Living World Simulator</p>
        <nav aria-label="Main navigation">
          {routePages.map(({ path, title }) => (
            <Link key={path} to={path}>
              {title}
            </Link>
          ))}
        </nav>
      </header>
      <Routes>
        {routePages.map(({ path, component: Page }) => {
          return <Route key={path} path={path} element={<Page />} />;
        })}
        <Route path="*" element={<LobbyFallback />} />
      </Routes>
    </main>
  );
}

function LobbyFallback() {
  const Lobby = routePages[0].component;
  return <Lobby />;
}
