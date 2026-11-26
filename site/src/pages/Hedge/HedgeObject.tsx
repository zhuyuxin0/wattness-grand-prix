import { ObjectLead } from "../../ui/ObjectLead";

// Hedge's first view: ElectronX's piece as the stack draws it (chapter 21; public/renders/stack-electronx, with its
// receipt), the instrument the Hedger sizes each hedge on.

export function HedgeObject() {
  return (
    <ObjectLead
      className="hedge-object"
      label="ElectronX's piece in 3D"
      still="stack-electronx"
      alt="ElectronX's piece in 3D: an orange glass column with bands of rings, a strand of the stack running from it"
      caption="ElectronX, in the stack"
      from="From the introduction, chapter 21"
    >
      <p>
        ElectronX in the stack: its published hourly contract terms, the instrument the Hedger sizes each hedge on, priced at an assumed fair-value entry.
      </p>
      <p>Below, the contracts each plan sells or buys, hour by hour, at the battery's hub.</p>
    </ObjectLead>
  );
}
