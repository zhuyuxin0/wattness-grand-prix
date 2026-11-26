import { ObjectLead } from "../../ui/ObjectLead";
import { ObjectStill } from "../../ui/ObjectStill";

// Seal's first view: the seal as the introduction stamps it (chapter 13, Parc fermé at 09:15:17 CT), with GateRecord
// as the stack draws it, BNB Chain's cube. Both stills draw the first sealed day, Nov 26 (public/renders/, each with
// its receipt); the record below is the day the site shows.

export function SealObject() {
  return (
    <ObjectLead
      className="seal-object"
      label="The seal in 3D"
      still="chapter-sealed"
      alt="Parc fermé in 3D: the gate's clock at 09:15:17 CT and the sealing ring lit gold as the Nov 26 root goes onto BNB Chain"
      caption="Nov 26 plans, sealed 09:15:17 CT on Nov 25"
      from="From the introduction, chapter 13"
    >
      <p>
        Parc fermé: the plans held at the gate. The first sealed day's root, one over all 316 of Nov 26's plans, went onto BNB Chain at 09:15:17 CT on Nov 25,
        before ERCOT's 10:00 CT close.
      </p>
      <ObjectStill
        className="object-lead__aside"
        name="stack-gate"
        alt="GateRecord in 3D: BNB Chain's cube on its pad, the strands of the seal running into it"
        sizes="300px"
      />
      <p>GateRecord, BNB Chain's cube in the stack, keeps one root per operating day and refuses any that comes after its gate.</p>
    </ObjectLead>
  );
}
