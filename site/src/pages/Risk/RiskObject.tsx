import { ObjectLead } from "../../ui/ObjectLead";

// Risk's first view: the Risk officer's instrument as the garage stands it (public/renders/agent-risk-officer, with
// its receipt): plan C's 301 scenario totals for Desert Willow on Nov 26 as coins in $250 slots, the worst tenth rimmed.

export function RiskObject() {
  return (
    <ObjectLead
      className="risk-object"
      label="The Risk officer's instrument in 3D"
      still="agent-risk-officer"
      alt="The Risk officer's coin board in 3D: the 301 scenario totals of Desert Willow's sealed Nov 26 plan as coins in $250 slots, the worst tenth rimmed"
      caption="Desert Willow's Nov 26 plan C"
      from="The Risk officer's instrument, from the introduction's garage"
    >
      <p>
        Desert Willow's sealed Nov 26 plan, scenario by scenario: each of its 301 price scenarios is a coin in the $250 slot of that day's total, and the worst
        tenth are rimmed.
      </p>
      <p>Each plan's score is its mean minus half the worst tenth's average loss; the highest score is sealed.</p>
    </ObjectLead>
  );
}
