import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { SHOWCASE } from "../config";
import { useDay, type DayIndex, type Loaded } from "../data";
import { useSelectedBattery } from "../shell/battery";
import { BatteryPicker } from "./BatteryPicker";

/** Plain names for the batteries that have one; the rest go by their ERCOT code. */
export const BATTERY_NAMES: Record<string, string> = { [SHOWCASE.resource]: SHOWCASE.name };

export interface BatteryChoice {
  day: Loaded<DayIndex>;
  resource: string;
  choose: (resource: string) => void;
}

/**
 * The battery an agent tab shows: a shared link's ?battery= first, else the one
 * carried from the other battery tabs, else Desert Willow. Choosing one carries
 * it to every battery tab.
 */
export function useBatteryChoice(): BatteryChoice {
  const day = useDay();
  const [params, setParams] = useSearchParams();
  const [carried, carry] = useSelectedBattery();
  const batteries = day.status === "ready" ? day.data.batteries : [];
  const known = (r: string | null): r is string => !!r && (batteries.length === 0 || batteries.some((b) => b.resource === r));
  const asked = params.get("battery");
  const resource = known(asked) ? asked : known(carried) ? carried : SHOWCASE.resource;

  useEffect(() => {
    if (batteries.length > 0) carry(resource);
  }, [resource, batteries.length, carry]);

  const choose = (r: string) => {
    carry(r);
    if (params.has("battery")) {
      const next = new URLSearchParams(params);
      next.set("battery", r);
      setParams(next, { replace: true });
    }
  };
  return { day, resource, choose };
}

/** The picker in a bar under the page's head, as on the Battery tab. */
export function BatteryBar({ choice, children }: { choice: BatteryChoice; children?: ReactNode }) {
  const batteries = choice.day.status === "ready" ? choice.day.data.batteries : [];
  return (
    <div className="battery-bar" role="group" aria-label="Battery">
      <BatteryPicker batteries={batteries} value={choice.resource} names={BATTERY_NAMES} onChange={choice.choose} />
      {children}
    </div>
  );
}
