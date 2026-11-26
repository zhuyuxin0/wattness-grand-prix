import { ObjectLead } from "../../ui/ObjectLead";
import { ObjectStill } from "../../ui/ObjectStill";

// Seal's first view: the seal's stamp as the introduction draws it (chapter 13's gate at 09:15:17 CT), with the record
// coin of chapter 17, the day's root on BNB Chain at the top of every plan's proof. Both stills draw the first sealed
// day, Nov 26 (public/renders/, each with its receipt); the record below is the day the site shows.

export function SealObject() {
  return (
    <ObjectLead
      className="seal-object"
      label="The seal in 3D"
      still="seal-stamp"
      alt="The seal's stamp in 3D: Parc fermé's gate with its clock at 09:15:17 CT and the sealing ring lit gold as the Nov 26 root goes onto BNB Chain"
      caption="Nov 26 plans, sealed 09:15:17 CT on Nov 25"
      from="From the introduction, chapter 13"
    >
      <p>
        The stamp: Parc fermé's gate as its clock reaches 09:15:17 CT on Nov 25, when the first sealed day's root, one over all 316 of Nov 26's plans, went
        onto BNB Chain before ERCOT's 10:00 CT close.
      </p>
      <ObjectStill
        className="object-lead__aside"
        name="record-coin"
        alt="The record coin in 3D: a gold coin bearing BNB Chain's symbol"
        sizes="300px"
      />
      <p>The record coin: the day's root on BNB Chain, at the top of every plan's proof. GateRecord keeps one per operating day and refuses any that comes after its gate.</p>
    </ObjectLead>
  );
}
