// The stack's live mount on its own page (src/stations/stack/demo/index.html?theme=dark|light): what the site embeds,
// with onRoute shown as a note and kept in window.__routes for checks (demo/check.mjs).
import { mountStack } from '../mount';

declare global { interface Window { __routes: string[]; __stack: ReturnType<typeof mountStack>; __stackReady?: boolean; __stackError?: string } }

const q = new URLSearchParams(location.search);
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
document.body.style.background = theme === 'light' ? '#e9ecef' : '#101315';
const note = document.getElementById('route')!;
window.__routes = [];
const el = document.getElementById('stack')!;
window.__stack = mountStack(el, {
  theme,
  onRoute: (tab) => {
    window.__routes.push(tab);
    note.textContent = `onRoute("${tab}")`; note.classList.add('on');
    setTimeout(() => note.classList.remove('on'), 1600);
  },
});
window.__stack.ready.then(() => { window.__stackReady = true; }, (e) => { window.__stackError = String(e?.stack ?? e); console.error(e); });
