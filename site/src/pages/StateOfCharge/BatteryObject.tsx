import { ObjectLead } from "../../ui/ObjectLead";

// State of Charge's first view: the battery itself, opened (public/renders/battery-cells, with its receipt): the
// landing intro's enclosure, the roof lifted, the front wall slid out and one module pulled onto its cart over its cells.

export function BatteryObject() {
  return (
    <ObjectLead
      className="soc-object"
      label="The battery in 3D"
      still="battery-cells"
      alt="A battery enclosure in 3D, opened: its roof lifted, its front wall slid out, racks of cell modules inside and one module pulled onto a cart with its lid up"
      caption="A battery enclosure, opened"
      from="In 3D"
    >
      <p>
        Inside a grid battery like Desert Willow's: racks of cell modules in a steel enclosure, one pulled onto its cart with the lid up over its cells.
      </p>
      <p>Each plan below keeps the battery's state of charge inside its limits, hour by hour.</p>
    </ObjectLead>
  );
}
