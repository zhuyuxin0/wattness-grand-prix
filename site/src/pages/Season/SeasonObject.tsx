import { ObjectLead } from "../../ui/ObjectLead";

// The season's machine as the introduction builds it (towers.T02-season, without its display; public/renders/
// tower-season, with its receipt). A self-contained lead for the Season tab: the tab places it where its page wants the
// object; the season's figures stay the tab's own, read live.

export function SeasonObject() {
  return (
    <ObjectLead
      className="season-object"
      label="The season's machine in 3D"
      still="tower-season"
      alt="The season purse in 3D: Flap's vending machine with chasing bulbs, its presale tube on the left, the allocation screen in the middle and the prize vault on the right"
      caption="The season purse, as the introduction builds it"
      from="From the introduction"
    >
      <p>
        The season purse: Flap's vending machine, with the presale tube on the left, the allocation screen in the middle and the prize vault on the right.
      </p>
      <p>The season's own figures, read live from BSC testnet, follow.</p>
    </ObjectLead>
  );
}
