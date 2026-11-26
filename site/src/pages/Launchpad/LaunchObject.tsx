import { ObjectLead } from "../../ui/ObjectLead";

// Launchpad's first view: the launch tower as the introduction builds it (towers.T04-launch-graduate, without its
// display; public/renders/tower-launch, with its receipt): graduation, both lamps lit, the shutter open and the
// token's disc on its arc into the pool. The tab's own figures, read live, follow.

export function LaunchObject() {
  return (
    <ObjectLead
      className="launch-object"
      label="The launch tower in 3D"
      still="tower-launch"
      alt="The launch tower in 3D: a glass tower with its lit spiral, both lamps at its gate lit and a token's disc arcing into the pool beside it"
      caption="Graduation, as the introduction draws it"
      from="From the introduction"
    >
      <p>
        The launch tower: the gate at its top opens only with both lamps lit, the token's liquidity and a record sealed before the gate. Here both are lit, the
        shutter is open and the token is on its arc into the pool.
      </p>
      <p>Below, the migrate step that checks both, read live from BSC testnet.</p>
    </ObjectLead>
  );
}
