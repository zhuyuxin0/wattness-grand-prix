import { combine, useDay, useLateSeal, useReceipts } from "../../data";
import { PageHeader, Ready, Receipt, Section } from "../../ui";
import { SealedRecord } from "./SealedRecord";
import "./styles.css";

// Seal: the latest sealed operating day as BNB Chain holds it. One root over
// every plan, its commits to GateRecord, the gate the contract computes for
// itself, and the late seal it refused.
export default function SealPage() {
  const day = useDay();
  const receipts = useReceipts();
  const late = useLateSeal();
  const all = combine(day, receipts, late);

  return (
    <div className="page page--seal">
      <PageHeader
        title="The sealed record"
        lede="Every plan for the operating day is one leaf of a single root. GateRecord holds that root on BNB Smart Chain, committed before ERCOT's 10:00 CT day-ahead gate. The contract computes the gate itself and refuses any later seal for the same day."
      />

      <Ready state={all}>
        {([d, r, l]) => (
          <>
            <Section
              className="rw-record"
              source="Plans: Data: ERCOT. Calculation and display: Wattness. Commits: GateRecord on BNB Smart Chain, read from each chain's receipt."
            >
              <SealedRecord day={d} receipts={r} late={l} />
            </Section>

            <Section title="Receipts" lede="Both commits to GateRecord, as each chain's receipt records them." source="Commits: GateRecord on BNB Smart Chain, read from each chain's receipt.">
              <div className="receipt-grid">
                {r.receipts.map((x) => (
                  <Receipt key={x.chainId} receipt={x} />
                ))}
              </div>
            </Section>
          </>
        )}
      </Ready>
    </div>
  );
}
