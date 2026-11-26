import type { ReactNode } from "react";
import type { BandPane } from "../../float/band";
import type { BandSpec } from "../../float/band-model";

// The control room's panes as dock panes (RoomBand.tsx; src/float/band.tsx), where the room is 1000px wide or more:
// the parts ControlRoom.tsx stands round the landscape, as panes the reader drags, resizes, closes and brings back from
// the Panes menu, with Reset layout. The default arrangement keeps the room's own: the seal and Verify down the left
// under the page's head, the morph and the Fleet board down the right, Ask Ness under the landscape's middle, "Start
// where you are" along the foot, the middle above Ask Ness open. Each pane opens at its contents' height (the band
// measures them; the heights here are the first guess, near 1440 wide). No JSX here, so the tests run it in Node
// (test/room-band.test.mjs).

export type RoomPart = "seal" | "verify" | "morph" | "fleet" | "ness" | "start";

/** The panes in the room's reading order: their names (as their parts title them), where each stands, its height. */
export const ROOM_PANES: readonly (BandSpec & { id: RoomPart; title: string })[] = [
  { id: "seal", title: "Latest Seal", side: "left", h: 296 },
  { id: "verify", title: "Verify a Plan", side: "left", h: 192 },
  { id: "morph", title: "Sealed on BNB Chain", side: "right", h: 310 },
  { id: "fleet", title: "Fleet Board", side: "right", h: 298 },
  { id: "ness", title: "Ask Ness", side: "middle", w: 470, h: 170, min: { w: 300, h: 120 } },
  { id: "start", title: "Start Where You Are", side: "bottom", h: 245, min: { w: 640, h: 120 } },
];

/** Where this browser keeps the room's arrangement. */
export const ROOM_KEY = "gp.room";

/** Narrower than this the room shows its own column (the room's grid takes the same breakpoint). */
export const ROOM_MIN_WIDTH = 1000;

/** The columns' least width: the room's own grid's (control-room.css, 340 px and 344 px), which the morph's stage needs
 *  to frame its closing lockup. */
export const ROOM_COLUMN = 340;

/** The room kept under the foot's panes where Ask Ness is built: its launcher floats at the window's bottom right, and
 *  the room's own grid keeps the same 64 px (control-room.css). */
export const ROOM_BOTTOM_WITH_NESS = 64;

export type RoomParts = Readonly<Partial<Record<RoomPart, ReactNode>>>;

/**
 * The band's panes from the room's parts, in the room's order: a part the build leaves out (undefined) is no pane, and
 * a part still waiting for its data (null) holds its place with `waiting`.
 */
export function roomPanes(parts: RoomParts, waiting: ReactNode): BandPane[] {
  return ROOM_PANES.filter((p) => parts[p.id] !== undefined).map((p) => ({ ...p, content: parts[p.id] ?? waiting }));
}
