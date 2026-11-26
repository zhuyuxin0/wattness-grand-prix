// The tabs' icons (src/ui/tab-icons.ts), held to the side panel's list: every tab names a drawing in the set, no two
// tabs share one, every drawing is line art on its box, Lucide's are credited, and the panel draws the icon beside the
// label, hidden from assistive technology. Run with `pnpm test` (Node 22.18 or later runs the TypeScript directly).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TABS } from "../src/shell/tabs.ts";
import { TAB_ICONS, TAB_ICON_STROKE } from "../src/ui/tab-icons.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const read = (p) => readFileSync(join(site, p), "utf8");

test("every tab has an icon from the set", () => {
  assert.ok(TABS.length > 0);
  for (const t of TABS) {
    assert.equal(typeof t.icon, "string", `the ${t.label} tab has no icon`);
    assert.ok(Object.hasOwn(TAB_ICONS, t.icon), `the ${t.label} tab's icon "${t.icon}" is not in src/ui/tab-icons.ts`);
  }
});

test("no two tabs share an icon", () => {
  const seen = new Map();
  for (const t of TABS) {
    assert.ok(!seen.has(t.icon), `${t.label} and ${seen.get(t.icon)} share the icon "${t.icon}"`);
    seen.set(t.icon, t.label);
  }
});

test("every icon is line art on its box, each path from an absolute move", () => {
  assert.equal(TAB_ICON_STROKE, 1.3);
  for (const [name, icon] of Object.entries(TAB_ICONS)) {
    assert.ok(icon.box === 16 || icon.box === 24, `${name}'s box is ${icon.box}`);
    assert.ok(icon.d.length > 0, `${name} has no paths`);
    assert.match(icon.source, /^(terminal|lucide) /, `${name}'s source is "${icon.source}"`);
    for (const d of icon.d) {
      assert.match(d, /^M[\d.-]/, `a path of ${name} starts "${d.slice(0, 8)}"`);
      assert.match(d, /^[MmLlHhVvCcSsQqAaZz\d.,\s-]+$/, `a path of ${name} holds more than path commands`);
    }
  }
});

test("the drawings adapted from Lucide are credited with its license", () => {
  const lucide = Object.entries(TAB_ICONS).filter(([, i]) => i.source.startsWith("lucide "));
  if (lucide.length === 0) return;
  const notices = readFileSync(resolve(site, "..", "THIRD-PARTY-NOTICES.md"), "utf8");
  assert.match(notices, /## Lucide/);
  assert.match(notices, /ISC License/);
  assert.match(notices, /site\/src\/ui\/tab-icons\.ts/);
  for (const [name, i] of lucide) {
    const icon = i.source.replace(/^lucide /, "").replace(/, adapted$/, "");
    assert.ok(notices.includes(`\`${icon}\``), `the notices do not name Lucide's ${icon} (${name})`);
  }
});

test("the side panel and the phone menu draw the icon before the label, hidden from assistive technology", () => {
  const panel = read("src/shell/SidePanel.tsx");
  assert.match(panel, /<TabIcon name=\{t\.icon\} className="sidenav-icon" \/>\s*<span className="sidenav-label">\{t\.label\}<\/span>/);
  const icon = read("src/ui/TabIcon.tsx");
  assert.match(icon, /aria-hidden="true"/);
  assert.match(icon, /stroke="currentColor"/);
});
