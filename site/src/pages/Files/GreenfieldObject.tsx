import { ObjectLead } from "../../ui/ObjectLead";

// Files' first view: BNB Greenfield's piece as the stack draws it (chapter 21; public/renders/stack-greenfield, with
// its receipt): the sealed day's files as trays in a public bucket, under GateRecord's cube.

export function GreenfieldObject() {
  return (
    <ObjectLead
      className="files-object"
      label="BNB Greenfield's piece in 3D"
      still="stack-greenfield"
      alt="BNB Greenfield's piece in 3D: stacked glass trays of file tiles marked with BNB Chain's symbol, GateRecord's cube glowing above them"
      caption="BNB Greenfield, in the stack"
      from="From the introduction, chapter 21"
    >
      <p>BNB Greenfield in the stack: the sealed day's files as trays in a public bucket, under GateRecord's cube.</p>
      <p>Fetch any file below and compare its SHA-256 with the one listed.</p>
    </ObjectLead>
  );
}
