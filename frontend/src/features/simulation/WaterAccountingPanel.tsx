import type { Sector, WaterAccounting } from "../../types/api";

interface WaterAccountingPanelProps {
  accounting: WaterAccounting | null;
  waterUnit: string;
}

/**
 * Shows the auditable one-turn water balance returned by the simulation
 * service. The values are displayed exactly as confirmed; no outcome is
 * calculated here.
 */
export function WaterAccountingPanel({
  accounting,
  waterUnit,
}: WaterAccountingPanelProps) {
  if (!accounting) {
    return (
      <section
        className="surface-card accounting-panel"
        aria-labelledby="accounting-title"
      >
        <p className="eyebrow">Recorded water balance</p>
        <h2 id="accounting-title">One turn in the ledger</h2>
        <p className="briefing-description">
          Submit a decision to see the confirmed opening, inflow, losses, and
          sector withdrawals for that turn.
        </p>
      </section>
    );
  }

  const withdrawals = Object.entries(
    accounting.withdrawals_by_sector,
  ) as [Sector, number][];
  const totalWithdrawals = withdrawals.reduce(
    (sum, [, amount]) => sum + amount,
    0,
  );

  return (
    <section
      className="surface-card accounting-panel"
      aria-labelledby="accounting-title"
    >
      <p className="eyebrow">Recorded water balance</p>
      <h2 id="accounting-title">Confirmed for the latest turn</h2>
      <dl className="accounting-values">
        <div>
          <dt>Opening reservoir</dt>
          <dd>{accounting.opening_reservoir}</dd>
        </div>
        <div>
          <dt>Inflow</dt>
          <dd>+{accounting.inflow}</dd>
        </div>
        <div>
          <dt>Leakage</dt>
          <dd>−{accounting.leakage}</dd>
        </div>
        <div>
          <dt>Overflow</dt>
          <dd>{accounting.overflow}</dd>
        </div>
        <div>
          <dt>Closing reservoir</dt>
          <dd>{accounting.closing_reservoir}</dd>
        </div>
      </dl>

      <h3 className="accounting-subheading">
        Delivered to sectors ({waterUnit})
      </h3>
      <ul className="accounting-withdrawals">
        {withdrawals.map(([sector, amount]) => (
          <li key={sector}>
            <span>{formatLabel(sector)}</span>
            <span>{amount}</span>
          </li>
        ))}
      </ul>

      <p className="accounting-invariant">
        Recorded balance: {accounting.opening_reservoir} opening +{" "}
        {accounting.inflow} inflow = {accounting.closing_reservoir} closing +{" "}
        {round(totalWithdrawals)} delivered + {accounting.leakage} leakage +{" "}
        {accounting.overflow} overflow.
      </p>
    </section>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
