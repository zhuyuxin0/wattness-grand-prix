// The opening's words in one place (v2/OPENING.md sections 2 and 3). Every figure is filled from frame-data.json at
// build; the substation's name comes from evidence.json (the Terminal's public fleet reference), the one fact the frame
// data does not carry. Dates are American ("Nov 26"), as on wattness.tech.
import evidence from './evidence.json';

type Showcase = {
  name: string; resource: string; settlement_point: string; hub: string; zone: string; county: string;
  power_mw: number; energy_mwh: number;
};

const HUBS: Record<string, string> = { HB_NORTH: 'North hub', HB_HOUSTON: 'Houston hub', HB_SOUTH: 'South hub', HB_WEST: 'West hub' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-26" as "Nov 26". */
export const dayUS = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${MONTHS[(m ?? 1) - 1]} ${d}`; };
/** "2026-11-25 09:15:17 CT" as "09:15 CT": the 24-hour clock, as the site prints every time. */
export const clock24 = (stamp: string) => {
  const m = /(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::\d{2})? (.+)$/.exec(stamp);
  return m ? `${m[2]}:${m[3]} ${m[4]}` : stamp;
};
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export const SUBSTATION = evidence.substation as string;

/** O01 · This is Desert Willow. */
export function padCopy(s: Showcase, n: { enclosures: number; skids: number }) {
  const encMWh = one(s.energy_mwh / n.enclosures), skidMW = one(s.power_mw / n.skids);
  return {
    head: `This is ${s.name}.`,
    line: `${s.power_mw} MW and ${s.energy_mwh} MWh in ${s.county} County, Texas. To ERCOT the whole site is one battery: ${s.resource}, priced at node ${s.settlement_point}.`,
    enclosures: { text: `${n.enclosures} battery enclosures`, sub: `About ${encMWh} MWh each` },
    skids: { text: 'Inverter and transformer skids', sub: `${n.skids}, about ${skidMW} MW each` },
    substation: { text: `Substation (${SUBSTATION})` },
    line2grid: { text: 'Line to the grid' },
    scope: `Positions schematic, sized at about ${encMWh} MWh an enclosure and ${skidMW} MW a skid. Map point: EIA-860, at the site. ` +
      'Data: ERCOT; US Energy Information Administration. Calculation and display: Wattness.',
  };
}

/** O02 · On the map it stands as one column. */
export function columnCopy(s: Showcase, f: { discharge: number; cycles: number; day: string; arm: string; sealedCT: string; sealedYours: string | null; max: number }) {
  return {
    head: 'On the map it stands as one column.',
    line: `Its height is tomorrow's planned discharge: ${one(f.discharge)} MWh on ${dayUS(f.day)}, about ${one(f.cycles)} of a full cycle.`,
    foot: { text: s.name, sub: `${s.county} County · ${HUBS[s.hub] ?? s.hub} (${s.hub})` },
    top: { text: `Its column: ${one(f.discharge)} MWh planned`, sub: `Operating day ${dayUS(f.day)}` },
    key: 'Height and color: planned discharge, MWh',
    keyEnds: ['0', String(Math.round(f.max))],
    keyMark: one(f.discharge),
    scope: `Its selected plan (arm ${f.arm}), sealed on BNB Chain on ${dayUS(f.sealedCT.slice(0, 10))} at ${clock24(f.sealedCT)}` +
      `${f.sealedYours ? ` (${f.sealedYours})` : ''}. A shadow plan computed from public data, never used to operate the battery.`,
  };
}
