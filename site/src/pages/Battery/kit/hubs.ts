// The hub side of the day's price scenarios (scripts/data/forecast.mjs writes
// public/data/forecast/hubs.json): per hub, the settlement price of each history
// day's scenario and its bands, plus the forecast's reference days.

import { fetchJson, useLoad } from "../../../data";

export interface HubBands {
  p05: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  mean: number[];
}

export interface HubsDoc {
  schema: "grand-prix.forecast-hubs.v1";
  operatingDay: string;
  units: "cents per MWh";
  quantity: string;
  count: number;
  reference: { dayType: string; lagDays: number; days: { day: string; weight: number }[] };
  historyDays: string[];
  basisDays: string[];
  hubs: Record<string, { batteries: number; bands: HubBands; paths: number[][] }>;
}

export const useHubs = () => useLoad(() => fetchJson<HubsDoc>("forecast/hubs.json"), "forecast:hubs");
