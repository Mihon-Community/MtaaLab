import {
  formatNumber,
  metricsForScenario,
  numericValue,
  scenarioDisclaimer,
  scenarioTitle,
} from "../../lib/scenarioMetrics";

type State = Record<string, unknown>;

export function PortfolioWorldCanvas({
  scenarioId,
  state,
  units = {},
}: {
  scenarioId: string;
  state: State;
  units?: Record<string, string>;
}) {
  const metrics = metricsForScenario(scenarioId, units).slice(0, 3);
  const turn = numericValue(state, "current_turn");

  return (
    <section
      className="portfolio-world"
      aria-label={`${scenarioTitle(scenarioId)} at turn ${turn}`}
    >
      <div className="portfolio-world-heading">
        <div>
          <p className="eyebrow">Confirmed snapshot</p>
          <h2>{scenarioTitle(scenarioId)}</h2>
        </div>
        <p className="world-turn">Turn {turn}</p>
      </div>
      <ul className="world-metric-grid">
        {metrics.map((metric) => {
          const maximum = metric.maximum?.(state) ?? 100;
          const value = numericValue(state, metric.key);
          const progress = Math.min(100, Math.max(0, (value / maximum) * 100));
          return (
            <li className="world-metric-card" key={metric.label}>
              <div className="world-metric-heading">
                <span>{metric.label}</span>
                <strong>{formatNumber(value)}</strong>
              </div>
              <div className="world-meter" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="world-metric-unit">{metric.unit}</span>
            </li>
          );
        })}
      </ul>
      <p className="world-disclaimer">{scenarioDisclaimer(scenarioId)}</p>
    </section>
  );
}
