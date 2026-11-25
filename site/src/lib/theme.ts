// The theme, as wattness.tech keeps it (apps/mms/src/ui/theme.ts, copied): the
// default follows the system, one button flips the theme in use, and a choice is
// remembered under the same key (each origin keeps its own storage). index.html
// paints data-theme before first paint; chooseTheme() takes over before React
// mounts. A hold draws one appearance over the visitor's own, as the Terminal's
// intro does for its dark stage.

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = typeof THEME_PREFERENCES[number];
export type Theme = Exclude<ThemePreference, 'system'>;
export const THEME_KEY = 'mms.theme';
/** The page ground per theme, for the browser's own chrome. */
const THEME_COLOR: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#191d21' };
export const isThemePreference = (x: unknown): x is ThemePreference => THEME_PREFERENCES.includes(x as ThemePreference);
export const resolveTheme = (preference: ThemePreference, systemDark: boolean): Theme =>
  preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
/** A visitor who has not chosen (nothing saved, or storage blocked or unreadable) sees the Terminal as the computer is
 *  set, light or dark (Jo, Nov 2, call 4a; it opened Light from Oct 28). A choice is remembered. The landing's intro
 *  still draws dark, through a hold (holdTheme). */
export const DEFAULT_PREFERENCE: ThemePreference = 'system';

type ThemeEnvironment = {
  read(): unknown; write(preference: ThemePreference): void;
  systemDark(): boolean; paint(theme: Theme, preference: ThemePreference): void;
};
/** Saved intent and effective appearance are separate: an OS change cannot replace an explicit choice. A hold (the
 *  landing's intro, drawn for the dark stage) paints one appearance over the visitor's own until it is let go; a choice
 *  made meanwhile is saved and shows when the hold ends. */
export function createThemeController(env: ThemeEnvironment) {
  let preference: ThemePreference = DEFAULT_PREFERENCE, effective: Theme = resolveTheme(DEFAULT_PREFERENCE, false), held: Theme | null = null;
  const subs = new Set<() => void>();
  const draw = () => {
    effective = held ?? resolveTheme(preference, env.systemDark()); env.paint(effective, preference);
    for (const fn of [...subs]) fn();
  };
  return {
    preference: () => preference, effective: () => effective, held: () => held,
    /** What the visitor's own choice draws, hold or not. */
    own: () => resolveTheme(preference, env.systemDark()),
    subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    choose() {
      let saved: unknown;
      try { saved = env.read(); } catch { /* storage blocked: the default */ }
      preference = isThemePreference(saved) ? saved : DEFAULT_PREFERENCE; draw(); return preference;
    },
    hold(theme: Theme | null) { if (held === theme) return; held = theme; draw(); },
    pick(next: ThemePreference) {
      if (!isThemePreference(next)) return;
      preference = next;
      try { env.write(next); } catch { /* the appearance still changes if storage is blocked */ }
      draw();
    },
    systemChanged() { draw(); },
  };
}

type Runtime = { controller: ReturnType<typeof createThemeController>; media: MediaQueryList | null; listening: boolean };
const sharedKey = Symbol.for('wattness.theme');
const shared = globalThis as typeof globalThis & { [sharedKey]?: Runtime };
const runtime: Runtime = shared[sharedKey] ?? (shared[sharedKey] = {
  media: null, listening: false,
  controller: createThemeController({
    read: () => localStorage.getItem(THEME_KEY), write: (preference) => localStorage.setItem(THEME_KEY, preference),
    systemDark: () => runtime.media?.matches ?? false,
    paint(theme, preference) {
      if (typeof document === 'undefined') return;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      // The browser's own chrome follows the theme in use, not only the system's.
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_COLOR[theme];
    },
  }),
});
export const themePreference = runtime.controller.preference;
export const themeInUse = runtime.controller.effective;
export const onThemeChange = runtime.controller.subscribe;
export const setTheme = runtime.controller.pick;

/** Draws the whole page in one appearance (the intro: dark) until called with null, which returns the visitor's own;
 *  with `fade`, through a short cross-fade (a view transition where the browser has one). The transition applies
 *  the latest request when it runs, so a hold asked for in the meantime is kept. */
type Fade = { finished: Promise<void>; ready: Promise<void>; skipTransition(): void };
let wanted: Theme | null = null;
let fading: Promise<void> = Promise.resolve();
/** A cross-fade asked for whose update has not run yet (the page still shows its old picture). */
let unrun: Fade | null = null;
export function holdTheme(theme: Theme | null, { fade = false }: { fade?: boolean } = {}) {
  const c = runtime.controller;
  wanted = theme;
  const next = theme ?? c.own();
  // A cross-fade taken back before its update has run (the page would end as it is) is skipped; the update still runs,
  // with the hold kept. React's StrictMode does this to the landing's hold in development, letting go with a fade and
  // holding again at once: the transition cross-faded the same picture for 0.4 s or more (about a second while the
  // intro loads), and every click meanwhile landed on <html>, Skip the Intro's included (29 Oct).
  if (unrun && next === c.effective()) { const t = unrun; unrun = null; t.skipTransition(); }
  const doc = typeof document !== 'undefined' ? document as Document & { startViewTransition?(cb: () => void): Fade } : null;
  if (!fade || !doc?.startViewTransition || next === c.effective()
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) { c.hold(theme); return; }
  const root = doc.documentElement;
  root.classList.add('theme-fade');
  try {
    let t: Fade | null = null;
    t = doc.startViewTransition(() => { if (unrun === t) unrun = null; c.hold(wanted); });
    unrun = t;
    t.ready.catch(() => {}); // a skipped transition rejects it ("Transition was skipped"): nothing to report
    fading = t.finished.catch(() => {}).finally(() => root.classList.remove('theme-fade'));
  } catch { root.classList.remove('theme-fade'); c.hold(theme); }
}
/** Resolves once the last cross-fade (holdTheme with `fade`) has finished, at once when none runs: the landing starts
 *  its heavy work after the intro's theme has come back, not under the fade. */
export const themeSettled = (): Promise<void> => fading;

/** Run before React mounts, so the opening page and native controls use the saved appearance. */
export function chooseTheme(): ThemePreference {
  if (typeof window !== 'undefined' && !runtime.listening) {
    runtime.media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const changed = () => runtime.controller.systemChanged();
    runtime.media?.addEventListener('change', changed);
    window.addEventListener('storage', (e) => { if (e.key === THEME_KEY || e.key === null) runtime.controller.choose(); });
    runtime.listening = true;
  }
  return runtime.controller.choose();
}
