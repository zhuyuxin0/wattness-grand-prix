// Two panels fed by other lanes: weather radar (public/data/cournot.json) and
// team data (public/data/memory.json). Each renders only when its file is
// published and holds entries it can read; otherwise it renders nothing.
// Their contents are another system's text, so they are shown as text only
// and only https links are followed.

import { Section } from "../../ui";
import { useOptional } from "./data";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (o: Obj, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};
const numOf = (o: Obj, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};
const httpsUrl = (o: Obj) => {
  const u = str(o, "url", "href", "link");
  return u && /^https:\/\//.test(u) ? u : null;
};

function listOf(doc: unknown, ...keys: string[]): Obj[] {
  if (Array.isArray(doc)) return doc.filter(isObj);
  if (!isObj(doc)) return [];
  for (const k of keys) {
    const v = doc[k];
    if (Array.isArray(v)) return v.filter(isObj);
  }
  return [];
}

/** Entries tagged for one battery show only on its desk; untagged ones show everywhere. */
function forBattery(items: Obj[], resource: string) {
  return items.filter((it) => {
    const r = str(it, "resource", "battery");
    return !r || r === resource;
  });
}

function sourceLine(doc: unknown, fallback: string) {
  if (isObj(doc)) {
    const s = str(doc, "source", "attribution");
    const at = str(doc, "asOf", "as_of", "updatedAt", "generatedAt");
    if (s) return at ? `${s} As of ${at}.` : s;
  }
  return fallback;
}

const pct = (p: number) => `${Math.round((p <= 1 ? p * 100 : p) * 10) / 10}%`;

export function WeatherRadar({ resource }: { resource: string }) {
  const state = useOptional("cournot.json");
  if (state.status !== "ready" || state.data == null) return null;
  const doc = state.data;
  const items = forBattery(listOf(doc, "markets", "odds", "items", "questions"), resource)
    .map((it) => ({
      label: str(it, "question", "label", "title", "name"),
      p: numOf(it, "probability", "p", "yes", "odds"),
      detail: str(it, "resolves", "window", "detail", "location"),
      url: httpsUrl(it),
    }))
    .filter((it) => it.label && it.p !== null && it.p >= 0 && it.p <= 100)
    .slice(0, 6);
  if (!items.length) return null;
  const title = (isObj(doc) && str(doc, "title")) || "Texas weather odds";
  return (
    <Section kicker="Weather radar" title={title} variant="panel" className="pw-panel" source={sourceLine(doc, "Data: Cournot. Display: Wattness.")}>
      <ul className="pw-odds">
        {items.map((it) => (
          <li key={it.label!}>
            <span className="pw-odds__label">
              {it.url ? (
                <a href={it.url} target="_blank" rel="noreferrer">
                  {it.label}
                </a>
              ) : (
                it.label
              )}
              {it.detail && <span className="pw-odds__detail">{it.detail}</span>}
            </span>
            <span className="pw-odds__p num">{pct(it.p!)}</span>
            <span className="pw-odds__bar" aria-hidden="true">
              <span style={{ width: pct(it.p!) }} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TeamData({ resource }: { resource: string }) {
  const state = useOptional("memory.json");
  if (state.status !== "ready" || state.data == null) return null;
  const doc = state.data;
  const items = forBattery(listOf(doc, "items", "notes", "memories", "pages"), resource)
    .map((it) => ({
      title: str(it, "title", "label", "name"),
      text: str(it, "summary", "text", "body", "note"),
      at: str(it, "at", "date", "createdAt", "updatedAt"),
      url: httpsUrl(it),
    }))
    .filter((it) => it.title || it.text)
    .slice(0, 5);
  if (!items.length) return null;
  const title = (isObj(doc) && str(doc, "title")) || "What the desk remembers";
  return (
    <Section kicker="Team data" title={title} variant="panel" className="pw-panel" source={sourceLine(doc, "Memory: Living Brain. Display: Wattness.")}>
      <ul className="pw-memory">
        {items.map((it, i) => (
          <li key={`${it.title ?? ""}${i}`}>
            {it.title && (
              <div className="pw-memory__title">
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noreferrer">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
              </div>
            )}
            {it.text && <p className="pw-memory__text">{it.text.length > 280 ? `${it.text.slice(0, 279)}…` : it.text}</p>}
            {it.at && <div className="pw-memory__at num">{it.at}</div>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
