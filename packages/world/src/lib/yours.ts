// The reader's own clock beside market time, as the site prints every time: CT first, the reader's own beside it,
// never another fixed zone. On the site that is the browser's zone, left out for a reader whose clock reads as Central;
// a film (the story's capture mode) prints CT alone, since no one watching it has a zone the frame can know.

const CENTRAL = 'America/Chicago';

/** The reader's own zone, from the browser; Central when it cannot be read. */
export const READER_TZ: string = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || CENTRAL; } catch { return CENTRAL; }
})();

const fmt = new Map<string, Intl.DateTimeFormat>();
function wall(unix: number, timeZone: string, o: { seconds?: boolean; date?: boolean }): string {
  let f = fmt.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmt.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(unix * 1000));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const time = `${get('hour')}:${get('minute')}${o.seconds ? `:${get('second')}` : ''}`;
  return o.date ? `${get('month')} ${get('day')}, ${time}` : time;
}

/** True when the frame draws inside one of the story's films (capture mode). */
export const inFilm = (el: Element | null | undefined): boolean => !!el?.closest('.gp-story[data-mode="capture"]');

/** "23:00 yours" ("Nov 25, 23:00 yours" with date) for a unix time, or null for a reader on Central time or in a film. */
export function yours(unix: number, o: { seconds?: boolean; date?: boolean; film?: boolean } = {}): string | null {
  if (o.film) return null;
  const own = wall(unix, READER_TZ, o);
  return own === wall(unix, CENTRAL, o) ? null : `${own} yours`;
}
