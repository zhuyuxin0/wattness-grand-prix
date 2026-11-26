import type { ReactNode } from "react";
import { PaneBand } from "../../float/band";
import { Loading } from "../../ui";
import { ROOM_BOTTOM_WITH_NESS, ROOM_KEY, ROOM_MIN_WIDTH, roomPanes, type RoomParts } from "./room-band";
import "./room-band.css";

/**
 * The control room's panes as dock panes from 1000px of room (room-band.ts): the page's head in the top left corner,
 * the Panes menu in the top right, the band at least one view tall and taller where the panes ask for it, the room for
 * Ask Ness's launcher kept at its foot. Narrower, the room's own column (`stacked`) as it was.
 */
export function RoomBand({ head, parts, stacked }: { head: ReactNode; parts: RoomParts; stacked: ReactNode }) {
  return (
    <PaneBand
      storageKey={ROOM_KEY}
      label="Control room panes"
      panes={roomPanes(parts, <Loading />)}
      minWidth={ROOM_MIN_WIDTH}
      foot="full"
      bottom={parts.ness === undefined ? undefined : ROOM_BOTTOM_WITH_NESS}
      grow
      bar={head}
      stacked={stacked}
    />
  );
}
