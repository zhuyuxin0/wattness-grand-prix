// The Memory tab's mount on its own page (src/stations/brain/demo/index.html?theme=dark|light&brain=&page=): what the
// site embeds, standing in for its host. The page's query holds the view (brain, page), as the site's hash route does
// (#/agents/memory?brain=&page=): onState writes it (a brain focused pushes a history entry, a page selected replaces
// it) and the browser's back and forward go back through it. onRoute is shown as a note and kept in window.__routes.
import { mountBrain, type BrainState } from '../mount';

declare global { interface Window { __routes: string[]; __states: BrainState[]; __brain: ReturnType<typeof mountBrain>; __brainReady?: boolean; __brainError?: string } }

const q = new URLSearchParams(location.search);
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
const note = document.getElementById('route')!;
window.__routes = []; window.__states = [];
// the site's tabs (gatelock site/src/shell/tabs.ts), the ones the pages map to
const TABS = [
  ['intro', 'Intro'], ['overview', 'Overview'], ['fleet', 'Fleet'], ['battery', 'Battery'], ['forecast', 'Forecast'], ['state', 'State of Charge'],
  ['hedge', 'Hedge'], ['risk', 'Risk'], ['memory', 'Memory'], ['seal', 'Seal'], ['verify', 'Verify'], ['files', 'Files'], ['about', 'How It Works'],
  ['add-agent', 'Add Your Agent'], ['season', 'Season'], ['launchpad', 'Launchpad'], ['prices', 'Prices'], ['one-plan', 'ONE PLAN'],
].map(([id, label]) => ({ id: id!, label: label! }));
const sync = (s: BrainState, push: boolean) => {
  const p = new URLSearchParams(location.search);
  p.set('brain', s.brain);
  if (s.page) p.set('page', s.page); else p.delete('page');
  history[push ? 'pushState' : 'replaceState'](null, '', `?${p}`);
};
const el = document.getElementById('brain')!;
window.__brain = mountBrain(el, {
  theme,
  tabs: TABS,
  initial: { brain: (q.get('brain') as BrainState['brain']) ?? 'all', page: q.get('page') },
  onRoute: (tab) => {
    window.__routes.push(tab);
    note.textContent = `onRoute("${tab}")`; note.classList.add('on');
    setTimeout(() => note.classList.remove('on'), 1600);
  },
  onState: (s, how) => { window.__states.push(s); sync(s, how.history === 'push'); },
});
addEventListener('popstate', () => {
  const p = new URLSearchParams(location.search);
  window.__brain.goTo({ brain: (p.get('brain') as BrainState['brain']) ?? 'all', page: p.get('page') });
});
window.__brain.ready.then(() => { window.__brainReady = true; }, (e) => { window.__brainError = String(e?.stack ?? e); console.error(e); });
