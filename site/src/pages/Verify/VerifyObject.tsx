import { ObjectLead } from "../../ui/ObjectLead";

// Verify's first view: the proof as the introduction builds it (chapter 17, as on main): Desert Willow's sealed Nov 26
// plan at the foot of a tower, one rung per hash up to the day's root, and the board's five checks passing
// (public/renders/chapter-check, with its receipt). The check under it is the same one, on any battery.

export function VerifyObject() {
  return (
    <ObjectLead
      className="vf-object"
      label="The proof in 3D"
      still="chapter-check"
      alt="The proof tower in 3D: Desert Willow's sealed Nov 26 plan at its foot, a rung for each hash up to the gold root at the top, beside a board with five checks passing"
      caption="Desert Willow's Nov 26 plan, 5 of 5 checks"
      from="From the introduction, chapter 17"
    >
      <p>
        The proof as a tower: a plan's leaf at the foot, one rung for each hash on the way up, the day's root on top. The board beside it holds the five
        checks, all passing for Desert Willow's sealed Nov 26 plan.
      </p>
      <p>Below, your browser runs the same five checks on any battery.</p>
    </ObjectLead>
  );
}
