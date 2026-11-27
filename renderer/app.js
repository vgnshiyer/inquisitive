'use strict';

// A rail of tabs, the library beside it, and a page that takes the window when something is
// opened. The library is kept by the main process (library.js): the books in a folder, and a
// file of what is known about them. EPUBs and PDFs can be added and read, and articles saved
// from the web. Opened with ?sample the app shows the stand-ins below instead, and keeps
// nothing: that is for working on how it looks.
// The stand-in books' chapters, for the reader's contents.
const CHAPTERS = {
  geb: ['The MU-puzzle', 'Meaning and Form in Mathematics', 'Figure and Ground', 'Consistency, Completeness, and Geometry', 'Recursive Structures and Processes', 'The Location of Meaning', 'The Propositional Calculus', 'Typographical Number Theory', 'Mumon and Gödel', 'Levels of Description, and Computer Systems', 'Brains and Thoughts', 'Minds and Thoughts', 'BlooP and FlooP and GlooP', 'On Formally Undecidable Propositions of TNT and Related Systems', 'Jumping out of the System', 'Self-Ref and Self-Rep', 'Church, Turing, Tarski, and Others', 'Artificial Intelligence: Retrospects', 'Artificial Intelligence: Prospects', 'Strange Loops, Or Tangled Hierarchies'],
  state: ['Nature and Space', 'Cities, People, and Language', 'Authoritarian High Modernism', 'The High-Modernist City', 'The Revolutionary Party', 'Soviet Collectivization, Capitalist Dreams', 'Compulsory Villagization in Tanzania', 'Taming Nature', 'Thin Simplifications and Practical Knowledge', 'Conclusion'],
  gene: ['Why Are People?', 'The Replicators', 'Immortal Coils', 'The Gene Machine', 'Aggression: Stability and the Selfish Machine', 'Genesmanship', 'Family Planning', 'Battle of the Generations', 'Battle of the Sexes', 'You Scratch My Back, I’ll Ride on Yours', 'Memes: The New Replicators', 'Nice Guys Finish First', 'The Long Reach of the Gene'],
  hamming: ['Orientation', 'Foundations of the Digital Revolution', 'History of Computers: Hardware', 'History of Computers: Software', 'History of Computer Applications', 'Limits of Computer Applications: AI I', 'Artificial Intelligence II', 'Artificial Intelligence III', 'n-Dimensional Space', 'Coding Theory I', 'Coding Theory II', 'Error-Correcting Codes', 'Information Theory', 'Digital Filters I', 'Digital Filters II', 'Digital Filters III', 'Digital Filters IV', 'Simulation I', 'Simulation II', 'Simulation III', 'Fiber Optics', 'Computer-Aided Instruction', 'Mathematics', 'Quantum Mechanics', 'Creativity', 'Experts', 'Unreliable Data', 'Systems Engineering', 'You Get What You Measure', 'You and Your Research'],
};
// The stand-in items. A book also has its chapters, and the one it is open at. Their dates
// are written as days ago, and turned into times when they are used.
const SAMPLE = [
  { id: 'geb', kind: 'book', title: 'Gödel, Escher, Bach', author: 'Douglas Hofstadter', pages: 777, progress: 0.34, added: 40, opened: 0, collection: 'math', chapters: CHAPTERS.geb, chapter: 7 },
  { id: 'shannon', kind: 'pdf', title: 'A Mathematical Theory of Communication', author: 'Claude Shannon', pages: 55, progress: 0.12, added: 12, opened: 3, collection: 'math' },
  { id: 'research', kind: 'article', title: 'You and Your Research', author: 'Richard Hamming', minutes: 45, progress: 1, added: 30, opened: 20, finished: 20, collection: 'science' },
  { id: 'state', kind: 'book', title: 'Seeing Like a State', author: 'James C. Scott', pages: 445, progress: 0, added: 2, collection: 'society', chapters: CHAPTERS.state, chapter: 1 },
  { id: 'bitter', kind: 'article', title: 'The Bitter Lesson', author: 'Rich Sutton', minutes: 6, progress: 1, added: 9, opened: 9, finished: 9, collection: 'computing' },
  { id: 'gene', kind: 'book', title: 'The Selfish Gene', author: 'Richard Dawkins', pages: 360, progress: 0.61, added: 25, opened: 1, collection: 'science', chapters: CHAPTERS.gene, chapter: 8 },
  { id: 'attention', kind: 'pdf', title: 'Attention Is All You Need', author: 'Ashish Vaswani and others', pages: 15, progress: 0, added: 1, collection: 'computing' },
  { id: 'hamming', kind: 'book', title: 'The Art of Doing Science and Engineering', author: 'Richard Hamming', pages: 376, progress: 0.08, added: 5, opened: 6, chapters: CHAPTERS.hamming, chapter: 3 }, // in no collection
];

const KINDS = { book: 'Book', pdf: 'PDF', article: 'Article' };
// The collections: each a name and a colour (a number from style.css), which its items wear.
// Both can be changed on the Collections page. Nothing is kept between runs yet.
const collections = [
  { id: 'math', name: 'Mathematics', hue: 1 },
  { id: 'science', name: 'Science', hue: 0 },
  { id: 'society', name: 'Society', hue: 6 },
  { id: 'computing', name: 'Computing', hue: 3 },
];
const HUES = ['Green', 'Violet', 'Yellow', 'Blue', 'Tan', 'Pink', 'Orange']; // the colours a collection can take, by number
const PLAIN = 7; // the colour of an item in no collection

// On Library and Collections: the kinds that can be shown (as a button says it, and as a
// sentence does), and the orders the items can be put in, in the groups the sort menu shows.
const FILTERS = [
  ['all', 'All', 'items'],
  ['book', 'Books', 'books'],
  ['pdf', 'PDFs', 'PDFs'],
  ['article', 'Articles', 'articles'],
];
const when = (time) => time ?? 0; // something never opened was opened longest ago
const SORTS = [
  ['Last opened', [['opened', 'Recently opened', (a, b) => when(b.opened) - when(a.opened)], ['unopened', 'Longest unopened', (a, b) => when(a.opened) - when(b.opened)]]],
  ['Date added', [['added', 'Recently added', (a, b) => b.added - a.added], ['oldest', 'Oldest added', (a, b) => a.added - b.added]]],
  ['Title', [['az', 'A → Z', (a, b) => a.title.localeCompare(b.title)], ['za', 'Z → A', (a, b) => b.title.localeCompare(a.title)]]],
  ['Progress', [['most', 'Most read', (a, b) => b.progress - a.progress], ['least', 'Least read', (a, b) => a.progress - b.progress]]],
];
/** The order with this name: [its name, what a button calls it, how it compares two items]. */
const sortOf = (id) => SORTS.flatMap(([, orders]) => orders).find(([key]) => key === id);

const RECENT = 4; // how many of the latest additions Home shows
const MORE = 3; // how many started items Home shows after the one to carry on with
const STALE = 30; // days unopened after which a started item leaves Home (it stays in Library)
const NEAR = 0.8; // how far through a thing is close to finishing
const CLOSE = 4; // how many of those Home shows

// The tabs on the rail (their buttons are in index.html). Home is a page of its own: what to
// carry on with, and what is new. Library, Finished and Collections are ways of looking at
// the library; Collections is a page of shelves, one for each collection.
const TABS = [
  { id: 'home', name: 'Home', home: true },
  { id: 'library', name: 'Library', test: () => true, tools: true },
  { id: 'finished', name: 'Finished', test: (item) => item.progress >= 1, dated: true, empty: 'What you finish reading is kept here.' },
  { id: 'collections', name: 'Collections', shelves: true },
  { id: 'settings', name: 'Settings', settings: true }, // a page of its own: the app's settings
];

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const DAY = 864e5;
/** How many days ago a time was, by the calendar: 0 for today, 1 for yesterday. */
const daysSince = (time) => Math.round((new Date().setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / DAY);

// Opened with ?sample (main.js does it when INQUISITIVE_SAMPLE is set), the app shows the
// stand-ins and keeps nothing. Otherwise its items and collections are the library's, which
// arrive a moment after the window opens (see the foot of this file) and are kept as they
// change (save).
const SAMPLING = new URLSearchParams(location.search).has('sample');
const past = (days) => (days == null ? undefined : Date.now() - days * DAY);
let items = SAMPLING ? SAMPLE.map((item) => ({ ...item, added: past(item.added), opened: past(item.opened), finished: past(item.finished) })) : [];
if (!SAMPLING) collections.length = 0;

let kept = ''; // the library as it was last kept
let keeping = 0;

/** Keeps the library, a moment after it last changed; at once, if asked. */
function save(now) {
  if (SAMPLING) return;
  clearTimeout(keeping);
  const write = () => {
    const state = JSON.stringify({ items, collections, read: spent });
    if (state === kept) return;
    kept = state;
    window.api.library.save(JSON.parse(state));
  };
  if (now) write();
  else keeping = setTimeout(write, 400);
}
window.addEventListener('beforeunload', () => save(true));

// ---------- how long you read ----------
// Kept by the day, in seconds: { '2026-11-26': 1840 }, in the library's own file (as `read`). The clock
// runs while something is open in the reader, the window is in front, and there has been
// some sign of you (a scroll, a key, the pointer) in the last few minutes.
const TICK = 15; // seconds between one count and the next
const IDLE = 180; // seconds without a sign of you after which the clock stops
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** A day so many days back from today. */
const daysBack = (n) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - n);
  return date;
};
// (With the stand-ins: a week of made-up reading, so that Home has something to show.)
let spent = SAMPLING ? Object.fromEntries([12, 20, 41, 88, 0, 62, 35].map((minutes, n) => [dayOf(daysBack(n)), minutes * 60]).filter(([, seconds]) => seconds)) : {};
let stirred = 0; // when you last did anything
for (const sign of ['keydown', 'mousedown', 'mousemove', 'wheel', 'scroll']) window.addEventListener(sign, () => (stirred = Date.now()), { passive: true, capture: true });
const attending = () => Boolean(open) && !document.hidden && document.hasFocus() && Date.now() - stirred < IDLE * 1000;
/** Adds to today's reading. */
function count(seconds) {
  const day = dayOf(new Date());
  spent[day] = (spent[day] ?? 0) + seconds;
  save();
}
setInterval(() => attending() && count(TICK), TICK * 1000);

/** A length of time, in hours and minutes: "42 min", "3 h 12 min". */
function span(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? (minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`) : `${minutes} min`;
}

/** The seven days of this week, each with how long was read on it. (A week begins on the day
    it does where you are: Monday in most places, Sunday in some.) */
function week() {
  let first = 1; // 1 is Monday, 7 Sunday
  try {
    const locale = new Intl.Locale(navigator.language);
    first = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1;
  } catch {
    // not somewhere that says: Monday
  }
  const gone = (new Date().getDay() - (first % 7) + 7) % 7; // days of this week before today
  return Array.from({ length: 7 }, (_, n) => {
    const date = daysBack(gone - n);
    return { date, seconds: spent[dayOf(date)] ?? 0, ahead: n > gone };
  });
}

/** Beside Home's heading: how long you have read this week, and a bar for each of its days.
    Nothing, in a week with no reading in it yet. */
function weekly() {
  const days = week();
  const all = days.reduce((sum, day) => sum + day.seconds, 0);
  if (!all) return null;
  const most = Math.max(...days.map((day) => day.seconds));
  const made = el('div', 'week');
  const bars = el('div', 'week-bars');
  for (const day of days) {
    const column = el('span', day.ahead ? 'ahead' : day.seconds ? '' : 'none');
    const bar = el('i');
    if (day.seconds) bar.style.height = Math.max(3, Math.round((day.seconds / most) * 28)) + 'px';
    column.append(bar);
    if (!day.ahead) column.dataset.tip = `${day.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${day.seconds ? span(day.seconds) : 'nothing read'}`;
    bars.append(column);
  }
  const words = el('div', 'week-words');
  words.append(el('span', 'week-name', 'This week'), el('span', 'week-time', span(all)));
  made.append(bars, words);
  return made;
}

/** What Home says in place of its name: the time of day. */
const greeting = (hour = new Date().getHours()) => (hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening');

// What an empty library shows in place of items: a line worth reading.
const QUOTE = { text: 'The only true wisdom is in knowing you know nothing.', by: 'Socrates' };
let tab = TABS[0]; // the tab chosen on the rail
let open = null; // the item being read, if any
// Which kinds Library and Collections each show, and in what order. Each keeps its own.
const looks = { library: { kind: 'all', sort: 'opened' }, collections: { kind: 'all', sort: 'opened' } };
/** Of these items, the ones a page is showing, in the order it has them in. */
const shown = (list, look) => list.filter((item) => look.kind === 'all' || item.kind === look.kind).sort(sortOf(look.sort)[2]);
let palette = null; // the collection whose colours are laid out to choose from, if any

/** How far along an item is, in words: "New", "34%" or "Finished". */
function placeOf(item) {
  if (!item.progress) return 'New';
  if (item.progress >= 1) return 'Finished';
  return Math.round(item.progress * 100) + '%';
}

/** An item's colour: its collection's, or the plain one if it is in none. */
const hueOf = (item) => collections.find((c) => c.id === item.collection)?.hue ?? PLAIN;

// ---------- tips ----------
// A small label that appears beside something pointed at, to say what it is or does. Anything
// with a data-tip gets one: under it, or above if there is no room (or, with
// data-tip-side="right", to its right). It waits a moment before showing, unless another tip
// was showing just before.

const tip = el('div', 'tip');
tip.setAttribute('role', 'tooltip');
document.body.append(tip);
let tipFor = null; // what the tip is for, or is waiting to be shown for
let tipWait = 0;
let tipGone = 0; // when a tip was last taken away

function hideTip() {
  clearTimeout(tipWait);
  if (tip.classList.contains('on')) tipGone = performance.now();
  tip.classList.remove('on');
  tipFor = null;
}

function showTip(target) {
  tip.textContent = target.dataset.tip;
  const box = target.getBoundingClientRect();
  const mine = tip.getBoundingClientRect();
  const right = target.dataset.tipSide === 'right';
  const x = right ? box.right + 10 : box.left + (box.width - mine.width) / 2;
  const under = box.bottom + 8;
  const y = right ? box.top + (box.height - mine.height) / 2 : under + mine.height > innerHeight - 8 ? box.top - mine.height - 8 : under;
  tip.style.left = Math.round(Math.max(8, Math.min(x, innerWidth - mine.width - 8))) + 'px';
  tip.style.top = Math.round(y) + 'px';
  tip.classList.add('on');
}

document.addEventListener('mouseover', (e) => {
  const target = e.target.closest?.('[data-tip]') ?? null;
  if (target === tipFor) return;
  hideTip();
  if (!target || document.body.classList.contains('dragging')) return;
  tipFor = target;
  tipWait = setTimeout(() => target.isConnected && showTip(target), performance.now() - tipGone < 500 ? 0 : 450);
});
// A press, a key, a scroll, or the pointer leaving the window takes the tip away.
document.addEventListener('mousedown', hideTip, true);
document.addEventListener('keydown', hideTip, true);
document.addEventListener('scroll', hideTip, true);
document.documentElement.addEventListener('mouseleave', hideTip);
window.addEventListener('blur', hideTip);

// ---------- menus ----------
// One kind of menu serves everywhere: hung from a button (the sort menu) or opened where
// the pointer is (a right click on a card).

let menu = null; // the open menu, if any: its element, and the button it hangs from

/** What shows while the app is busy with something: the asterisk of its name, which turns a
    fifth of a turn, rests, and turns again (style.css). */
function tick(className) {
  const made = el('span', className ? 'tick ' + className : 'tick', '*');
  made.setAttribute('aria-hidden', 'true');
  return made;
}

/** While what is to be read is being opened, the asterisk ticks in the middle of the window
    (if opening takes long enough to be noticed: style.css). */
function waiting(on) {
  $('reading').querySelector(':scope > .tick')?.remove();
  if (on) $('reading').append(tick('wait'));
}

/** A menu, or one of the reader's panels, comes into sight: slightly, from the corner it
    hangs by (its top right under a button, which is where they all hang but a menu at a point). */
function easeIn(node, corner = '100% 0') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  node.style.transformOrigin = corner;
  node.animate([{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}

/** And goes: it fades, quicker than it came, and is out of reach from the moment it starts. */
function easeOut(node) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return node.remove();
  node.inert = true;
  node.style.pointerEvents = 'none';
  const gone = () => node.remove();
  node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease', fill: 'forwards' }).finished.then(gone, gone);
  setTimeout(gone, 200); // (a window that is not being drawn does not finish a fade: it goes all the same)
}

function closeMenu() {
  if (!menu) return;
  easeOut(menu.node);
  menu.owner?.setAttribute('aria-expanded', 'false');
  if (menu.owner?.matches('.tool')) menu.owner.dataset.tip = menu.owner.getAttribute('aria-label'); // its tip was put away
  menu = null;
  settle();
}

/** Open a menu. Of its entries, a string is a group's label, null is a dividing line, and
    the rest are things to choose: { name, run } with, if wanted, an icon, a collection's
    colour (hue; null for none), a lead (a number before the name), on (it is the current
    choice), tick, danger, or indent (how deep it is nested). `at` is a button to hang the
    menu from, or the point { x, y }
    to open it at. A long menu is only so tall, and scrolls, opening at the current choice. */
function openMenu(entries, at, long) {
  closeMenu();
  closePanel();
  closeFind();
  closeLights();
  const node = el('div', long ? 'menu long' : 'menu');
  node.setAttribute('role', 'menu');
  for (const entry of entries) {
    if (entry === null) {
      node.append(el('div', 'menu-line'));
    } else if (typeof entry === 'string') {
      node.append(el('div', 'menu-label', entry));
    } else {
      const item = el('button', 'menu-item');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      if (entry.on) item.classList.add('on');
      if (entry.danger) item.classList.add('danger');
      const icon = (name, className) => {
        const made = el('span', className);
        made.dataset.icon = name;
        return made;
      };
      if (entry.icon) item.append(icon(entry.icon, 'menu-icon'));
      if (entry.hue !== undefined) {
        const dot = el('span', 'menu-dot');
        if (entry.hue !== null) dot.dataset.hue = entry.hue;
        item.append(dot);
      }
      if (entry.indent) item.style.paddingLeft = 7 + 14 * entry.indent + 'px'; // one nested under another
      if (entry.lead) item.append(el('span', 'menu-lead', entry.lead));
      item.append(el('span', 'menu-name', entry.name));
      if (entry.tick) item.append(icon('tick', 'menu-icon'));
      item.addEventListener('click', () => {
        closeMenu();
        entry.run();
      });
      node.append(item);
    }
  }
  document.body.append(node);
  // Under the button, its right edge on the button's; or at the point. Either way, on screen.
  const owner = at instanceof Element ? at : null;
  const box = node.getBoundingClientRect();
  const from = owner?.getBoundingClientRect();
  const x = owner ? from.right - box.width : at.x;
  const y = owner ? from.bottom + 6 : at.y;
  node.style.left = Math.max(8, Math.min(x, innerWidth - box.width - 8)) + 'px';
  node.style.top = Math.max(8, Math.min(y, innerHeight - box.height - 8)) + 'px';
  easeIn(node, owner ? '100% 0' : '0 0');
  owner?.setAttribute('aria-expanded', 'true');
  const on = long && node.querySelector('.on');
  if (on) node.scrollTop = on.offsetTop - (node.clientHeight - on.offsetHeight) / 2;
  menu = { node, owner };
  settle();
}

// A press anywhere else closes the menu (a press on its own button is left to that button).
document.addEventListener('mousedown', (e) => {
  if (menu && !menu.node.contains(e.target) && !menu.owner?.contains(e.target)) closeMenu();
}, true);
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
document.addEventListener('scroll', (e) => {
  if (!menu?.node.contains(e.target)) closeMenu(); // a long menu's own scrolling aside
}, true);

// ---------- the path in the top bar ----------

/** Empty in the library (the heading says where you are); while reading, the tab, which
    leads back to it, and then the title. */
function drawCrumbs() {
  if (!open) return $('crumbs').replaceChildren();
  const back = el('button', 'step', tab.name);
  back.addEventListener('click', showLibrary);
  $('crumbs').replaceChildren(back, el('span', 'sep', '/'), el('span', 'here', open.title));
}

// ---------- the rail ----------

let wide = localStorage.getItem('rail') === 'wide'; // the rail shows names beside its icons

function drawRail() {
  document.body.dataset.rail = wide ? 'wide' : 'slim';
  document.body.dataset.view = tab.id;
  const toggle = $('rail-toggle');
  toggle.dataset.tip = wide ? 'Collapse sidebar' : 'Expand sidebar';
  toggle.setAttribute('aria-label', toggle.dataset.tip);
  toggle.setAttribute('aria-expanded', String(wide));
  for (const button of document.querySelectorAll('#rail .tab')) {
    // Slim, a tab's name is its tip, beside it; wide, the name is written beside the icon.
    if (wide) delete button.dataset.tip;
    else button.dataset.tip = button.getAttribute('aria-label');
    button.dataset.tipSide = 'right';
    if (button.dataset.tab === tab.id) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}

function choose(id) {
  const was = tab;
  tab = TABS.find((entry) => entry.id === id);
  drawRail();
  drawShelf();
  drawCrumbs();
  $('library').scrollTop = 0;
  if (tab !== was) arrive();
}

// A page of the library arrives: its heading, then each line of it down the window, fades
// in while rising a little, each line a moment after the one above. It is slight and quick,
// to be felt more than seen. A page arrives when you turn to it from another, when you come
// back to the library from reading, and when the app opens; not when it is drawn again
// where it stands (a book added, a filter chosen), which would be a flicker.
const ARRIVING = '#heading, #heading-side > *, #shelf-body :is(.shelf-tools, .band-head, .card, .band-new, .band-none, .set-head, .set-lead, .set-sample, .set-row, .set-foot, .begin > *)';

function arrive() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Only what is in sight, taken from the top of the window down.
  const parts = [...document.querySelectorAll(ARRIVING)]
    .map((part) => ({ part, box: part.getBoundingClientRect() }))
    .filter(({ box }) => box.height && box.bottom > 0 && box.top < innerHeight)
    .sort((a, b) => a.box.top - b.box.top);
  let line = -1;
  let last = -Infinity;
  for (const { part, box } of parts) {
    // Things that begin about level are one line, and arrive together.
    if (box.top > last + 8) {
      line++;
      last = box.top;
    }
    part.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: Math.min(line, 6) * 28, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
  }
}

// (The opening says when it begins to uncover the window: opening.js.)
window.addEventListener('uncover', arrive);

// A page drawn again where it stands does not arrive, but what is on it need not jump
// either. For a change you make to the page itself (a filter, an order, a collection's
// colours laid out or put away, a colour chosen) the page is drawn through this: what was
// there before glides to where it now belongs, what is new rises in as a page's lines do,
// the colours laid out arrive one after another, and a colour that has changed washes over.
// The page is made afresh each time, so things are told apart by what they stand for.
const GLIDING = '#shelf-body :is(.card, .band-head, .band-dot, .band-none, .band-new)';

function gliding(draw) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return draw();
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const seen = (box) => box.height && box.bottom > 0 && box.top < innerHeight;
  const bands = () => [...document.querySelectorAll('#shelf-body .band')];
  const nameOf = (part, all) => {
    if (part.classList.contains('card')) return 'card ' + part.item?.id;
    if (part.classList.contains('band-new')) return 'new';
    return part.className.split(' ')[0] + ' ' + all.indexOf(part.closest('.band'));
  };
  const was = new Map();
  let all = bands();
  for (const part of document.querySelectorAll(GLIDING)) was.set(nameOf(part, all), { box: part.getBoundingClientRect(), colour: getComputedStyle(part).backgroundColor });
  const tray = document.querySelector('#shelf-body .palette');
  const trayBox = tray?.getBoundingClientRect();

  draw();

  all = bands();
  let fresh = 0;
  for (const part of document.querySelectorAll(GLIDING)) {
    const old = was.get(nameOf(part, all));
    const box = part.getBoundingClientRect();
    if (!old) {
      // New to the page: it rises in, each a moment after the last.
      if (seen(box) && !part.classList.contains('band-dot')) part.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: Math.min(fresh++, 6) * 24, easing: EASE, fill: 'backwards' });
      continue;
    }
    if (!seen(box) && !seen(old.box)) continue;
    const dx = old.box.left - box.left;
    const dy = old.box.top - box.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) part.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: EASE });
    const colour = getComputedStyle(part).backgroundColor;
    if (colour !== old.colour) part.animate([{ backgroundColor: old.colour }, { backgroundColor: colour }], { duration: 300, easing: 'ease' });
  }
  // The colours laid out: the tray comes into sight and its colours arrive in turn. Put
  // away, a picture of it fades where it stood, as the page closes over the place.
  const laid = document.querySelector('#shelf-body .palette');
  if (laid && !tray) {
    laid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease' });
    [...laid.children].forEach((swatch, n) => swatch.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }], { duration: 200, delay: 60 + n * 18, easing: EASE, fill: 'backwards' }));
  } else if (tray && !laid && seen(trayBox)) {
    const ghost = tray.cloneNode(true);
    ghost.inert = true;
    Object.assign(ghost.style, { position: 'fixed', left: trayBox.left + 'px', top: trayBox.top + 'px', margin: '0', pointerEvents: 'none' });
    $('library').append(ghost);
    const gone = () => ghost.remove();
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease', fill: 'forwards' }).finished.then(gone, gone);
    setTimeout(gone, 300); // (a window that is not being drawn does not finish a fade: it goes all the same)
  }
}

// ---------- the shelf ----------

/** How long an item is: pages if it has them, else minutes of reading. */
const lengthOf = (item) => (item.pages ? item.pages + ' pages' : item.minutes ? item.minutes + ' min' : '');

/** When an item was last open, in words. */
function openedOf(item) {
  const days = daysSince(item.opened);
  return days <= 0 ? 'Opened today' : days === 1 ? 'Opened yesterday' : `Opened ${days} days ago`;
}

/** When an item was finished, in words: "Finished 16 Nov", with the year if it is not this one. */
function finishedOf(item) {
  if (item.finished == null) return 'Finished';
  const on = new Date(item.finished);
  const year = on.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' };
  return 'Finished ' + on.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...year });
}

/** A card: what kind of thing it is and how long, its title, who wrote it, and a line showing
    how far you are. Pointed at, the place gives way to an arrow: it opens. A lead card is
    the same thing writ large, across the page. A dated card says when it was finished, in
    place of the line. */
function card(item, lead, dated) {
  const made = el('button', lead ? 'card lead' : 'card');
  made.type = 'button';
  made.dataset.hue = hueOf(item);
  const head = el('span', 'card-head');
  head.append(el('span', '', KINDS[item.kind]));
  if (lengthOf(item)) head.append(el('span', '', lengthOf(item))); // a real book has no count of pages
  if (lead) head.append(el('span', '', openedOf(item)));
  const end = el('span', 'card-end');
  const foot = el('span', 'card-foot');
  if (dated) {
    // On the Finished page every line would be full and every place "Finished": say when.
    end.append(el('span', 'card-go'));
    foot.append(el('span', 'card-when', finishedOf(item)), end);
  } else {
    const meter = el('span', 'meter');
    meter.style.setProperty('--done', Math.round(item.progress * 100) + '%');
    end.append(el('span', 'card-place', placeOf(item)), el('span', 'card-go'));
    foot.append(meter, end);
  }
  made.append(head, el('span', 'card-title', item.title), el('span', 'card-author', item.author), foot);
  made.item = item; // so a card on the page can be asked what it is a card for
  made.addEventListener('click', () => read(item));
  made.addEventListener('pointerdown', (down) => {
    // On the Collections page a card can be dragged to another shelf. A press becomes a drag
    // once the pointer has moved a little; until then it is still a click.
    if (!tab.shelves || down.button !== 0) return;
    const move = (now) => {
      if (Math.hypot(now.clientX - down.clientX, now.clientY - down.clientY) < 6) return;
      done();
      dragCard(item, made, down, now);
    };
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  });
  made.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(cardMenu(item), { x: e.clientX, y: e.clientY });
  });
  return made;
}

/** What a right click on a card offers: open it, mark it read or unread, move it to another
    collection (or out of them all), or take it out of the library. */
function cardMenu(item) {
  const change = (how) => () => (how(), drawShelf());
  const done = item.progress >= 1;
  return [
    { name: 'Open', icon: 'open', run: () => read(item) },
    // A book marked unread opens at its start again; one marked finished, at its end.
    done
      ? { name: 'Mark as unread', icon: 'restart', run: change(() => ((item.progress = 0), delete item.finished, delete item.at)) }
      : { name: 'Mark as finished', icon: 'finished', run: change(() => ((item.progress = 1), (item.finished = Date.now()), item.sections && (item.at = { section: item.sections - 1, part: 1 }))) },
    null,
    'Move to',
    ...collections.map((c) => ({ name: c.name, hue: c.hue, tick: item.collection === c.id, run: change(() => (item.collection = c.id)) })),
    { name: 'No collection', hue: null, tick: !collections.some((c) => c.id === item.collection), run: change(() => delete item.collection) },
    null,
    // Taken out of the library, a book's file goes to the Trash.
    { name: 'Remove from library', icon: 'bin', danger: true, run: change(() => ((items = items.filter((other) => other !== item)), item.file && window.api.library.discard(item.file))) },
  ];
}

function grid(list, className, dated) {
  const made = el('div', className ? 'cards ' + className : 'cards');
  made.append(...list.map((item) => card(item, false, dated)));
  return made;
}

/** A named stretch of a page: its name (and a count, if given), a rule, then what it holds. */
function band(name, body, count) {
  const made = el('section', 'band');
  const head = el('div', 'band-head');
  head.append(el('span', '', name));
  if (count != null) head.append(el('span', 'count', String(count)));
  made.append(head, body);
  return made;
}

/** What to carry on with: the started item you had open last, writ large, then a row of the
    next few. One left unopened for a month drops out, though the count is of all you have
    started. After it, what is close to finishing: whatever else you are most of the way
    through, the furthest first, however long ago it was opened. (The one you had open last
    leads Continue however far through it is.) Gives the sections, and the items shown in them. */
function going() {
  const started = items.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => when(b.opened) - when(a.opened));
  const [lead] = started.filter((item) => daysSince(when(item.opened)) <= STALE);
  const near = started.filter((item) => item !== lead && item.progress >= NEAR).sort((a, b) => b.progress - a.progress);
  const rest = started.filter((item) => item !== lead && !near.includes(item));
  const bands = [];
  const under = [];
  if (lead) {
    const more = rest.filter((item) => daysSince(when(item.opened)) <= STALE).slice(0, MORE);
    const made = el('div', 'going');
    made.append(card(lead, true));
    if (more.length) made.append(grid(more, 'short row'));
    bands.push(band('Continue', made, rest.length + 1));
    under.push(lead, ...more);
  }
  if (near.length) {
    bands.push(band('Close to finishing', grid(near.slice(0, CLOSE), 'short'), near.length));
    under.push(...near.slice(0, CLOSE));
  }
  return { bands, under };
}

/** Home: what to carry on with, what is close to finishing, then the latest additions. */
/** What Home and Library show while the library has nothing in it: a quotation, set large
    under its mark, then what to do and the button that does it. */
function begin() {
  const made = el('div', 'begin');
  const mark = el('span', 'begin-mark', '“');
  mark.setAttribute('aria-hidden', 'true');
  const add = el('button', 'begin-add', 'Add to library');
  add.type = 'button';
  add.addEventListener('click', openAdd);
  made.append(mark, el('p', 'begin-quote', QUOTE.text), el('p', 'begin-by', QUOTE.by), el('p', 'begin-line', 'Add a book, a PDF or an article to begin.'), add);
  return made;
}

function home() {
  if (!items.length) return [begin()];
  const { bands, under } = going();
  // What is already under Continue or Close to finishing is not shown a second time.
  const recent = items.filter((item) => !under.includes(item)).sort((a, b) => b.added - a.added).slice(0, RECENT);
  return [...bands, ...(recent.length ? [band('Recently added', grid(recent))] : [])];
}

// ---------- the Collections page ----------

/** What a page says when the kind it is showing has nothing in it. */
const none = (look, where) => el('p', 'band-none', `No ${FILTERS.find(([id]) => id === look.kind)[2]} ${where}`);

/** The row above a page's items: which kinds to show, and what order to put them in. */
function shelfTools(look) {
  const made = el('div', 'shelf-tools');
  for (const [id, name] of FILTERS) {
    const pill = el('button', 'pill', name);
    pill.type = 'button';
    pill.setAttribute('aria-pressed', String(id === look.kind));
    pill.addEventListener('click', () => {
      look.kind = id;
      gliding(drawShelf);
    });
    made.append(pill);
  }
  const button = el('button', 'sort');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Sort: ' + sortOf(look.sort)[1]);
  button.append(el('span', 'sort-icon'), el('span', '', sortOf(look.sort)[1]));
  button.addEventListener('click', () => {
    if (menu?.owner === button) return closeMenu();
    const pick = (id) => () => ((look.sort = id), gliding(drawShelf));
    openMenu(SORTS.flatMap(([label, orders], i) => [...(i ? [null] : []), label, ...orders.map(([id, name]) => ({ name, on: id === look.sort, run: pick(id) }))]), button);
  });
  made.append(button);
  return made;
}

/** The colours a collection can take, laid out to choose from. */
function swatches(collection) {
  const made = el('div', 'palette');
  made.setAttribute('role', 'group');
  made.setAttribute('aria-label', 'Colour');
  HUES.forEach((name, hue) => {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.dataset.hue = hue;
    swatch.dataset.tip = name;
    swatch.setAttribute('aria-label', name);
    swatch.setAttribute('aria-pressed', String(hue === collection.hue));
    swatch.addEventListener('click', () => {
      collection.hue = hue;
      palette = null;
      gliding(drawShelf);
    });
    made.append(swatch);
  });
  return made;
}

/** Put the collection at one place in the order into another. */
function moveCollection(from, to) {
  collections.splice(to, 0, collections.splice(from, 1)[0]);
}

/** Carry something across the page. A copy of it goes with the pointer; the thing itself
    stays on the page, faded, wherever `place` puts it (`place` is asked again and again,
    with where the pointer is). Near the top or bottom of the page, the page moves along.
    Letting go calls `drop`, and the copy settles onto the faded thing. Escape, or the
    pointer being taken away, puts everything back. `down` is the press that took hold of
    it, and `now` the pointer's latest move, if it has moved since. */
function carry(down, held, place, drop, now = down) {
  const page = $('library');
  const from = held.getBoundingClientRect();
  const grab = { x: down.clientX - from.left, y: down.clientY - from.top }; // where on it the pointer took hold
  let at = { x: now.clientX, y: now.clientY };
  let frame = 0;

  const ghost = held.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.inert = true;
  ghost.style.width = from.width + 'px';
  ghost.style.height = from.height + 'px';
  document.body.append(ghost);
  const follow = () => {
    ghost.style.left = at.x - grab.x + 'px';
    ghost.style.top = at.y - grab.y + 'px';
  };

  const tick = () => {
    const box = page.getBoundingClientRect();
    const edge = 64; // how near an edge the pointer must be for the page to move
    const past = at.y < box.top + edge ? at.y - (box.top + edge) : at.y > box.bottom - edge ? at.y - (box.bottom - edge) : 0;
    if (past) page.scrollTop += past * 0.3;
    place(at);
    frame = requestAnimationFrame(tick);
  };
  const move = (ev) => {
    at = { x: ev.clientX, y: ev.clientY };
    follow();
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    hold.removeEventListener('pointermove', move);
    hold.removeEventListener('pointerup', release);
    hold.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    document.body.classList.remove('dragging');
    // Letting go may count as a click on whatever is under the pointer: it is not one.
    const hush = (ev) => (ev.stopPropagation(), ev.preventDefault());
    window.addEventListener('click', hush, true);
    setTimeout(() => window.removeEventListener('click', hush, true), 0);
  };
  const release = () => {
    stop();
    drop();
    // The copy settles onto the faded thing, and then the page is drawn afresh.
    const to = held.getBoundingClientRect();
    ghost.classList.add('settling');
    ghost.style.left = to.left + 'px';
    ghost.style.top = to.top + 'px';
    setTimeout(() => {
      ghost.remove();
      drawShelf();
    }, 170);
  };
  const cancel = () => {
    stop();
    ghost.remove();
    drawShelf(); // as it was
  };
  const key = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    cancel();
  };

  // The pointer is held by the page itself, not by what is carried: that moves about the
  // page, and an element taken out of the page lets go of the pointer.
  const hold = document.body;
  hold.setPointerCapture(down.pointerId);
  hold.addEventListener('pointermove', move);
  hold.addEventListener('pointerup', release);
  hold.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  document.body.classList.add('dragging');
  held.classList.add('held');
  follow();
  frame = requestAnimationFrame(tick);
}

/** Drag a shelf, by its grip, to another place among the shelves. The faded shelf steps
    from place to place as the pointer passes the others, which slide to make room, so it
    always shows where letting go would put it. */
function dragShelf(grip, e) {
  const held = grip.closest('.band');
  const shelves = () => [...$('shelf-body').querySelectorAll('.band[data-id]')];
  let settling = 0; // until when the shelves are still sliding into their new places

  /** Move the faded shelf, and slide the others from where they were to where they now are. */
  const step = (move) => {
    const was = new Map(shelves().map((shelf) => [shelf, shelf.getBoundingClientRect().top]));
    move();
    for (const shelf of shelves()) {
      const by = was.get(shelf) - shelf.getBoundingClientRect().top;
      if (by) shelf.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' });
    }
    settling = performance.now() + 190;
  };

  /** Put the faded shelf before the first of the others that the pointer is above the middle of. */
  const place = (at) => {
    if (performance.now() < settling) return; // wait for the last step to finish sliding
    const others = shelves().filter((shelf) => shelf !== held);
    const next = others.find((shelf) => ((box) => at.y < box.top + box.height / 2)(shelf.getBoundingClientRect()));
    if (next ? held.nextElementSibling !== next : others.length && others.at(-1).nextElementSibling !== held) step(() => (next ? next.before(held) : others.at(-1).after(held)));
  };

  /** The order is now the one on the page. */
  const drop = () => {
    const order = shelves().map((shelf) => shelf.dataset.id);
    collections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  };

  carry(e, held, place, drop);
}

/** Drag a card to another shelf, to move its item into that collection (or, onto the shelf
    of items in no collection, out of them all). The faded card moves to whichever shelf the
    pointer is over, into the place the page's order gives it there. */
function dragCard(item, held, down, now) {
  const order = sortOf(looks.collections.sort)[2];
  const place = (at) => {
    // The shelf the pointer is on, or under: each one's ground runs down to the next.
    const shelves = [...$('shelf-body').querySelectorAll('.band')];
    const over = shelves.filter((shelf) => shelf.getBoundingClientRect().top <= at.y).at(-1) ?? shelves[0];
    const from = held.closest('.band');
    if (!over || over === from) return;
    let cards = over.querySelector('.cards');
    if (!cards) over.append((cards = el('div', 'cards short')));
    cards.insertBefore(held, [...cards.children].find((other) => order(item, other.item) < 0) ?? null);
    // A shelf says it is empty only while it is.
    for (const shelf of [over, from]) {
      const none = shelf.querySelector('.band-none');
      if (none) none.hidden = shelf.querySelectorAll('.card').length > 0;
    }
  };
  const drop = () => {
    const id = held.closest('.band').dataset.id;
    if (id) item.collection = id;
    else delete item.collection;
  };
  carry(down, held, place, drop, now);
}

/** One collection's shelf: a grip to drag it by (in the margin, when pointed at), a dot that
    changes its colour, its name (type over it to rename it), how many of its items are
    showing, a rule, and those items as short cards. Items in no collection get a shelf too,
    which has no grip, no dot and no name to change. */
function shelf(collection, list) {
  const made = el('section', 'band');
  const head = el('div', 'band-head');
  if (collection) {
    made.dataset.id = collection.id;
    const grip = el('span', 'band-grip');
    grip.dataset.tip = 'Drag to reorder';
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragShelf(grip, e);
    });
    head.append(grip);
    const dot = el('button', 'band-dot');
    dot.type = 'button';
    dot.dataset.hue = collection.hue;
    dot.dataset.tip = 'Change colour';
    dot.setAttribute('aria-label', 'Change colour');
    dot.setAttribute('aria-expanded', String(palette === collection.id));
    dot.addEventListener('click', () => {
      palette = palette === collection.id ? null : collection.id;
      gliding(drawShelf);
    });
    const name = el('span', 'band-name', collection.name);
    name.contentEditable = 'plaintext-only';
    name.spellcheck = false;
    name.setAttribute('role', 'textbox');
    name.setAttribute('aria-label', 'Collection name');
    // The name is kept as it is typed, so nothing is lost if the page is redrawn meanwhile.
    let before = collection.name;
    name.addEventListener('focus', () => (before = collection.name));
    name.addEventListener('input', () => ((collection.name = name.textContent.trim() || before), save())); // a name cannot be emptied
    name.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // From the keyboard: Option with an up or down arrow moves the shelf one place.
        e.preventDefault();
        const from = collections.indexOf(collection);
        const to = from + (e.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= collections.length) return;
        moveCollection(from, to);
        drawShelf();
        document.querySelector(`.band[data-id="${collection.id}"] .band-name`).focus();
        return;
      }
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      if (e.key === 'Escape') (collection.name = before), save(); // Escape leaves the name as it was
      name.blur();
    });
    name.addEventListener('blur', () => (name.textContent = collection.name));
    head.append(dot, name);
  } else {
    head.append(el('span', '', 'No collection'));
  }
  head.append(el('span', 'count', String(list.length)));
  if (collection && !items.some((item) => item.collection === collection.id)) {
    // With nothing in it, a collection can be deleted: a bin at the end of its line.
    const bin = el('button', 'band-bin');
    bin.type = 'button';
    bin.dataset.tip = 'Delete collection';
    bin.setAttribute('aria-label', 'Delete collection');
    bin.addEventListener('click', () => {
      collections.splice(collections.indexOf(collection), 1);
      drawShelf();
    });
    head.append(bin);
  }
  made.append(head);
  if (collection && palette === collection.id) made.append(swatches(collection));
  if (list.length) made.append(grid(list, 'short'));
  else if (collection && !items.some((item) => item.collection === collection.id)) made.append(el('p', 'band-none', 'Nothing in this collection yet'));
  else made.append(none(looks.collections, 'here'));
  return made;
}

/** A new, empty collection in a colour not yet used, its name ready to be typed over. */
function addCollection() {
  const used = new Set(collections.map((c) => c.hue));
  const free = HUES.findIndex((_, hue) => !used.has(hue));
  collections.push({ id: 'c' + Date.now(), name: 'New collection', hue: free < 0 ? collections.length % HUES.length : free });
  drawShelf();
  const name = [...document.querySelectorAll('.band-name')].at(-1);
  name.focus();
  getSelection().selectAllChildren(name);
}

/** The Collections page: the tools, a shelf for each collection, one for what is in none,
    and the way to make another. */
function shelves() {
  const list = shown(items, looks.collections);
  const loose = list.filter((item) => !collections.some((c) => c.id === item.collection));
  const add = el('button', 'band-new', 'New collection');
  add.type = 'button';
  add.addEventListener('click', addCollection);
  return [
    ...(items.length ? [shelfTools(looks.collections)] : []), // nothing to filter or sort in an empty library
    ...collections.map((c) => shelf(c, list.filter((item) => item.collection === c.id))),
    ...(loose.length ? [shelf(null, loose)] : []),
    ...(collections.length ? [] : [el('p', 'band-none first', 'A collection gathers related items under one name and colour.')]),
    add,
  ];
}

/** Adds books and PDFs to the library: they are chosen in a dialog, or are the files dropped
    on the window; they are copied into the library's folder and read for their title and
    author. What cannot be read is named, and its copy thrown away. Gives how many were added. */
async function addToLibrary(paths, dropped) {
  if (SAMPLING) return 0; // the stand-ins are all there is
  const { added, failed } = await (dropped ? window.api.library.drop(dropped) : window.api.library.add(paths)); // (only a test run may name the files)
  let kept = 0;
  for (const { file, name, kind } of added) {
    const item = { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, file, title: name, author: '', added: Date.now(), progress: 0 };
    try {
      if (kind === 'pdf') {
        const pdf = await Pdf.open(item);
        item.title = pdf.title || name; // many PDFs give no title of their own
        item.author = pdf.author;
        item.pages = item.sections = pdf.pages;
        Pdf.close(pdf);
      } else {
        const book = await Book.open(item);
        item.title = book.title || name;
        item.author = book.author;
        item.sections = book.sections.length;
      }
      items.push(item);
      kept++;
    } catch {
      failed.push(name);
      window.api.library.discard(file);
    }
  }
  if (kept) drawShelf();
  addToLibrary.failed = failed; // (for a test run to see)
  if (failed.length) window.api.library.notify(`${failed.join(', ')} could not be added. Only PDFs, and EPUB books without copy protection, can be read for now.`);
  return kept;
}

// A dialog lies over the library, on a veil that dims the window. There are two: one adds to
// the library, one searches it. Escape, or a press on the veil, closes whichever is open.
let dialog = null; // the dialog that is open, if any: its veil, what lies behind it, and what was in hand before

function closeDialog() {
  if (!dialog) return;
  dialog.node.remove();
  for (const part of dialog.behind) part.inert = false;
  dialog.from?.focus();
  dialog = null;
}

/** Puts a dialog up: in the middle of the window, or, if it will grow as it is used, high in
    it, so that its top stays where it is. */
function openDialog(inside, high) {
  closeMenu();
  closePanel();
  closeDialog();
  hideTip();
  const node = el('div', high ? 'veil high' : 'veil');
  node.append(inside);
  node.addEventListener('mousedown', (e) => e.target === node && closeDialog()); // a press on the veil closes it
  // What lies behind cannot be reached while it is open.
  const behind = [$('top'), $('rail'), $('library')];
  const from = document.activeElement === document.body ? null : document.activeElement;
  for (const part of behind) part.inert = true;
  document.body.append(node);
  dialog = { node, behind, from };
}

// Add: in the dialog a field for a link, to save an article from the web, and under that a
// place to drop books and PDFs, with a button that chooses them instead.
const addTool = document.querySelector('[data-tool="add"]');

/** Opens the dialog. Return in the field, or the button beside it, saves the article at that
    address; while it is being saved the dialog says so, and if it cannot be, why. Saved, the
    dialog goes and the article is on the shelf. Files dropped on it, or chosen, are added as
    books and PDFs are. */
function openAdd() {
  const form = el('form', 'modal');
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-labelledby', 'add-title');

  const title = el('h2', 'modal-title', 'Add to library');
  title.id = 'add-title';
  const close = el('button', 'tool modal-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.append(el('span', 'icon'));
  close.addEventListener('click', closeDialog);
  const head = el('div', 'modal-head');
  head.append(title, close);

  const field = el('input', 'add-field');
  field.type = 'text';
  field.inputMode = 'url';
  field.placeholder = 'Paste a link';
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.setAttribute('aria-label', 'Link to an article');
  const save = el('button', 'fill', 'Add link');
  save.type = 'submit';
  const row = el('div', 'add-row');
  row.append(field, save);
  const said = el('p', 'add-said');
  said.setAttribute('aria-live', 'polite');
  said.hidden = true;
  const say = (words, wrong) => {
    said.textContent = words;
    said.hidden = !words;
    said.classList.toggle('wrong', Boolean(wrong));
  };
  field.addEventListener('input', () => say('')); // a new address: what was wrong with the last is forgotten
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!field.value.trim() || field.readOnly) return field.focus();
    const mine = dialog;
    field.readOnly = true;
    say('Saving…');
    said.prepend(tick());
    const { item, why } = await addArticle(field.value);
    if (dialog !== mine) return; // closed meanwhile: it is saved all the same
    if (item) return closeDialog();
    field.readOnly = false;
    say(why, true);
    field.focus();
    field.select();
  });

  const or = el('div', 'modal-or');
  or.append(el('span', '', 'or add files from this Mac'));
  const choose = el('button', 'fill');
  choose.type = 'button';
  const icon = el('span', 'menu-icon');
  icon.dataset.icon = 'files';
  choose.append(icon, 'Choose files');
  // The dialog stays while the files are chosen, and goes once something has been added. If
  // nothing is (the choosing was given up, or none of the files could be read) it is still there.
  const add = async (...from) => {
    const mine = dialog;
    if ((await addToLibrary(...from)) && dialog === mine) closeDialog();
  };
  choose.addEventListener('click', () => add());
  const drop = el('div', 'add-drop');
  drop.append(el('p', '', 'Drop books and PDFs here'), choose);
  // Files dragged over it show that it will take them; dropped, they are added.
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', (e) => drop.contains(e.relatedTarget) || drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const files = [...e.dataTransfer.files];
    if (files.length) add(null, files);
  });

  form.append(head, el('p', 'modal-line', 'Save an article from its link, or add EPUB books and PDFs.'), row, said, or, drop);
  openDialog(form);
  field.focus();
}

addTool.addEventListener('click', openAdd);

// Search: a field, and under it what in the library matches, by title, by who wrote it, by
// the site it is from or the collection it is in. The arrow keys move through the list and
// Return opens the one marked; so does a click.

/** Text as it is compared: without accents or capitals. */
const plainOf = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The items that match what is asked for, the best first. Every word asked for must be
    found in the item; a word found at the start of the title counts for most, then at the
    start of a word in it, then anywhere in it, then at the start of a word of the author's
    name, then of the rest. Equal matches come in the order they were last opened. */
function matching(query) {
  const starts = (text, word) => text.split(/[^\p{L}\p{N}]+/u).some((part) => part.startsWith(word));
  const asked = plainOf(query).split(/\s+/).filter(Boolean);
  if (!asked.length) return [];
  const found = [];
  for (const item of items) {
    const title = plainOf(item.title);
    const by = plainOf(item.author);
    const rest = plainOf([item.site, collections.find((c) => c.id === item.collection)?.name].filter(Boolean).join(' '));
    let score = 0;
    for (const word of asked) {
      const worth = title.startsWith(word) ? 5 : starts(title, word) ? 4 : title.includes(word) ? 3 : starts(by, word) ? 2 : starts(rest, word) ? 1 : 0;
      if (!worth) {
        score = 0;
        break;
      }
      score += worth;
    }
    if (score) found.push({ item, score });
  }
  return found.sort((a, b) => b.score - a.score || when(b.item.opened ?? b.item.added) - when(a.item.opened ?? a.item.added)).map(({ item }) => item);
}

function openSearch() {
  const form = el('form', 'modal search');
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-label', 'Search library');
  const field = el('input', 'search-field');
  field.type = 'text';
  field.placeholder = 'Search your library';
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.setAttribute('aria-label', 'Search your library');
  const head = el('label', 'search-head');
  head.append(el('span', 'icon'), field);
  const list = el('div', 'search-list');
  list.hidden = true;
  form.append(head, list);

  let found = [];
  let at = 0; // the one marked
  const mark = (index, show) => {
    at = index;
    [...list.children].forEach((row, i) => row.classList.toggle('on', i === at));
    if (show) list.children[at]?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (item) => {
    closeDialog();
    read(item);
  };
  field.addEventListener('input', () => {
    found = matching(field.value).slice(0, 50);
    list.hidden = !field.value.trim();
    list.scrollTop = 0;
    if (!found.length) return list.replaceChildren(el('p', 'search-none', 'Nothing in your library matches.'));
    list.replaceChildren(...found.map((item, index) => {
      const row = el('button', 'search-row');
      row.type = 'button';
      const name = el('span', 'search-name');
      name.append(el('span', 'search-title', item.title), el('span', 'search-by', item.author));
      row.append(name, el('span', 'search-kind', KINDS[item.kind]));
      row.addEventListener('click', () => choose(item));
      row.addEventListener('pointermove', () => at === index || mark(index));
      return row;
    }));
    mark(0);
  });
  form.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !found.length) return;
    e.preventDefault();
    mark((at + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length, true);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (found[at]) choose(found[at]);
  });
  openDialog(form, true);
  field.focus();
}

document.querySelector('[data-tool="search"]').addEventListener('click', openSearch);

/** Saves the article at a web address into the library: the page is fetched, the article
    found in it and cleaned (article.js), and it and its pictures kept in a folder of their
    own. Gives { item }, or { why } saying what went wrong. An address already saved gives
    the item there is. */
async function addArticle(address) {
  if (SAMPLING) return { why: 'Nothing is kept while the stand-ins are showing.' };
  let asked;
  try {
    asked = new URL(/^[a-z][a-z0-9+.-]*:/i.test(address.trim()) ? address.trim() : 'https://' + address.trim());
    if (!/^https?:$/.test(asked.protocol) || !asked.hostname.includes('.') && asked.hostname !== 'localhost') throw new Error();
  } catch {
    return { why: 'That is not a web address.' };
  }
  const page = await window.api.library.page(asked.href);
  if (page.error) return { why: page.error === 'not a page' ? 'That address is not a web page.' : 'That page could not be reached.' };
  const already = items.find((item) => item.address === page.address);
  if (already) return { item: already };
  let found;
  try {
    found = Article.read(page.html, page.address);
  } catch {
    return { why: 'No article was found on that page.' };
  }
  const { file, error } = await window.api.library.keep({ title: found.title, html: found.html, pictures: found.pictures });
  if (error) return { why: 'The article could not be saved.' };
  const item = { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'article', file, title: found.title, author: found.author || found.site, site: found.site, address: page.address, minutes: found.minutes, sections: 1, added: Date.now(), progress: 0 };
  items.push(item);
  drawShelf();
  return { item };
}

/** Draws the page the rail has chosen. Whatever changes the library draws it again, so this
    is also where the library is kept. */
function drawShelf() {
  save();
  // Home greets you in place of its name, with the week's reading beside the greeting.
  $('heading').textContent = tab.home ? greeting() : tab.name;
  const beside = tab.home && items.length ? weekly() : null;
  $('heading-side').replaceChildren(...(beside ? [beside] : []));
  if (tab.home) return $('shelf-body').replaceChildren(...home());
  if (tab.shelves) return $('shelf-body').replaceChildren(...shelves());
  if (tab.settings) return $('shelf-body').replaceChildren(settings());
  if (!tab.tools) {
    const list = items.filter(tab.test);
    if (tab.dated) list.sort((a, b) => when(b.finished) - when(a.finished)); // the latest finished first
    return $('shelf-body').replaceChildren(list.length || !tab.empty ? grid(list, '', tab.dated) : el('p', 'band-none', tab.empty));
  }
  // Library: everything, of the kinds chosen, in the order chosen.
  if (!items.length) return $('shelf-body').replaceChildren(begin());
  const list = shown(items.filter(tab.test), looks.library);
  $('shelf-body').replaceChildren(shelfTools(looks.library), list.length ? grid(list) : none(looks.library, 'in your library'));
}

function showLibrary() {
  closePanel();
  shut();
  open = null;
  drawShelf(); // how far you got shows on the shelf
  wear();
  window.api.watchPointer(false);
  reveal(true, false);
  document.body.dataset.screen = 'library';
  $('reading').hidden = true;
  $('library').hidden = false;
  drawCrumbs();
  arrive();
}

// ---------- reading ----------

// Until there is a reader, every item opens on the same few paragraphs.
const TEXT = [
  'This is stand-in text. It is here so the page has words on it while the reader is being designed, and it will go when real books, PDFs and articles can be opened.',
  'A page asks for very little. It wants a column narrow enough that the eye finds the start of the next line without hunting for it, and lines far enough apart that each can be read on its own. It wants margins, so the words are not pressed against the edge of anything. Past that, most of what can be added to a page takes something away from it.',
  'So the window is kept quiet. The list of tabs slides out of the way when something is opened, and the bar along the top goes with it. Move the pointer up to the top of the window and the bar comes back: the way back to the library, the name of what you are reading, and two buttons, one for the contents and one for how the text is set.',
  'How far through you are is kept out of sight in the same way. Move the pointer down to the foot of the window and a number appears in the corner. Move it away and the number goes. Nothing else is down there.',
  'The column does not grow with the window. Make the window wider and the margins take the extra room; the lines stay the length they were. A line of sixty to seventy-five characters is about what a reader can take in without losing the way back to the left edge, and that holds whether the screen is small or very large.',
  'Reading on a screen is mostly scrolling, and scrolling has no pages to turn. That is a loss of one kind, because a page is a small unit of progress and turning it is a small reward. It is a gain of another, because nothing is ever split across a turn. Which of the two this reader should be is still to be decided.',
  'Whatever is decided, the text comes first. Everything around it should be easy to find when it is wanted and easy to forget when it is not.',
  'The paragraphs that follow are only here so that there is enough on the page to scroll.',
  'A library is a record of intentions as much as of reading. Some of what is in it has been finished, some was put down halfway, and some has never been opened and may never be. The shelves do not mind. They hold all of it the same way, and the line on each card says how far you got.',
  'Coming back to a book after a week away, the first thing wanted is the place where you stopped. The second is some sense of what came just before it. A reader that opens where you left off answers the first; the heading above the text goes some way toward the second.',
  'That is the end of the stand-in text.',
];

/** A stand-in for one page of a PDF: a sheet, and on it a leaf drawn as the PDF would draw it,
    black on white (style.css gives it the theme's paper and ink): bars where its lines would
    be, here and there a box where a figure would be, and its number at the foot. The first
    has a title. */
function sheet(number) {
  const sheet = el('div', 'sheet');
  const made = el('div', 'leaf');
  sheet.append(made);
  const bar = (width, kind) => {
    const line = el('span', kind ? 'ink ' + kind : 'ink');
    line.style.width = width + '%';
    return line;
  };
  let seed = number * 7 + 3; // the same page is always the same shape
  const next = () => (seed = (seed * 73 + 41) % 101);
  const figure = number % 3 === 2;
  if (number === 1) made.append(bar(72, 'big'), bar(30, 'gap'));
  for (let paragraph = 0; paragraph < (figure || number === 1 ? 5 : 7); paragraph++) {
    const lines = 4 + (next() % 3);
    for (let i = 0; i < lines; i++) made.append(i < lines - 1 ? bar(100) : bar(30 + (next() % 55), 'gap'));
    if (figure && paragraph === 1) made.append(el('span', 'figure'));
  }
  made.append(el('span', 'folio', String(number)));
  return sheet;
}

/** Sets out the page of what is open. A PDF is its own pages, as sheets one under another. A
    stand-in book opens at its chapter, a stand-in article under its title and author; both
    have the same words. */
function drawPage() {
  const item = open;
  const pdf = item.kind === 'pdf';
  $('page').className = pdf ? 'sheets' : !item.file ? '' : item.kind === 'article' ? 'book article' : 'book';
  $('reading').scrollTop = 0;
  if (item.file) return void (pdf ? bindPdf(item) : bind(item)); // a real book, article or PDF
  if (pdf) return $('page').replaceChildren(...Array.from({ length: item.pages }, (_, i) => sheet(i + 1)));
  const head = item.chapters ? [el('p', 'over', 'Chapter ' + item.chapter), el('h2', '', item.chapters[item.chapter - 1])] : [el('h2', '', item.title), el('p', 'byline', item.author)];
  $('page').replaceChildren(...head, ...TEXT.map((words) => el('p', 'text', words)));
}

function read(item) {
  shut();
  open = item;
  item.opened = Date.now();
  save();
  $('place').textContent = Math.round(item.progress * 100) + '%';
  contentsTool.hidden = !item.chapters; // only what has chapters has contents (a real book says, once it is open)
  findTool.hidden = lightsTool.hidden = !item.file; // a stand-in has no words of its own to look through, or to highlight
  wear();
  zone = 'none';
  reveal(false, false);
  window.api.watchPointer(true);
  document.body.dataset.screen = 'reading';
  $('library').hidden = true;
  $('reading').hidden = false;
  waiting(false);
  drawPage();
  drawCrumbs();
}

// ---------- a real book ----------
// The whole book is one long page: a part for each of its sections, one under another. A
// part is empty, and about as tall as its section is long, until the page comes near it;
// then its words are fetched and it takes its true height. Where you are is the part at
// the reading line (a little below the top of the window) and how far down that part the
// line is, which holds whatever the size of the text.

// The reading line: as far below the top of the window as the page's own top margin, which is
// less for a PDF's sheets than for a book's text.
const lineOf = () => (book.pdf ? 64 : 92);
let book = null; // the book open: its sections, contents and parts, and whether it has found its place

/** Opens a real book on the page, at the place it was left. (Or a saved article, which is
    read as a book of one section.) */
async function bind(item) {
  const page = $('page');
  page.replaceChildren();
  waiting(true);
  let shape;
  try {
    shape = await (item.kind === 'article' ? Article : Book).open(item);
  } catch {
    if (open === item) {
      waiting(false);
      page.replaceChildren(el('p', 'book-none', `This ${item.kind === 'article' ? 'article' : 'book'} could not be opened.`));
    }
    return;
  }
  if (open !== item) return; // left while it was opening
  const parts = shape.sections.map((section, index) => {
    const part = el('section', 'part');
    part.dataset.index = index;
    part.style.minHeight = Math.max(200, Math.round(section.size * 0.4)) + 'px'; // a guess at its height
    return part;
  });
  page.replaceChildren(...parts);
  // How much of the book lies before each section, by size.
  const before = [0];
  for (const section of shape.sections) before.push(before.at(-1) + section.size);
  const mine = (book = { item, ...shape, parts, before, fetched: new Map(), dressed: new Set(), sheet: new CSSStyleSheet(), lights: [], ready: false });
  readLights(mine);
  pace(); // read by scrolling, or in pages
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, mine.sheet]; // the book's own styling, such of it as is kept
  contentsTool.hidden = !shape.toc.length;
  item.sections = parts.length;
  const at = item.at ?? { section: 0, part: 0 };
  await around(Math.min(at.section, parts.length - 1));
  if (book !== mine) return;
  seek(at);
  mine.ready = true;
  waiting(false);
  // From here the page fetches whatever it comes near.
  mine.watch = new IntersectionObserver((seen) => seen.forEach((entry) => entry.isIntersecting && fill(Number(entry.target.dataset.index))), { root: $('reading'), rootMargin: '1400px 0px' });
  parts.forEach((part) => mine.watch.observe(part));
}

/** Reads what is highlighted in the book just opened. */
async function readLights(mine) {
  const kept = await window.api.library.highlights(mine.item.file).catch(() => []);
  if (book !== mine) return;
  mine.lights = kept.filter((light) => light && typeof light.text === 'string' && Number.isInteger(light.section) && light.section >= 0 && light.section < mine.parts.length && Number.isInteger(light.start) && Number.isInteger(light.end));
  relight();
}

/** Opens a real PDF on the page, at the place it was left. It is a book of another kind: each
    page is a part, a sheet the shape of the page, blank until the page comes near it and
    then drawn (and blank again once it is far away, so a long PDF does not fill the memory). */
async function bindPdf(item) {
  const page = $('page');
  page.replaceChildren();
  waiting(true);
  let pdf;
  try {
    pdf = await Pdf.open(item);
  } catch {
    if (open === item) {
      waiting(false);
      page.replaceChildren(el('p', 'book-none', 'This PDF could not be opened.'));
    }
    return;
  }
  if (open !== item) return void Pdf.close(pdf); // left while it was opening
  const parts = Array.from({ length: pdf.pages }, (_, index) => {
    const sheet = el('div', 'sheet');
    sheet.dataset.index = index;
    sheet.style.aspectRatio = String(pdf.shapes[index]);
    sheet.append(el('div', 'leaf'));
    return sheet;
  });
  page.replaceChildren(...parts);
  const mine = (book = { item, pdf, sections: parts.map(() => ({ size: 1 })), toc: pdf.toc, parts, before: Array.from({ length: parts.length + 1 }, (_, i) => i), fetched: new Map(), lights: [], ready: false });
  readLights(mine);
  contentsTool.hidden = !pdf.toc.length;
  item.pages = item.sections = parts.length;
  seek(item.at ?? { section: 0, part: 0 });
  mine.ready = true;
  waiting(false);
  mine.watch = new IntersectionObserver((seen) => seen.forEach((entry) => (entry.isIntersecting ? fill : blank)(Number(entry.target.dataset.index))), { root: $('reading'), rootMargin: '1400px 0px' });
  parts.forEach((part) => mine.watch.observe(part));
}

/** Draws a PDF's page onto its sheet, once. */
function drawSheet(mine, index) {
  if (!mine.fetched.has(index)) {
    const sheet = mine.parts[index];
    const done = ({ canvas, words, links, shape }) => {
      if (book !== mine || mine.fetched.get(index) !== drawing) return; // shut, or put away, or drawn afresh meanwhile
      canvas.className = 'leaf';
      sheet.style.aspectRatio = String(shape);
      // Over the words, an unseen area for each of the page's links, where the page draws it.
      const over = el('div', 'links');
      for (const { box, out, dest } of links) {
        const link = el('a');
        [link.style.left, link.style.top, link.style.width, link.style.height] = box.map((part) => part * 100 + '%');
        if (out) link.dataset.out = out;
        else link.dataset.dest = JSON.stringify(dest);
        over.append(link);
      }
      sheet.replaceChildren(canvas, words, over);
      arrived(index);
    };
    sheet.dataset.drawn = sheet.clientWidth; // how wide it was drawn for
    const drawing = Pdf.draw(mine.pdf.doc, index + 1, sheet.clientWidth).then(done, () => {});
    mine.fetched.set(index, drawing);
  }
  return mine.fetched.get(index);
}

/** Makes a PDF's sheet blank again. */
function blank(index) {
  if (!book?.pdf || !book.fetched.has(index)) return;
  book.fetched.delete(index);
  book.parts[index].replaceChildren(el('div', 'leaf'));
  marks.delete(index);
  lightPart(index);
  layNotes();
}

/** Draws again the pages now drawn whose sheets have changed width. (One that has not is left
    alone, and whatever is selected on it stays selected.) */
function redraw() {
  if (!book?.pdf) return;
  for (const index of [...book.fetched.keys()]) {
    if (Number(book.parts[index].dataset.drawn) === book.parts[index].clientWidth) continue;
    book.fetched.delete(index);
    drawSheet(book, index);
  }
}
let widening = 0;
window.addEventListener('resize', () => {
  clearTimeout(widening);
  widening = setTimeout(redraw, 250);
});

/** Fetches a section's words into its part, once. (For a PDF: draws the page.) */
function fill(index) {
  const mine = book;
  if (!mine) return Promise.resolve();
  if (mine.pdf) return drawSheet(mine, index);
  if (!mine.fetched.has(index)) {
    const part = mine.parts[index];
    // A part has its true height only once its pictures have come (or failed to): it is
    // not called fetched until then, though never kept waiting more than a couple of seconds.
    const done = (content) => {
      if (content) part.replaceChildren(content);
      part.style.minHeight = '';
      if (book === mine) arrived(index);
      mine.watch?.unobserve(part);
      const pictures = [...part.querySelectorAll('img')].filter((picture) => !picture.complete).map((picture) => new Promise((come) => (picture.onload = picture.onerror = come)));
      return Promise.race([Promise.all(pictures), new Promise((enough) => setTimeout(enough, 2000))]);
    };
    const fetch = async () => {
      const { content, sheets, written } = await Book.section(mine.item, mine, index);
      await dress(mine, sheets, written);
      return content;
    };
    mine.fetched.set(index, fetch().then(done, () => done()));
  }
  return mine.fetched.get(index);
}

/** Lets in a section's styling: the stylesheets it asks for and what is written in its head,
    each once for the book, tamed (book.js) and kept to the book's own parts. */
async function dress(mine, sheets, written) {
  const wear = (css) => {
    const rules = Book.tame(css);
    if (rules.length) mine.sheet.insertRule('@scope (.part) {\n' + rules.join('\n') + '\n}', mine.sheet.cssRules.length);
  };
  for (const path of sheets) {
    if (mine.dressed.has(path)) continue;
    mine.dressed.add(path);
    wear(await window.api.library.text(mine.item.file, path).catch(() => ''));
  }
  if (written.trim() && !mine.dressed.has(written)) {
    mine.dressed.add(written);
    wear(written);
  }
}

/** Fetches a section and the one on either side of it. A place is only found truly once
    what is in sight around it has its real height; a part still empty there would grow
    afterwards and push the place away. */
const around = (index) => Promise.all([index - 1, index, index + 1].filter((i) => i >= 0 && i < book.parts.length).map(fill));

/** How far down the page a thing is, from the top of all there is to scroll. */
const depthOf = (node) => node.getBoundingClientRect().top - $('reading').getBoundingClientRect().top + $('reading').scrollTop;

/** Where the reading line is: which section, and how far through that section. */
function placeNow() {
  if (book.leaf) return { section: book.leaf.section, part: book.leaf.part }; // read in pages: the page, out of the section's
  const line = $('reading').scrollTop + lineOf();
  let section = 0;
  for (let i = 0; i < book.parts.length && depthOf(book.parts[i]) <= line + 1; i++) section = i; // (a pixel of leeway: a part brought exactly to the line is the one you are in)
  const part = book.parts[section];
  return { section, part: Math.max(0, Math.min(1, (line - depthOf(part)) / (part.offsetHeight || 1))) };
}

/** Brings a place to the reading line. */
function seek({ section, part }) {
  if (book.leaf) return setLeaf(Math.min(section, book.parts.length - 1), { part });
  const to = book.parts[Math.min(section, book.parts.length - 1)];
  $('reading').scrollTop = depthOf(to) + part * to.offsetHeight - lineOf();
}

/** A named place within a section of the book, if it is on the page. */
const named = (section, place) => (place && !book.pdf ? book.parts[section].querySelector('#' + CSS.escape('b-' + place)) : null);

/** Goes to a section, or to a named place within it: from the contents, or from a link. */
async function go(section, place) {
  const mine = book;
  if (!mine.pdf) await around(section); // (a PDF's sheets have their true height already)
  if (book !== mine) return;
  const to = named(section, place) || mine.parts[section];
  if (mine.leaf) {
    setLeaf(section, 0); // (shown, so that the place in it can be found)
    setLeaf(section, pageHolding(to, mine.parts[section]));
    around(section);
    note();
  } else $('reading').scrollTop = depthOf(to) - lineOf();
  $('page').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); // it arrives as a page does
}

/** Whether something on the page lies further on than where you are (it must be in the
    section you are in). */
const beyond = (thing) => (book.leaf ? pageHolding(thing, book.parts[book.leaf.section]) > book.leaf.page : depthOf(thing) > $('reading').scrollTop + lineOf() + 1);

/** Notes where you are: on the item (to come back to), in the corner, and in the library. How
    far through the book that is goes by the sizes of its sections. At the very foot of the
    last one, the book is finished. */
function note() {
  if (!book?.ready) return;
  const { item, sections, before } = book;
  const at = placeNow();
  const reading = $('reading');
  const end = book.leaf ? book.leaf.end : reading.scrollTop + reading.clientHeight >= reading.scrollHeight - 4;
  item.at = { section: at.section, part: Math.round(at.part * 1e6) / 1e6 };
  item.progress = end ? 1 : Math.min(0.999, (before[at.section] + at.part * sections[at.section].size) / before.at(-1));
  if (end) item.finished ??= Date.now();
  else delete item.finished;
  if (!book.leaf) $('place').textContent = Math.round(item.progress * 100) + '%'; // (read in pages, the corner says how much of the chapter is left)
  save();
}

/** Puts a real book away, noting where you were. */
function shut() {
  if (!book) return;
  note();
  closeFind();
  find = null;
  remark();
  drawFound();
  closePicker();
  closeNote();
  closeLights();
  if (writing) wrote();
  book.watch?.disconnect();
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== book.sheet);
  Pdf.close(book.pdf);
  book = null;
  pace();
  relight();
  layNow();
  save(true);
}

let noting = false;
$('reading').addEventListener('scroll', () => {
  if (!book?.ready || noting) return;
  noting = true;
  requestAnimationFrame(() => {
    noting = false;
    note();
  });
}, { passive: true });

// A book's own notes. A link to one shows it at its number, in place of going to it. Such a
// link is one the book calls a note's number; or one that leads to a stretch of the book
// which has a link back to where it came from, as a note has.
let noter = null; // the note, when one is up: its element, and the link it is for
let dropped = null; // the link whose note the press now under way put away (pressing a number again closes its note)
const MOST_NOTE = 4000; // letters: what is longer is no note, or is better read where it is
const NUMBER = /^[[(]?[\w*†‡§¶‖#]{1,6}[\])]?[.:]?$/; // a way back that is the note's own number: "1", "[12]", "*"

function closeNote() {
  if (!noter) return;
  noter.node.remove();
  noter = null;
}

/** The note a link on the page leads to, if it leads to one: a copy of it, without its ways
    back (one that is the note's number stays, as a number). */
async function noteOf(link, section) {
  const mine = book;
  const home = mine.parts.findIndex((part) => part.contains(link));
  const block = link.closest(BLOCK);
  if (!link.dataset.place || home < 0 || !block) return null;
  // What the note is in is read from the page if it is there, and apart from it if not (as
  // it must be for what the book keeps out of its reading order, which is never on the page).
  let root = mine.parts[section];
  if (mine.fetched.has(section)) await mine.fetched.get(section);
  else root = (await Book.piece(mine.item, link.dataset.to)).content;
  if (book !== mine || !link.isConnected) return null;
  let note = root.querySelector('#' + CSS.escape('b-' + link.dataset.place));
  while (note && !BLOCKS.has(note.localName)) note = note.parentElement; // (a name on a word or two: the note is the paragraph they are in)
  if (!note || note === root || note.contains(link)) return null;
  const copy = lift(note);
  // A way back leads to the link, or to somewhere in the same paragraph as it.
  const path = mine.sections[home].path;
  const ways = [...copy.querySelectorAll('a')].map((way) => way.dataset.to === path && Boolean(way.dataset.place) && block.contains(named(home, way.dataset.place)));
  if (link.dataset.bNote === undefined && !ways.includes(true)) return null;
  let number = '';
  [...copy.querySelectorAll('a')].forEach((way, index) => {
    if (!ways[index]) return;
    const text = way.textContent.trim();
    if (NUMBER.test(text) && !/^(back|return|up|top)$/i.test(text)) {
      const shown = el('span', 'notepop-number', text);
      way.replaceWith(shown);
      // (A stop written after the number, outside the link, belongs with it: "1." and not "1 .")
      const stop = shown.nextSibling?.nodeType === Node.TEXT_NODE ? shown.nextSibling.data.match(/^[.):\]]+/) : null;
      if (stop) {
        shown.textContent += stop[0];
        shown.nextSibling.data = shown.nextSibling.data.slice(stop[0].length);
      }
      number += shown.textContent;
      return;
    }
    let left = way.parentElement; // whatever held nothing but the way back goes with it
    way.remove();
    while (left && left !== copy && !left.textContent.trim() && !left.querySelector('img, svg, math')) {
      const next = left.parentElement;
      left.remove();
      left = next;
    }
  });
  for (const called of copy.querySelectorAll('[id]')) called.removeAttribute('id');
  for (const styled of copy.querySelectorAll('[style]')) styled.removeAttribute('style');
  const letters = copy.textContent.replace(/\s+/g, '').length;
  if (letters > MOST_NOTE || (letters <= number.length && !copy.querySelector('img, svg, math'))) return null;
  return copy;
}

/** A copy of a note, as one block of its own. Mostly that is the block as it stands. But
    where a book sets its notes out in a table, the note is the whole of the row its name is
    in, number and words; and in a list of terms, it is the term and what is said of it. */
function lift(note) {
  /** What a cell or a term holds, out of it. */
  const held = (from) => {
    const made = el(from.querySelector(BLOCK) ? 'div' : 'span');
    made.append(...from.cloneNode(true).childNodes);
    return made;
  };
  const together = (parts) => {
    const made = el('div');
    parts.forEach((part, index) => made.append(...(index ? [' '] : []), held(part)));
    // (A number that leads nowhere is the note's number all the same.)
    const first = made.firstElementChild;
    if (!first.querySelector('a') && NUMBER.test(first.textContent.trim())) first.className = 'notepop-number';
    return made;
  };
  const row = note.localName === 'tr' ? note : note.localName === 'td' || note.localName === 'th' ? note.closest('tr') : null;
  if (row) return together([...row.cells]);
  // A term, with what follows it up to the next term; or what is said, with its term.
  const term = note.localName === 'dt' ? note : note.localName === 'dd' && note.previousElementSibling?.localName === 'dt' ? note.previousElementSibling : null;
  if (term) {
    const parts = [term];
    for (let next = term.nextElementSibling; next?.localName === 'dd'; next = next.nextElementSibling) parts.push(next);
    return together(parts);
  }
  return note.cloneNode(true);
}

/** Puts a note up at the link to it: under the link's line, centred on it; over the line if
    there is no room beneath. Either way, in the window. */
function openNote(link, note) {
  closeNote();
  closePicker();
  const node = el('div', 'notepop');
  node.setAttribute('role', 'note');
  node.append(...note.childNodes);
  node.addEventListener('click', (e) => {
    const within = e.target.closest('a');
    if (!within) return;
    e.preventDefault();
    closeNote();
    follow(within);
  });
  document.body.append(node);
  const at = link.getBoundingClientRect();
  const mine = node.getBoundingClientRect();
  node.style.left = Math.max(12, Math.min(at.left + at.width / 2 - mine.width / 2, innerWidth - mine.width - 12)) + 'px';
  node.style.top = (at.bottom + 8 + mine.height <= innerHeight - 12 ? at.bottom + 8 : Math.max(12, at.top - mine.height - 8)) + 'px';
  noter = { node, link };
}

/** Follows a link in a book or a PDF: to a note of the book's (shown where the link is), to
    another place in it, or out to the web. */
async function follow(link) {
  if (link.dataset.out) return window.api.library.out(link.dataset.out);
  const mine = book;
  if (mine.pdf) {
    // In a PDF: to the page the link names, and as far down it as it says.
    const at = link.dataset.dest ? await Pdf.place(mine.pdf.doc, JSON.parse(link.dataset.dest)) : null;
    if (book !== mine || !at) return;
    seek(at);
    $('page').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); // it arrives as a page does
    return;
  }
  const section = mine.sections.findIndex((entry) => entry.path === link.dataset.to);
  if (section < 0 && !mine.aside?.includes(link.dataset.to)) return;
  const note = $('page').contains(link) ? await noteOf(link, section).catch(() => null) : null;
  if (book !== mine) return;
  if (note) return openNote(link, note);
  closeNote();
  if (section >= 0) go(section, link.dataset.place);
}

$('page').addEventListener('click', (e) => {
  const link = book && e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  if (e.detail) link.blur(); // (pressed with the pointer: it is not left ringed when a key is next pressed)
  if (link === dropped) return; // (its note was up, and this press put it away)
  follow(link);
});

// A press anywhere but on the note puts it away; so do scrolling and a change in the window's size.
document.addEventListener('mousedown', (e) => {
  dropped = null;
  if (!noter || noter.node.contains(e.target)) return;
  if (e.target.closest?.('a') === noter.link) dropped = noter.link;
  closeNote();
}, true);
$('reading').addEventListener('scroll', closeNote, { passive: true });
window.addEventListener('resize', closeNote);

// The contents: a book's chapters, in a menu hung from the top bar's contents button, open at
// the chapter being read. Choosing one goes to it.
const contentsTool = document.querySelector('[data-tool="contents"]');

contentsTool.addEventListener('click', () => {
  if (menu?.owner === contentsTool) return closeMenu();
  // A real book's contents are its own: titles, some nested under others. The one being
  // read is the last that starts at or before where you are: in an earlier section, or in
  // this one at or above the reading line (or, read in pages, on this page or one before).
  const at = book?.ready ? placeNow().section : -1;
  const here = book?.ready ? book.toc.findLast((entry) => entry.section < at || (entry.section === at && !(named(at, entry.place) && beyond(named(at, entry.place))))) : null;
  const chapters = book ? book.toc.map((entry) => ({ name: entry.title, indent: entry.depth, on: entry === here, run: () => go(entry.section, entry.place) })) : open.chapters.map((name, i) => ({
    lead: String(i + 1),
    name,
    on: i + 1 === open.chapter,
    run: () => {
      open.chapter = i + 1;
      drawPage();
      $('page').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); // it arrives as a page does
    },
  }));
  delete contentsTool.dataset.tip; // open, the menu says what the button is for
  hideTip();
  openMenu(chapters, contentsTool, true);
});

// ---------- pages ----------
// A book or an article can be read a page at a time instead of as one long scroll (the
// text panel says which). Then only the section being read is shown, set in columns the
// height of the window, of which one is in sight: a page. Turning shows the next column;
// past a section's last page comes the next section's first, and before its first the one
// before's last. (The way of it follows foliate-js's paginator: MIT.) A PDF's pages are
// sheets already, and stay as they are.
//
// A turn is drawn as a sheet of paper is turned: going on, the page in sight slides away
// to the left off the next, which lies under it in its shadow; going back, the page before
// slides in from the left over this one. The browser draws it (a view transition: it takes
// a picture of the window as it was, and style.css says how that and the new page move).
//
// Where you are is kept as it is when scrolling: the section, and how far through it,
// which here is the page out of however many the section makes at this size of window and
// of text.

const GUTTER = 80; // between one page and the next: the page's side margins, together (style.css)

/** How far across one page is from the next. */
const stride = (part) => part.clientWidth + GUTTER;

/** How many pages a section makes (it must be the one shown). */
const pagesOf = (part) => Math.max(1, Math.round((part.scrollWidth + GUTTER) / stride(part)));

/** Where something on the page begins. A thing with no place of its own there (an empty
    marker, which is what many a contents entry points at) begins where what follows it does. */
function boxOf(thing) {
  let box = thing.getClientRects()[0];
  if (box || !(thing instanceof Element)) return box;
  const walker = document.createTreeWalker(thing.closest('.part') ?? $('page'), NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  walker.currentNode = thing;
  const range = document.createRange();
  for (let node = walker.nextNode(); node && !box; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) box = node.getClientRects()[0];
    else if (node.nodeValue.trim()) (range.selectNodeContents(node), (box = range.getClientRects()[0]));
  }
  return box;
}

/** Which of its section's pages something on the page is on (its section must be shown). */
function pageHolding(thing, part) {
  const box = boxOf(thing);
  return box ? Math.max(0, Math.floor((box.left - part.getBoundingClientRect().left + 1) / stride(part))) : 0;
}

/** Shows a page of a section, at once: by its number (too high a one is the last), or by how
    far through the section it is. */
function setLeaf(section, page) {
  const leaf = book.leaf;
  const part = book.parts[section];
  for (const other of book.parts) other.classList.toggle('now', other === part);
  const of = pagesOf(part);
  leaf.section = section;
  leaf.of = of;
  leaf.page = Math.max(0, Math.min(typeof page === 'number' ? page : Math.floor(page.part * of + 0.01), of - 1));
  // How far through the section that is: just as far as was asked for, if that was how the
  // page was chosen (so that it is come back to, whatever the pages become meanwhile).
  leaf.part = typeof page === 'number' ? leaf.page / of : page.part;
  leaf.end = section === book.parts.length - 1 && leaf.page === of - 1;
  part.style.transform = `translateX(${-leaf.page * stride(part)}px)`;
  closePicker();
  closeNote();
  layNow();
  recount();
  furnish();
}

// Around the page, read in pages: the chapter it is in, above it; its number in the book,
// under it; and how many pages of the chapter are left, in the corner.
//
// A page's number takes knowing how many pages every section before it makes, which is
// only known by setting each out. That is done behind the page, a section at a time while
// nothing else is happening, once the book is open and again whenever the pages change
// (the text is set anew, or the window changes size). Until it has got as far as the page
// in sight, there is no number to show.

/** Counts the book's pages afresh, if they are not as they were when last counted. */
function recount() {
  const mine = book;
  const leaf = mine.leaf;
  const part = mine.parts[leaf.section];
  const key = [part.clientWidth, part.clientHeight, setting.face, setting.size, setting.spacing].join(' ');
  if (leaf.count?.key !== key) {
    leaf.count = { key, pages: [] }; // how many pages each section makes, as far as is known
    counting(mine, leaf.count);
  }
  leaf.count.pages[leaf.section] = leaf.of; // (the one in sight is known already)
}

async function counting(mine, count) {
  const idle = () => new Promise((go) => requestIdleCallback(go, { timeout: 400 }));
  for (let index = 0; index < mine.parts.length; index++) {
    if (count.pages[index] !== undefined) continue;
    await idle();
    await fill(index);
    while (leafing) await leafing.finished.catch(() => {}); // (not in the middle of a turn)
    if (book !== mine || mine.leaf?.count !== count) return; // shut, or the pages have changed again
    if (count.pages[index] !== undefined) continue;
    // Set out as a page is, but unseen, for as long as it takes to count its pages.
    const part = mine.parts[index];
    part.classList.add('sizing');
    count.pages[index] = bare(part) ? 0 : pagesOf(part);
    part.classList.remove('sizing');
    furnish();
  }
}

/** Writes what goes around the page. */
function furnish() {
  const leaf = book?.leaf;
  if (!leaf) return void ($('running').textContent = $('folio').textContent = '');
  const pages = leaf.count?.pages ?? [];
  /** How many pages a run of sections makes; nothing, if any of them is yet to be counted. */
  const run = (from, to) => {
    let sum = 0;
    for (let index = from; index < to; index++) {
      if (pages[index] === undefined) return null;
      sum += pages[index];
    }
    return sum;
  };
  const before = run(0, leaf.section);
  $('folio').textContent = before === null ? '' : String(before + leaf.page + 1);

  // The chapter: the last of the contents' entries to start at or before this page. It
  // runs to the next entry at its own depth or a shallower one.
  const at = leaf.section;
  const part = book.parts[at];
  const ahead = (entry) => entry.section > at || (entry.section === at && Boolean(named(at, entry.place)) && beyond(named(at, entry.place)));
  const here = book.toc.findLast((entry) => !ahead(entry));
  const next = book.toc.slice(book.toc.indexOf(here) + 1).find((entry) => ahead(entry) && (!here || entry.depth <= here.depth));
  $('running').textContent = here?.title ?? '';
  let left; // pages of the chapter after this one
  if (next?.section === at) {
    // It starts in this section: on a page of its own, if it starts at the head of one.
    const mark = named(at, next.place);
    const head = (boxOf(mark)?.top ?? 0) - part.getBoundingClientRect().top < 48;
    left = Math.max(0, pageHolding(mark, part) - leaf.page - (head ? 1 : 0));
  } else {
    const between = run(at + 1, next ? next.section : book.parts.length);
    left = between === null ? null : leaf.of - 1 - leaf.page + between;
  }
  // (Before the first chapter of a book that has chapters, there is no chapter to speak of.)
  const where = here ? (left ? ' left in chapter' : ' of chapter') : left ? ' left' : '';
  $('place').textContent = left === null || (!here && book.toc.length) ? '' : left ? `${left} ${left === 1 ? 'page' : 'pages'}${where}` : 'Last page' + where;
}

/** Whether a section has nothing in it to read or to look at. */
const bare = (part) => !part.textContent.trim() && !part.querySelector('img, svg');

let leafing = null; // the turn of the page now being drawn

/** Turns the page: on by one, or back by one. */
async function turnPage(by) {
  const mine = book;
  const leaf = mine?.leaf;
  if (!leaf || !mine.ready || leaf.busy) return;
  let to = leaf.section;
  let page = leaf.page + by;
  if (page < 0 || page >= pagesOf(mine.parts[to])) {
    // Out of this section: into the next that has anything in it, or the one before.
    leaf.busy = true;
    for (to += by; to >= 0 && to < mine.parts.length; to += by) {
      await fill(to);
      if (book !== mine || !mine.leaf) return;
      if (!bare(mine.parts[to])) break;
    }
    leaf.busy = false;
    if (to < 0 || to >= mine.parts.length) {
      // There is no further to go. Forwards, that is the end of the book.
      if (by > 0 && !leaf.end) (leaf.end = true), note();
      return;
    }
    page = by > 0 ? 0 : Infinity;
    around(to); // what lies either side is made ready
  }
  const show = () => {
    leaf.busy = false;
    if (book !== mine || !mine.leaf) return;
    setLeaf(to, page);
    note();
  };
  // Drawn as a turn where it can be seen, and where movement is wanted. (One turn is drawn
  // at a time: a turn asked for while another is being drawn cuts that one short.)
  if (!document.startViewTransition || document.visibilityState !== 'visible' || matchMedia('(prefers-reduced-motion: reduce)').matches) return show();
  const root = document.documentElement;
  leafing?.skipTransition();
  root.dataset.turn = by > 0 ? 'on' : 'back';
  leaf.busy = true; // (until the picture of this page has been taken: a moment)
  const turn = (leafing = document.startViewTransition(show));
  const done = () => {
    if (leafing !== turn) return;
    leafing = null;
    delete root.dataset.turn;
  };
  turn.finished.then(done, done);
}

/** Sets the reader to pages or to scrolling, as is chosen for the kind of thing this is: a
    book or an article. A PDF always scrolls. */
function pace() {
  const on = Boolean(book && !book.pdf && setting[paceOf(book.item)] === 'pages');
  $('reading').classList.toggle('paged', on);
  $('page').classList.toggle('paged', on);
  if (!book || Boolean(book.leaf) === on) return;
  if (on) return void (book.leaf = { section: 0, page: 0, of: 1, part: 0, end: false, busy: false });
  delete book.leaf;
  for (const part of book.parts) {
    part.classList.remove('now');
    part.style.transform = '';
  }
  furnish();
  $('place').textContent = Math.round(book.item.progress * 100) + '%';
}

// A page is turned by a click in the margin to either side (or on the arrow that shows
// there), by a swipe or a turn of the wheel, and by the keys (further down).
$('reading').addEventListener('click', (e) => {
  if (!book?.leaf || !getSelection().isCollapsed) return;
  const arrow = e.target.closest('.turner');
  if (arrow) return turnPage(Number(arrow.dataset.by));
  if (![$('reading'), $('page'), $('margin')].includes(e.target)) return;
  const box = $('page').getBoundingClientRect();
  if (e.clientX < box.left + GUTTER / 2) turnPage(-1);
  else if (e.clientX > box.right - GUTTER / 2) turnPage(1);
});

// The arrow at either side shows while the pointer is in that margin.
$('reading').addEventListener('mousemove', (e) => {
  const box = $('page').getBoundingClientRect();
  $('reading').dataset.side = e.clientX < box.left + GUTTER / 2 ? 'back' : e.clientX > box.right - GUTTER / 2 ? 'on' : '';
});
$('reading').addEventListener('mouseleave', () => ($('reading').dataset.side = ''));

// One swipe of the trackpad or turn of the wheel, either way, is one page: once it has
// turned the page, the rest of it is let go, as it runs on and dies away. The window is
// told how far a swipe has gone but not when the fingers are put down or lifted, so where
// one swipe ends and the next begins has to be judged from the run of it. Another swipe is
// taken to have begun when nothing has come for a tenth of a second; or, a third of a
// second or more after the turn, when the run had fallen to a fifth of its height (or all
// but stopped) and then climbs again, each of four steps bigger than the last. (Coasting
// only ever falls away; fingers setting off again climb.)
const pushed = { sum: 0, when: 0, spent: false, since: 0, peak: 0, low: Infinity, last: [0, 0, 0] };
$('reading').addEventListener('wheel', (e) => {
  if (!book?.leaf || e.ctrlKey) return;
  const by = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const size = Math.abs(by);
  const [a, b, c] = pushed.last;
  const climbing = a < b && b < c && c < size && size >= 20;
  const fallen = pushed.low <= Math.max(3, pushed.peak / 5);
  if (e.timeStamp - pushed.when > 100 || (pushed.spent && e.timeStamp - pushed.since > 350 && fallen && climbing)) (pushed.sum = 0), (pushed.spent = false);
  pushed.when = e.timeStamp;
  pushed.last = [b, c, size];
  if (pushed.spent) {
    pushed.peak = Math.max(pushed.peak, size);
    pushed.low = Math.min(pushed.low, size);
    return;
  }
  pushed.sum += by;
  if (Math.abs(pushed.sum) < 50) return;
  pushed.spent = true;
  pushed.since = e.timeStamp;
  pushed.peak = size;
  pushed.low = size;
  turnPage(pushed.sum > 0 ? 1 : -1);
}, { passive: true });

// The window changing size makes other pages of the section: the one shown is the one that
// holds where you were.
new ResizeObserver(() => {
  if (book?.leaf && book.ready && !book.leaf.busy) setLeaf(book.leaf.section, { part: book.leaf.part });
}).observe($('reading'));

// ---------- finding in what is open ----------
// Find looks through the whole of the book, article or PDF that is open, a section at a
// time, reading each one's words as they are wanted and keeping them while it stays open.
// What is found is listed in a panel hung from the top bar's find button, each with the
// words around it, under the chapter it is in (or, in a PDF, the page); choosing one goes to
// it. Those on the page are marked there, until the field is emptied.
//
// The way of it follows foliate-js (search.js and text-walker.js, MIT, by John Factotum):
// the words of a section are its text nodes laid end to end, a match is found in that one
// string, and is turned back into the stretch of the page it came from.

// Where one of these ends, so does a word.
const BLOCKS = new Set('address article aside blockquote br dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li ol p pre section table td th tr ul'.split(' '));
const BLOCK = [...BLOCKS].join(', '); // (as a selector)

/** The words under a node as one string: its text nodes end to end, with a space wherever a
    block or a line ends. With it, each text node and where in the string it starts, and
    where each named element starts. */
function textOf(root) {
  let text = '';
  let gap = false;
  const nodes = [];
  const names = new Map();
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (gap && text) text += ' ';
        gap = false;
        nodes.push([child, text.length]);
        text += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const block = BLOCKS.has(child.localName);
        if (block) gap = true;
        if (child.id) names.set(child.id, text.length);
        walk(child);
        if (block) gap = true;
      }
    }
  };
  walk(root);
  return { text, nodes, names };
}

const QUOTES = { '‘': "'", '’': "'", '“': '"', '”': '"' };

/** Text as it is searched: without accents or capitals, its curled quotes straightened, what
    cannot be seen (a soft hyphen, say) left out, and each run of space as one space. With it,
    for each letter, where in the text it came from, and where that ended. */
function folded(text) {
  let out = '';
  let spaced = true; // no space is wanted next: at the start, or after one
  const from = [];
  const to = [];
  for (let i = 0, size; i < text.length; i += size) {
    const code = text.charCodeAt(i);
    size = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
    let piece;
    if (code < 128) {
      piece = code === 32 || (code >= 9 && code <= 13) ? ' ' : code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : text[i];
    } else {
      const letter = text.slice(i, i + size);
      piece = /\s/.test(letter) ? ' ' : QUOTES[letter] ?? plainOf(letter).replace(/\p{Cf}/gu, '');
    }
    if (!piece || (piece === ' ' && spaced)) continue;
    spaced = piece === ' ';
    for (let k = 0; k < piece.length; k++) from.push(i), to.push(i + size);
    out += piece;
  }
  return { text: out, from, to };
}

/** Where folded text holds what is asked for: each a start and an end in the text it was
    folded from. */
function hits(fold, asked) {
  const found = [];
  for (let at = fold.text.indexOf(asked); at >= 0; at = fold.text.indexOf(asked, at + asked.length)) found.push([fold.from[at], fold.to[at + asked.length - 1]]);
  return found;
}

/** The stretch of the page between two places in a node's words (as textOf gave them). */
function rangeOf(nodes, start, end) {
  const holding = (place) => {
    let low = 0;
    let high = nodes.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (nodes[mid][1] <= place) low = mid;
      else high = mid - 1;
    }
    return nodes[low];
  };
  const [first, began] = holding(start);
  const [last, begun] = holding(end - 1);
  const range = document.createRange();
  range.setStart(first, Math.min(start - began, first.length));
  range.setEnd(last, Math.min(end - begun, last.length));
  return range;
}

/** One section's words, read once: the text, where its named places are, and the text
    folded for searching. */
function wordsOf(mine, index) {
  mine.words ??= new Map();
  if (!mine.words.has(index)) {
    const read = mine.pdf ? Pdf.text(mine.pdf.doc, index + 1).then((text) => ({ text, names: new Map() })) : Book.text(mine.item, mine, index).then(textOf);
    mine.words.set(index, read.then(({ text, names }) => ({ text, names, fold: folded(text) })));
  }
  return mine.words.get(index);
}

/** What is found, with a few of the words before it and rather more of those after, each
    cut at the edge of a word. */
function quoted(text, start, end) {
  const LEAD = 28;
  const TAIL = 72;
  const squeezed = (words) => words.replace(/\s+/g, ' ');
  let pre = squeezed(text.slice(Math.max(0, start - LEAD * 3), start)).trimStart();
  if (pre.length > LEAD) pre = '…' + pre.slice(-LEAD).replace(/^\S*\s/, '');
  let post = squeezed(text.slice(end, end + TAIL * 3)).trimEnd();
  if (post.length > TAIL) post = post.slice(0, TAIL).replace(/\s\S*$/, '') + '…';
  return { pre, hit: squeezed(text.slice(start, end)), post };
}

/** What a find is listed under: in a PDF its page, otherwise the last of the contents'
    entries to start at or before it (none, if it comes before them all). */
function headOf(mine, section, start, names) {
  if (mine.pdf) return 'Page ' + (section + 1);
  return mine.toc.findLast((entry) => entry.section < section || (entry.section === section && (names.get(entry.place) ?? 0) <= start))?.title ?? '';
}

const MOST = 1000; // as many as are listed
let find = null; // what is being looked for in what is open: the words asked for, what has been found so far, and which of those has been gone to
const findTool = document.querySelector('[data-tool="find"]');

/** Looks for what is asked through the whole of what is open, listing what is found as it
    goes. Asking for nothing puts the find away. */
async function look(query) {
  const mine = book;
  const asked = folded(query).text.trim();
  if (find) find.query = query;
  if (asked === (find?.asked ?? '')) return;
  const run = (find = asked ? { query, asked, found: [], at: -1, done: false, more: false } : null);
  remark();
  drawFound();
  if (!run) return;
  let drawn = performance.now();
  for (let section = 0; section < mine.parts.length && !run.more; section++) {
    const words = await wordsOf(mine, section).catch(() => null);
    if (book !== mine || find !== run) return; // shut, or something else asked for, meanwhile
    const before = run.found.length;
    for (const [start, end] of words ? hits(words.fold, asked) : []) {
      if (run.found.length === MOST) {
        run.more = true;
        break;
      }
      run.found.push({ section, nth: run.found.length - before, head: headOf(mine, section, start, words.names), ...quoted(words.text, start, end) });
    }
    if (run.found.length > before && performance.now() - drawn > 100) {
      drawFound();
      drawn = performance.now();
    }
  }
  run.done = true;
  drawFound();
}

// What is found is marked on the page as the selection is, by stretches of it that the
// stylesheet colours (::highlight): nothing on the page is changed. A part's are worked out
// when its words arrive, and again when what is asked for changes.
const marks = new Map(); // for each part that has any, its stretches, in order
const lines = new WeakMap(); // the words of a part on the page, worked out once

/** Works out the marks of one part of the page. */
function markPart(index) {
  marks.delete(index);
  const root = find && rootOf(index);
  if (!root) return;
  const words = linesOf(root);
  words.fold ??= folded(words.text);
  const ranges = hits(words.fold, find.asked).map(([start, end]) => rangeOf(words.nodes, start, end));
  if (ranges.length) marks.set(index, ranges);
}

/** Shows the marks: the one gone to apart from the rest. */
function paint() {
  const here = find?.found[find.at];
  const now = here && marks.get(here.section)?.[here.nth];
  const rest = new Highlight();
  for (const ranges of marks.values()) for (const range of ranges) if (range !== now) rest.add(range);
  const one = now ? new Highlight(now) : new Highlight();
  rest.priority = 1; // over a highlight, a mark of find's shows
  one.priority = 2;
  CSS.highlights.set('found', rest);
  CSS.highlights.set('found-here', one);
}

/** Marks afresh every part now on the page. */
function remark() {
  marks.clear();
  if (book && find) for (const index of book.fetched.keys()) markPart(index);
  paint();
}

/** A part's words have just arrived on the page (or arrived again): what find has found
    in it is marked, and what is highlighted in it washed. */
function arrived(index) {
  lines.delete(book.parts[index]);
  if (find) {
    markPart(index);
    paint();
  }
  lightPart(index);
  paintLights();
  layNotes();
}

/** Goes to one of what was found. */
async function goFound(at) {
  const mine = book;
  const run = find;
  const hit = run.found[at];
  run.at = at;
  if (finder) clearTimeout(finder.wait), (finder.wait = 0); // (anything typed since is let go)
  closeFind();
  await (mine.pdf ? fill(hit.section) : around(hit.section));
  if (book !== mine || find !== run) return;
  paint();
  bring(marks.get(hit.section)?.[hit.nth], hit.section);
}

/** Brings a stretch of the page a third of the way down the window; or, if it is not to be
    seen there (the book hides its words, say), its part to the reading line. */
function bring(range, section) {
  const reading = $('reading');
  if (book.leaf) {
    // Read in pages: the page it is on. (Its section is shown first, so that it can be found there.)
    setLeaf(section, 0);
    if (range?.getClientRects().length) setLeaf(section, pageHolding(range, book.parts[section]));
    around(section);
    note();
  } else if (range?.getClientRects().length) reading.scrollTop += range.getBoundingClientRect().top - reading.getBoundingClientRect().top - reading.clientHeight * 0.3;
  else reading.scrollTop = depthOf(book.parts[section]) - lineOf();
  $('page').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); // it arrives as a page does
}

let finder = null; // the find panel, when it is open: its parts, the find it shows, and the row marked

/** Marks a row of the list, the one Return goes to, and if asked brings it into view. */
function markRow(index, show) {
  finder.rows[finder.mark]?.classList.remove('on');
  finder.mark = index;
  const row = finder.rows[index];
  row?.classList.add('on');
  if (!row || !show) return;
  // Into view in the list: in the middle of it, or only as far as it must come.
  const box = row.getBoundingClientRect();
  const frame = finder.list.getBoundingClientRect();
  if (show === 'middle') finder.list.scrollTop += box.top - frame.top - (frame.height - box.height) / 2;
  else if (box.top < frame.top) finder.list.scrollTop += box.top - frame.top;
  else if (box.bottom > frame.bottom) finder.list.scrollTop += box.bottom - frame.bottom;
}

/** Lists what has been found so far: only what is new since it was last drawn is added. */
function drawFound() {
  findTool.classList.toggle('on', Boolean(find));
  if (!finder) return;
  const { list, rows } = finder;
  const fresh = finder.shown !== find;
  if (fresh) {
    finder.shown = find;
    finder.mark = -1;
    rows.length = 0;
    list.replaceChildren();
  }
  const found = find?.found ?? [];
  list.querySelector('.finder-none')?.remove();
  for (let index = rows.length; index < found.length; index++) {
    const hit = found[index];
    if (hit.head && hit.head !== found[index - 1]?.head) list.append(el('div', 'finder-label', hit.head));
    const row = el('button', 'finder-row');
    row.type = 'button';
    const words = el('span', 'finder-words');
    words.append(hit.pre, el('b', '', hit.hit), hit.post);
    row.append(words);
    row.addEventListener('click', () => goFound(index));
    row.addEventListener('pointermove', () => finder.mark === index || markRow(index));
    rows.push(row);
    list.append(row);
  }
  const kind = open.kind === 'pdf' ? 'PDF' : open.kind;
  if (find?.done && !found.length) list.append(el('p', 'finder-none', `Nothing in this ${kind} matches.`));
  if (find?.more) list.append(el('p', 'finder-none', `Only the first ${MOST.toLocaleString('en-US')} are listed.`));
  list.hidden = !find;
  finder.count.textContent = found.length ? found.length.toLocaleString('en-US') + (find.more ? '+' : '') : '';
  finder.busy.hidden = !find || find.done; // still looking through the book
  finder.clear.hidden = !finder.field.value;
  // The row marked to begin with is the one last gone to, in the middle of the list, or else the first.
  if (finder.mark < 0 && found.length) markRow(Math.max(0, find.at), fresh && find.at > 0 ? 'middle' : null);
}

function closeFind() {
  if (!finder) return;
  const { node, field, wait } = finder;
  finder = null;
  easeOut(node);
  if (wait) look(field.value); // what was typed last is what is looked for
  clearTimeout(wait);
  findTool.setAttribute('aria-expanded', 'false');
  findTool.dataset.tip = findTool.getAttribute('aria-label');
  settle();
}

function openFind() {
  if (!book) return;
  if (finder) return finder.field.select();
  closeNote();
  closeMenu();
  closePanel();
  closeLights();
  hideTip();
  const kind = open.kind === 'pdf' ? 'PDF' : open.kind;
  const node = el('form', 'menu finder');
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', `Find in this ${kind}`);
  const field = el('input', 'finder-field');
  field.type = 'text';
  field.placeholder = `Find in this ${kind}`;
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.setAttribute('aria-label', field.placeholder);
  field.value = find?.query ?? '';
  const count = el('span', 'finder-count');
  const clear = el('button', 'finder-clear');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Clear');
  clear.append(el('span', 'icon'));
  const busy = tick('late');
  busy.hidden = true;
  const head = el('label', 'finder-head');
  head.append(el('span', 'icon'), field, busy, count, clear);
  const list = el('div', 'finder-list');
  node.append(head, list);
  finder = { node, field, busy, count, clear, list, rows: [], shown: null, mark: -1, wait: 0 };

  const ask = () => {
    clearTimeout(finder.wait);
    finder.wait = 0;
    look(field.value);
  };
  field.addEventListener('input', () => {
    clear.hidden = !field.value;
    clearTimeout(finder.wait);
    if (field.value.trim()) finder.wait = setTimeout(ask, 150); // once the typing pauses
    else ask();
  });
  clear.addEventListener('click', () => {
    field.value = '';
    ask();
    field.focus();
  });
  node.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !finder.rows.length) return;
    e.preventDefault();
    markRow((Math.max(0, finder.mark) + (e.key === 'ArrowDown' ? 1 : -1) + finder.rows.length) % finder.rows.length, 'nearest');
  });
  // Return looks at once for what has just been typed; then it goes to the row marked.
  node.addEventListener('submit', (e) => {
    e.preventDefault();
    if (finder.wait) ask();
    else if (finder.rows[finder.mark]) goFound(finder.mark);
  });

  document.body.append(node);
  // Under its button, their right edges together, as a menu hangs.
  const from = findTool.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  node.style.left = Math.max(8, Math.min(from.right - box.width, innerWidth - box.width - 8)) + 'px';
  node.style.top = from.bottom + 6 + 'px';
  easeIn(node);
  findTool.setAttribute('aria-expanded', 'true');
  delete findTool.dataset.tip; // open, the panel says what the button is for
  drawFound();
  field.select();
  settle();
}

findTool.addEventListener('click', () => (finder ? closeFind() : openFind()));
// A press anywhere else closes it, as does the window changing size or losing the keyboard.
document.addEventListener('mousedown', (e) => {
  if (finder && !finder.node.contains(e.target) && !findTool.contains(e.target)) closeFind();
}, true);
window.addEventListener('blur', closeFind);
window.addEventListener('resize', closeFind);

// ---------- highlights and notes ----------
// Selecting words on the page brings up a row of colours; choosing one highlights them. A
// highlight may have a note, which is written in the margin beside it: on the right, or on
// the left where the right is taken. A click on a highlight brings the row back, to change
// its colour, write its note, or take it away.
//
// A highlight is kept as a place in its section's words (as find reads them: textOf), with
// the words themselves, so that it can be found again should the place ever shift. They
// are kept in a file of the item's own (library.js). On the page they are washed as find's
// marks are, by stretches the stylesheet colours: nothing on the page is changed.

const LIGHTS = [2, 0, 3, 5, 1]; // the colours a highlight can take, of the collections' (HUES): yellow, green, blue, pink, violet
const lit = new Map(); // for each highlight now on the page, its stretch of it

/** The words of a part on the page, worked out once (until its words arrive again). */
function linesOf(root) {
  if (!lines.has(root)) {
    const { text, nodes } = textOf(root);
    lines.set(root, { text, nodes, fold: null });
  }
  return lines.get(root);
}

/** Where a part's words are on the page: the part itself, or in a PDF the words laid over its picture. */
const rootOf = (index) => (book.pdf ? book.parts[index].querySelector('.words') : book.parts[index]);

/** Works out where one part's highlights are on the page. */
function lightPart(index) {
  for (const light of book.lights) if (light.section === index) lit.delete(light.id);
  const root = book.fetched.has(index) && rootOf(index);
  if (!root) return;
  const { text, nodes } = linesOf(root);
  if (!nodes.length) return;
  for (const light of book.lights) {
    if (light.section !== index) continue;
    const at = spanOf(light, text);
    if (at) lit.set(light.id, rangeOf(nodes, at[0], at[1]));
  }
}

/** Where a highlight's words are in its section's text: where it says they start and end;
    or, if they are not there now (the section is read a little differently, say), where
    they next appear, nearest to there. Nothing, if they are nowhere in it. */
function spanOf(light, text) {
  if (text.slice(light.start, light.end) === light.text) return [light.start, light.end];
  let near = -1;
  for (let at = text.indexOf(light.text); at >= 0; at = text.indexOf(light.text, at + 1)) if (near < 0 || Math.abs(at - light.start) < Math.abs(near - light.start)) near = at;
  return near < 0 ? null : [near, near + light.text.length];
}

/** The highlights of a section that a stretch of it runs into, each with where it is. */
function meeting(place) {
  const root = book.fetched.has(place.section) && rootOf(place.section);
  if (!root) return [];
  const { text } = linesOf(root);
  return book.lights.filter((light) => light.section === place.section).map((light) => ({ light, at: spanOf(light, text) })).filter(({ at }) => at && at[0] < place.end && at[1] > place.start);
}

/** Shows the highlights: each colour's together. */
function paintLights() {
  for (const hue of LIGHTS) {
    const washed = new Highlight();
    for (const light of book?.lights ?? []) if (light.hue === hue && lit.has(light.id)) washed.add(lit.get(light.id));
    CSS.highlights.set('light-' + hue, washed);
  }
}

/** Works out afresh every highlight on the page. */
function relight() {
  lit.clear();
  if (book) for (const index of book.fetched.keys()) lightPart(index);
  paintLights();
  layNotes();
}

const keepLights = () => window.api.library.keepHighlights(book.item.file, book.item.title, book.lights);

/** Where in a part's words a place on the page is: within a text node, or, at the edge of an
    element, where the next of the words after it starts. */
function offsetOf({ text, nodes }, node, offset) {
  const held = node.nodeType === Node.TEXT_NODE && nodes.find(([one]) => one === node);
  if (held) return held[1] + offset;
  const point = document.createRange();
  point.setStart(node, offset);
  const next = nodes.find(([one]) => point.comparePoint(one, 0) >= 0);
  return next ? next[1] : text.length;
}

/** What is selected on the page, as a place in one part's words (the part it starts in),
    without the space at either end of it. Nothing, if nothing there is selected. */
function chosen() {
  const selection = getSelection();
  if (!book || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const from = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const part = from?.closest('.part, .sheet');
  const index = book.parts.indexOf(part);
  const root = index >= 0 && rootOf(index);
  if (!root) return null;
  const words = linesOf(root);
  if (!words.nodes.length) return null;
  let start = root.contains(range.startContainer) ? offsetOf(words, range.startContainer, range.startOffset) : 0;
  let end = root.contains(range.endContainer) ? offsetOf(words, range.endContainer, range.endOffset) : words.text.length;
  while (start < end && /\s/.test(words.text[start])) start++;
  while (end > start && /\s/.test(words.text[end - 1])) end--;
  return start < end ? { section: index, start, end, text: words.text.slice(start, end) } : null;
}

/** Highlights a place in a colour. Highlights it runs into are taken into it: what is made
    is one highlight, from where the first of them starts to where the last ends, in this
    colour, with whatever notes they had (one after another). */
function addLight(place, hue) {
  const met = meeting(place).sort((a, b) => a.at[0] - b.at[0]);
  const start = Math.min(place.start, ...met.map(({ at }) => at[0]));
  const end = Math.max(place.end, ...met.map(({ at }) => at[1]));
  const text = met.length ? linesOf(rootOf(place.section)).text.slice(start, end) : place.text;
  for (const { light } of met) {
    if (light === writing) wrote();
    book.lights.splice(book.lights.indexOf(light), 1);
    lit.delete(light.id);
  }
  const light = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), section: place.section, start, end, text, hue, note: met.map(({ light }) => light.note).filter(Boolean).join('\n\n'), made: Date.now() };
  book.lights.push(light);
  lightPart(light.section);
  paintLights();
  layNotes();
  keepLights();
  return light;
}

/** Takes a highlight away, and its note with it. */
function removeLight(light) {
  book.lights.splice(book.lights.indexOf(light), 1);
  lit.delete(light.id);
  paintLights();
  layNotes();
  keepLights();
}

/** The highlight under a point of the window, if there is one: the shortest, where they overlap. */
function lightAt(x, y) {
  let under = null;
  for (const light of book.lights) {
    const range = lit.get(light.id);
    if (!range || (under && under.end - under.start <= light.end - light.start)) continue;
    if ([...range.getClientRects()].some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) under = light;
  }
  return under;
}

// The row of colours: a pill of them as a collection's are shown, then a line, then the way
// to a note; and, for a highlight already made, the way to take it away.
let picker = null; // the row, when it is up

function closePicker() {
  if (!picker) return;
  picker.remove();
  picker = null;
  hideTip();
}

/** Puts the row up over a stretch of the page: for a place selected (to highlight it), or
    for a highlight (to change it). */
function openPicker(range, place, light) {
  closePicker();
  closeMenu();
  closePanel();
  closeFind();
  closeLights();
  const node = el('div', 'picker');
  node.setAttribute('role', 'toolbar');
  node.setAttribute('aria-label', 'Highlight');
  const tool = (icon, label, run) => {
    const made = el('button', 'picker-tool');
    made.type = 'button';
    made.dataset.tip = label;
    made.setAttribute('aria-label', label);
    const drawn = el('span', 'menu-icon');
    drawn.dataset.icon = icon;
    made.append(drawn);
    made.addEventListener('click', () => {
      closePicker();
      run();
    });
    return made;
  };
  const last = () => LIGHTS.find((hue) => String(hue) === localStorage.getItem('hue')) ?? LIGHTS[0];
  /** The highlight this is for: made now, in the colour last used, if it is yet to be. */
  const made = () => {
    getSelection().removeAllRanges();
    return light ?? addLight(place, last());
  };
  for (const hue of LIGHTS) {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.dataset.hue = hue;
    swatch.dataset.tip = HUES[hue];
    swatch.setAttribute('aria-label', HUES[hue]);
    swatch.setAttribute('aria-pressed', String(light?.hue === hue));
    swatch.addEventListener('click', () => {
      closePicker();
      localStorage.setItem('hue', hue);
      const one = made();
      if (one.hue === hue) return;
      one.hue = hue;
      paintLights();
      keepLights();
    });
    node.append(swatch);
  }
  node.append(el('span', 'picker-line'), tool('pen', light?.note ? 'Edit note' : 'Add a note', () => writeNote(made())));
  if (light) node.append(tool('bin', 'Remove highlight', () => (getSelection().removeAllRanges(), removeLight(light))));
  node.addEventListener('mousedown', (e) => e.preventDefault()); // a press on it leaves what is selected as it is
  document.body.append(node);
  // Over the first line of the stretch, their left edges together; under its last line if
  // there is no room above. Either way, in the window.
  const boxes = range.getClientRects();
  const mine = node.getBoundingClientRect();
  const above = boxes[0].top - mine.height - 8;
  node.style.left = Math.max(8, Math.min(boxes[0].left, innerWidth - mine.width - 8)) + 'px';
  node.style.top = (above >= 8 ? above : Math.min(boxes[boxes.length - 1].bottom + 8, innerHeight - mine.height - 8)) + 'px';
  picker = node;
}

// The row comes up when a selection is finished on the page, or a highlight is clicked.
let pressed = false; // the pointer went down on the page
document.addEventListener('mousedown', (e) => {
  if (picker && !picker.contains(e.target)) closePicker();
  pressed = e.button === 0 && $('page').contains(e.target);
}, true);
document.addEventListener('mouseup', (e) => {
  if (!pressed || !book) return;
  pressed = false;
  const { clientX: x, clientY: y } = e;
  const link = e.target.closest?.('a');
  // (Once the selection has settled: a click on what was selected takes the selection away.)
  setTimeout(() => {
    if (!book || picker) return;
    const place = chosen();
    if (place) {
      // What is selected wholly inside a highlight is that highlight's to change: the row is
      // its own, as when it is clicked. (The shortest, where one lies inside another.)
      const inside = meeting(place).filter(({ at }) => at[0] <= place.start && at[1] >= place.end).sort((a, b) => a.at[1] - a.at[0] - (b.at[1] - b.at[0]))[0];
      return openPicker(rangeOf(linesOf(rootOf(place.section)).nodes, place.start, place.end), inside ? null : place, inside?.light);
    }
    const light = !link && lightAt(x, y);
    if (light) openPicker(lit.get(light.id), null, light);
  });
});
$('reading').addEventListener('scroll', closePicker, { passive: true });
window.addEventListener('blur', closePicker);
window.addEventListener('resize', closePicker);

// The notes. Each is set in the margin level with the line its highlight starts on: on the
// right; on the left if the one above on the right is in the way; and if both are, on
// whichever side is free sooner, as high as it can go. Where the margins are too narrow for
// writing, a note is a dot there, which opens when it is clicked.
const asides = new Map(); // for each note on the page, its element
let writing = null; // the highlight whose note is being written, and so is shown though it may be empty
let laying = 0;

/** Sets the notes out afresh, once the page has settled. */
function layNotes() {
  cancelAnimationFrame(laying);
  laying = requestAnimationFrame(layNow);
}

function layNow() {
  cancelAnimationFrame(laying);
  const reading = $('reading');
  const frame = reading.getBoundingClientRect();
  // The column of text: the page, within its side margins.
  const column = $('page').getBoundingClientRect();
  const left = column.left + GUTTER / 2 - frame.left;
  const right = column.right - GUTTER / 2 - frame.left;
  // (Read in pages, only what is on the page in sight.)
  const first = (light) => lit.get(light.id)?.getClientRects()[0];
  const shown = (book?.lights ?? []).filter((light) => (light.note || light === writing) && first(light) && (!book.leaf || (first(light).left - frame.left >= left - 1 && first(light).left - frame.left < right)));
  for (const [light, node] of asides) {
    if (shown.includes(light)) continue;
    if (light === writing) wrote(); // (its words are kept, though its place has left the page)
    node.remove();
    asides.delete(light);
  }
  if (!shown.length) return;
  const GAP = 22; // between the text and a note
  const EDGE = 16; // between a note and the window
  const LINE = 18; // a note's line
  const placed = shown.map((light) => {
    const box = first(light);
    return { light, y: box.top - frame.top + reading.scrollTop + (box.height - LINE) / 2 };
  }).sort((a, b) => a.y - b.y);
  const ends = { right: -Infinity, left: -Infinity }; // how far down each margin is taken
  for (const { light, y } of placed) {
    const room = Math.min(200, left - GAP - EDGE, reading.clientWidth - right - GAP - EDGE);
    const slim = room < 120;
    let node = asides.get(light);
    if (!node) {
      node = el('div', 'aside');
      node.addEventListener('click', () => light === writing || writeNote(light));
      asides.set(light, node);
      $('margin').append(node);
    }
    if (light !== writing) node.textContent = light.note;
    node.classList.toggle('slim', slim);
    node.classList.toggle('writing', light === writing);
    node.dataset.tip = slim && light !== writing ? light.note : '';
    if (!node.dataset.tip) delete node.dataset.tip;
    if (slim) {
      // A dot just beyond the text; open, a card as near to it as the window allows.
      node.classList.remove('left');
      node.style.width = '';
      node.style.left = (light === writing ? Math.max(8, Math.min(right + 12, reading.clientWidth - 236)) : Math.min(right + 12, reading.clientWidth - 14)) + 'px';
      node.style.top = y + (light === writing ? -10 : 5) + 'px';
      continue;
    }
    node.style.width = room + 'px';
    const side = y >= ends.right + 8 ? 'right' : y >= ends.left + 8 ? 'left' : ends.right <= ends.left ? 'right' : 'left';
    const top = Math.max(y, ends[side] + 8);
    node.classList.toggle('left', side === 'left');
    node.style.left = (side === 'right' ? right + GAP : left - GAP - room) + 'px';
    node.style.top = top + 'px';
    ends[side] = top + node.offsetHeight;
  }
}

/** Opens a highlight's note for writing, in its place in the margin. */
function writeNote(light) {
  if (writing) wrote();
  writing = light;
  layNow();
  const node = asides.get(light);
  if (!node) return void (writing = null); // its highlight is not on the page
  node.contentEditable = 'plaintext-only';
  node.focus();
  getSelection().selectAllChildren(node);
  getSelection().collapseToEnd();
  node.oninput = layNotes; // as it grows, those under it make way
  node.onblur = wrote;
  node.onkeydown = (e) => {
    // Return or Escape finishes it (Shift-Return starts a new line).
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      node.blur();
    }
  };
}

/** The note being written is finished: it is kept (and one left empty is no note). */
function wrote() {
  const light = writing;
  const node = asides.get(light);
  if (!light) return;
  writing = null;
  if (node) {
    node.onblur = node.oninput = node.onkeydown = null;
    node.contentEditable = 'false';
    const words = node.textContent.trim();
    if (words !== light.note && book?.lights.includes(light)) {
      light.note = words;
      keepLights();
    }
  }
  layNow();
}

// The notes keep their places as the page changes shape: the text is set anew, the window
// changes size, a section's words or pictures arrive.
const shaped = new ResizeObserver(layNotes);
shaped.observe($('page'));
shaped.observe($('reading'));

// ---------- the list of highlights ----------
// What is highlighted in what is open, listed in a panel hung from the top bar's highlights
// button as find's is: each highlight's words beside a rule of its colour, its note under
// them, under the chapter it is in (or, in a PDF, the page). Choosing one goes to it.

const lightsTool = document.querySelector('[data-tool="lights"]');
let lister = null; // the list of highlights, when it is open

function closeLights() {
  if (!lister) return;
  easeOut(lister);
  lister = null;
  lightsTool.setAttribute('aria-expanded', 'false');
  lightsTool.dataset.tip = lightsTool.getAttribute('aria-label');
  settle();
}

/** Goes to a highlight. */
async function goLight(light) {
  const mine = book;
  closeLights();
  await (mine.pdf ? fill(light.section) : around(light.section));
  if (book === mine) bring(lit.get(light.id), light.section);
}

async function openLights() {
  const mine = book;
  if (!mine) return;
  closeMenu();
  closePanel();
  closeFind();
  closePicker();
  hideTip();
  const kind = open.kind === 'pdf' ? 'PDF' : open.kind;
  const node = el('div', 'menu finder lights');
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', 'Highlights');
  node.tabIndex = -1;
  const list = el('div', 'finder-list');
  node.append(list);
  lister = node;
  lightsTool.setAttribute('aria-expanded', 'true');
  delete lightsTool.dataset.tip; // open, the panel says what the button is for
  settle();

  // In the order they come in the book, each under the chapter it is in: which that is
  // takes the words of its section, read once.
  const kept = [...mine.lights].sort((a, b) => a.section - b.section || a.start - b.start);
  const heads = await Promise.all(kept.map(async (light) => headOf(mine, light.section, light.start, mine.pdf ? null : ((await wordsOf(mine, light.section).catch(() => null))?.names ?? new Map()))));
  if (lister !== node) return; // closed meanwhile
  const rows = kept.map((light, index) => {
    const row = el('button', 'finder-row');
    row.type = 'button';
    const quote = el('span', 'lights-quote', light.text.replace(/\s+/g, ' '));
    quote.dataset.hue = light.hue;
    row.append(quote);
    if (light.note) row.append(el('span', 'lights-note', light.note));
    row.addEventListener('click', () => goLight(light));
    row.addEventListener('pointermove', () => at === index || mark(index));
    if (heads[index] && heads[index] !== heads[index - 1]) list.append(el('div', 'finder-label', heads[index]));
    list.append(row);
    return row;
  });
  if (!rows.length) list.append(el('p', 'finder-none', `Nothing is highlighted in this ${kind} yet.`));
  let at = -1; // the row marked: the one Return goes to
  const mark = (index, show) => {
    rows[at]?.classList.remove('on');
    at = index;
    rows[at].classList.add('on');
    if (!show) return;
    const box = rows[at].getBoundingClientRect();
    const frame = list.getBoundingClientRect();
    if (show === 'middle') list.scrollTop += box.top - frame.top - (frame.height - box.height) / 2;
    else if (box.top < frame.top) list.scrollTop += box.top - frame.top;
    else if (box.bottom > frame.bottom) list.scrollTop += box.bottom - frame.bottom;
  };
  node.addEventListener('keydown', (e) => {
    if (!rows.length) return;
    if (e.key === 'Enter') return void (e.preventDefault(), goLight(kept[at]));
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    mark((at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length, 'nearest');
  });

  document.body.append(node);
  // Under its button, their right edges together, as a menu hangs.
  const from = lightsTool.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  node.style.left = Math.max(8, Math.min(from.right - box.width, innerWidth - box.width - 8)) + 'px';
  node.style.top = from.bottom + 6 + 'px';
  easeIn(node);
  // It opens at where you are: the first highlight in the section being read, or after it.
  const here = mine.ready ? placeNow().section : 0;
  const near = kept.findIndex((light) => light.section >= here);
  if (rows.length) mark(near < 0 ? rows.length - 1 : near, 'middle');
  node.focus();
}

lightsTool.addEventListener('click', () => (lister ? closeLights() : openLights()));
// A press anywhere else closes it, as does the window changing size or losing the keyboard.
document.addEventListener('mousedown', (e) => {
  if (lister && !lister.contains(e.target) && !lightsTool.contains(e.target)) closeLights();
}, true);
window.addEventListener('blur', closeLights);
window.addEventListener('resize', closeLights);

// While reading, the top bar and the place in the corner keep out of sight until the pointer
// goes to where they are: the top of the window, the foot of it. The main process watches
// the pointer and says which it is at.
let bar = true; // the top bar is in sight

function reveal(top, foot) {
  document.body.dataset.foot = foot ? 'shown' : 'hidden';
  if (top === bar) return;
  bar = top;
  document.body.dataset.bar = top ? 'shown' : 'hidden';
  window.api.windowButtons(top); // the window buttons come and go with the bar
}

let zone = 'none'; // where the pointer is: 'top', 'foot' or 'none'

/** Shows what the pointer has gone to. The bar also stays while the text panel, the find
    panel, the highlights or the contents hang from it. */
function settle() {
  if (open) reveal(Boolean(panel || menu || finder || lister) || zone === 'top', zone === 'foot');
}

window.api.onPointer((now) => {
  zone = now;
  settle();
});

// ---------- how the text is set ----------
// The theme the reader wears, the face and size of the text being read, the space between its
// lines and the width of its column, chosen in a panel that hangs from the top bar's text button, and kept between runs.

// The themes are the reader's own (their colours are in style.css). Until one is chosen the
// reader wears what the app wears.
const THEMES = [['white', 'White'], ['light', 'Light'], ['sepia', 'Sepia'], ['dusk', 'Dusk'], ['dark', 'Dark'], ['black', 'Black']];
const FACES = [['sans', 'Sans', 'var(--font)'], ['serif', 'Serif', 'var(--font-serif)']];
const SIZE = { least: 14, most: 24 };
const SPACINGS = [['tight', 'Tight', 1.5], ['normal', 'Normal', 1.7], ['loose', 'Loose', 1.9]];
const WIDTHS = [['narrow', 'Narrow', 540, 620], ['normal', 'Normal', 620, 760], ['wide', 'Wide', 720, 920]]; // a column of text, then a PDF's sheet
const READINGS = [['scroll', 'Scrolling'], ['pages', 'Pages']];
// (Scrolling or pages is kept twice: `reading` for books, `readingArticles` for articles.)
const setting = { theme: null, face: 'sans', size: 17, spacing: 'normal', width: 'normal', reading: 'scroll', readingArticles: 'scroll' };
/** Which of the two an item is read by. */
const paceOf = (item) => (item?.kind === 'article' ? 'readingArticles' : 'reading');
try {
  Object.assign(setting, JSON.parse(localStorage.getItem('text')));
} catch {
  // nothing kept, or nothing that can be read: the text is set as it comes
}

/** The window wears the reader's theme while something is being read, and the app's own
    colours otherwise. */
function wear() {
  const root = document.documentElement;
  const theme = open && THEMES.some(([id]) => id === setting.theme) ? setting.theme : null;
  if (theme !== (root.dataset.theme ?? null)) {
    // The paper and ink now change by degrees (style.css); what has a quick fade of its own
    // keeps step with them for as long as that takes.
    root.classList.add('theming');
    clearTimeout(theming);
    theming = setTimeout(() => root.classList.remove('theming'), 320);
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
  }
  turn();
}

let tone = ''; // the paper now worn is a 'light' one or a 'dark' one
let turning = null; // a PDF's pages are being turned over for the other

/** Marks the root with whether the paper is light or dark, which is how a PDF's pages know
    which way up to lie. A page cannot be turned by degrees, so if one is in sight its marks
    fade out, it is turned while they are gone, and they fade back. The blank of the page is
    the paper throughout. */
function turn() {
  const root = document.documentElement;
  const now = getComputedStyle(root).getPropertyValue('--tone').trim() || 'light';
  if (now === tone) return;
  const first = !tone;
  tone = now;
  turning?.cancel();
  turning = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (first || still || open?.kind !== 'pdf' || $('reading').hidden) return void (root.dataset.tone = now);
  const out = (turning = root.animate({ '--leaf-opacity': [1, 0] }, { duration: 100, fill: 'forwards' }));
  out.finished.then(() => {
    if (turning !== out) return;
    root.dataset.tone = now;
    out.cancel();
    turning = root.animate({ '--leaf-opacity': [0, 1] }, { duration: 120 });
  }, () => {});
}

// The app's own light and dark follow the system, which can change while the app is open.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', wear);

/** Sets the text as `setting` says. What was being read stays where it was in the window. */
function setText() {
  const reading = $('reading');
  const room = () => reading.scrollHeight - reading.clientHeight;
  const at = room() > 0 ? reading.scrollTop / room() : 0;
  const place = book?.ready ? placeNow() : null; // in a real book, the very line
  const root = document.documentElement.style;
  root.setProperty('--read-font', (FACES.find(([id]) => id === setting.face) ?? FACES[0])[2]);
  root.setProperty('--read-size', setting.size + 'px');
  root.setProperty('--read-leading', (SPACINGS.find(([id]) => id === setting.spacing) ?? SPACINGS[1])[2]);
  const width = WIDTHS.find(([id]) => id === setting.width) ?? WIDTHS[1];
  root.setProperty('--read-width', width[2] + 'px');
  root.setProperty('--sheet-width', width[3] + 'px');
  pace(); // scrolling, or pages
  if (place) seek(place);
  else reading.scrollTop = at * room();
  redraw(); // a PDF's pages, at their new width
  wear();
  localStorage.setItem('text', JSON.stringify(setting));
}

let panel = null; // the text panel, when it is open
let theming = 0; // the wait until a change of theme is over (see wear)
const textTool = document.querySelector('[data-tool="text"]');

/** What the panel holds: the themes, a dot for each; the face, each choice written in itself; the size, stepped down or
    up; then the spacing and the width, each one of three. */
function drawPanel() {
  const group = (name, value, choices, strip = 'seg') => {
    const head = el('div', 'panel-head');
    head.append(el('span', '', name));
    if (value != null) head.append(el('span', typeof value === 'number' ? 'panel-value' : '', value)); // a number, in the mono
    const row = el('div', strip);
    row.append(...choices);
    return [head, row];
  };
  const choice = (label, on, run, className) => {
    const made = el('button', className, label);
    made.type = 'button';
    if (on != null) made.setAttribute('aria-pressed', String(on));
    made.addEventListener('click', () => {
      run();
      setText();
      // A size of A changes the number shown and what can be pressed, so the panel is drawn
      // afresh. A choice in a strip changes nothing else: its strip is brought up to date
      // where it stands, and the pill slides to the choice. (Drawn afresh, the new strip
      // would simply be at its new place, with nothing to slide from.)
      if (on == null) return drawPanel();
      for (const button of made.parentNode.children) button.setAttribute('aria-pressed', String(button === made));
    });
    return made;
  };
  const step = (by, label, className) => {
    const made = choice('A', null, () => (setting.size += by), className);
    made.setAttribute('aria-label', label);
    made.disabled = setting.size + by < SIZE.least || setting.size + by > SIZE.most;
    return made;
  };
  const held = panel.contains(document.activeElement) ? [...panel.querySelectorAll('button')].indexOf(document.activeElement) : -1;
  const keep = () => held >= 0 && panel.querySelectorAll('button')[held]?.focus(); // the keyboard keeps its place
  const faces = FACES.map(([id, label, family]) => {
    const made = choice(label, setting.face === id, () => (setting.face = id));
    made.style.fontFamily = family;
    return made;
  });
  // With none chosen, the one the app is wearing is the one worn.
  const worn = setting.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  // Choosing a theme leaves the panel as it is, bar the ring and the name, so that it changes
  // colour along with everything else and is not drawn afresh in the new one.
  const dots = THEMES.map(([id, name]) => {
    const made = el('button', 'dot');
    made.type = 'button';
    made.dataset.theme = id;
    made.dataset.tip = name;
    made.setAttribute('aria-label', name);
    made.setAttribute('aria-pressed', String(worn === id));
    made.addEventListener('click', () => {
      setting.theme = id;
      setText();
      for (const dot of dots) dot.setAttribute('aria-pressed', String(dot === made));
      panel.querySelector('.panel-head span:last-child').textContent = name;
    });
    return made;
  });
  const theme = group('Theme', THEMES.find(([id]) => id === worn)[1], dots, 'dots');
  const width = group('Width', null, WIDTHS.map(([id, label]) => choice(label, setting.width === id, () => (setting.width = id))));
  // A PDF's pages are set already: only the theme around them and their width can change.
  if (open?.kind === 'pdf') return panel.replaceChildren(...theme, ...width), keep();
  panel.replaceChildren(
    ...theme,
    ...group('Typeface', null, faces),
    ...group('Size', setting.size, [step(-1, 'Smaller text', 'seg-small'), step(1, 'Larger text', 'seg-large')]),
    ...group('Spacing', null, SPACINGS.map(([id, label]) => choice(label, setting.spacing === id, () => (setting.spacing = id)))),
    ...width,
    // Books and articles each keep their own: this is the one for the kind being read.
    ...group(open?.kind === 'article' ? 'Reading articles' : 'Reading books', null, READINGS.map(([id, label]) => choice(label, setting[paceOf(open)] === id, () => (setting[paceOf(open)] = id)))),
  );
  keep();
}

function closePanel() {
  if (!panel) return;
  easeOut(panel);
  panel = null;
  textTool.setAttribute('aria-expanded', 'false');
  textTool.dataset.tip = textTool.getAttribute('aria-label');
  settle();
}

function openPanel() {
  closeMenu();
  closeFind();
  closeLights();
  panel = el('div', 'menu panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Text settings');
  drawPanel();
  document.body.append(panel);
  // Under its button, their right edges together, as a menu hangs.
  const from = textTool.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  panel.style.left = Math.max(8, Math.min(from.right - box.width, innerWidth - box.width - 8)) + 'px';
  panel.style.top = from.bottom + 6 + 'px';
  easeIn(panel);
  textTool.setAttribute('aria-expanded', 'true');
  delete textTool.dataset.tip; // open, the panel says what the button is for
  hideTip();
  settle();
}

textTool.addEventListener('click', () => (panel ? closePanel() : openPanel()));
// A press anywhere else closes it, as does the window changing size or losing the keyboard.
document.addEventListener('mousedown', (e) => {
  if (panel && !panel.contains(e.target) && !textTool.contains(e.target)) closePanel();
}, true);
window.addEventListener('blur', closePanel);
window.addEventListener('resize', closePanel);
setText();

// ---------- the settings page ----------

// Settings is a page of the library's, in three parts. First what is the app's own: whether
// it is light or dark, and where the library is kept. Then how what you read is set: the same
// choices as the text panel's, with a few lines of text over them to show what they do. Last,
// whether a book is read by scrolling or in pages, and whether an article is.
let about = null; // what the main process says of the app: its version, light or dark, and the library's folder
let helper = null; // how things stand with the intelligence: signed in with ChatGPT or not, which way, and as whom
let counted = null; // how many models the sign-in can ask, once that has been asked for (and then in words)
window.api.assistant.status().then((now) => {
  helper = now;
  if (tab.settings && !open) settled?.();
});
let settled = null; // brings the page's controls into line with what is chosen, while it is the page shown
window.api.settings.load().then((told) => {
  about = told;
  if (tab.settings && !open) drawShelf();
});

const LOOKS = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const SAMPLE_LINES = 'Some books are read in an afternoon and gone by evening. Others stay on the desk for a month, opened a few pages at a time, and are still being argued with a year later. The second kind is why a library is worth keeping: a place where what you have read stays within reach, your own marks in its margins, ready to be opened again at the page where you left it.';

function settings() {
  const syncs = []; // each brings one control into line with what is chosen
  const sync = () => syncs.forEach((run) => run());
  /** A row: its name (and, after it, what is chosen, where the control does not say), a line
      more about it, and its control. */
  const row = (name, control, { more, value, number } = {}) => {
    const made = el('div', 'set-row');
    const title = el('div', 'set-name', name);
    if (value) {
      const shown = el('span', number ? 'set-value set-number' : 'set-value');
      title.append(shown);
      syncs.push(() => (shown.textContent = value()));
    }
    made.append(title);
    if (more) {
      const said = el('div', 'set-more', typeof more === 'function' ? '' : more);
      if (typeof more === 'function') syncs.push(() => (said.textContent = more())); // (what it says can change)
      made.append(said);
    }
    made.append(control);
    return made;
  };
  /** A strip of choices, the one in force filled. */
  const strip = (choices, now, pick, dress) => {
    const made = el('div', 'seg');
    for (const choice of choices) {
      const button = el('button', '', choice[1]);
      button.type = 'button';
      dress?.(button, choice);
      button.addEventListener('click', () => {
        pick(choice[0]);
        sync();
      });
      syncs.push(() => button.setAttribute('aria-pressed', String(now() === choice[0])));
      made.append(button);
    }
    return made;
  };
  /** One of the text's settings, as a strip. */
  const text = (key, choices, dress) => strip(choices, () => setting[key], (id) => ((setting[key] = id), setText()), dress);
  /** A part of the page: its name, a line about it, something to show, and its rows, which
      stand side by side where the page is wide enough for two. */
  const part = (name, lead, shown, ...rows) => {
    const made = el('section', 'set');
    const grid = el('div', 'set-rows');
    grid.append(...rows);
    made.append(el('h2', 'set-head', name));
    if (lead) made.append(el('p', 'set-lead', lead));
    if (shown) made.append(shown);
    made.append(grid);
    return made;
  };

  const look = strip(LOOKS, () => about?.appearance ?? 'system', (id) => {
    if (about) about.appearance = id;
    window.api.settings.appearance(id);
  });
  const reveal = el('button', 'set-button', 'Show in Finder');
  reveal.type = 'button';
  reveal.addEventListener('click', () => window.api.settings.reveal());
  // Moving the library: you choose a folder, and the whole of it goes there.
  const mover = el('button', 'set-button', 'Move…');
  mover.type = 'button';
  mover.addEventListener('click', async () => {
    if (SAMPLING) return void window.api.library.notify('There is no library to move while the stand-ins are showing.');
    save(true); // what is not yet written goes with it
    mover.disabled = reveal.disabled = true;
    mover.textContent = 'Moving…';
    mover.prepend(tick());
    const moved = await window.api.settings.move();
    mover.disabled = reveal.disabled = false;
    mover.textContent = 'Move…';
    if (moved.folder && about) about.folder = moved.folder;
    sync();
    if (moved.why) window.api.library.notify(moved.why);
  });
  const places = el('div', 'set-buttons');
  places.append(reveal, mover);

  // Intelligence: signed in with ChatGPT or not, and the buttons that go with each. (What
  // comes of a sign-in is shown on whichever Settings page is up by then: `settled`.)
  const chat = el('div', 'set-buttons');
  const press = (name, run) => {
    const made = el('button', 'set-button', name);
    made.type = 'button';
    made.addEventListener('click', run);
    return made;
  };
  const refresh = () => tab.settings && !open && settled?.();
  const heard = (now) => {
    if (now.why) window.api.library.notify(now.why);
    helper = now.why || now.none ? { ...helper, waiting: false } : now;
    counted = null;
    refresh();
  };
  const begin = (way) => () => {
    helper = { ...helper, waiting: true };
    refresh();
    window.api.assistant.signIn(way).then(heard);
  };
  syncs.push(() => {
    if (helper?.waiting) {
      // Giving up is shown at once; the sign-in itself is told to stop behind it.
      return chat.replaceChildren(press('Cancel', () => {
        helper = { ...helper, waiting: false };
        window.api.assistant.cancel();
        refresh();
      }));
    }
    if (!helper?.signedIn) return chat.replaceChildren(press('Continue with ChatGPT', begin('plan')), press('Sign in with Codex', begin('codex')));
    chat.replaceChildren(...(helper.way === 'codex' ? [] : [press('Manage usage', () => window.api.assistant.usage())]), press('Sign out', () => window.api.assistant.signOut().then((now) => {
      heard(now);
      if (now.confirmed === false) window.api.library.notify('You are signed out here. ChatGPT did not confirm it, so to be sure, disconnect Inquisitive in ChatGPT’s settings, under Security and login.');
    })));
    // (Asking for the models is also the proof that the sign-in works.)
    if (counted === null) {
      counted = '';
      window.api.assistant.models().then((had) => {
        counted = had.models ? `${had.models.length} ${had.models.length === 1 ? 'model' : 'models'}` : '';
        if (had.signedOut) helper = { ...helper, signedIn: false };
        refresh();
      });
    }
  });
  const using = () => (helper?.waiting ? 'Finish signing in in your browser.' : helper?.signedIn ? [helper.way === 'codex' ? 'Signed in as Codex does' : 'Using your ChatGPT plan', helper.email, counted].filter(Boolean).join(' · ') : 'Sign in to ask about what you read.');

  // A few lines set as what you read is set, in the theme you read in.
  const sample = el('div', 'set-sample');
  sample.append(el('p', '', SAMPLE_LINES));
  syncs.push(() => {
    if (THEMES.some(([id]) => id === setting.theme)) sample.dataset.theme = setting.theme;
    else delete sample.dataset.theme; // none chosen: what the app is wearing
  });
  const worn = () => setting.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const dots = el('div', 'dots');
  for (const [id, name] of THEMES) {
    const dot = el('button', 'dot');
    dot.type = 'button';
    dot.dataset.theme = id;
    dot.dataset.tip = name;
    dot.setAttribute('aria-label', name);
    dot.addEventListener('click', () => {
      setting.theme = id;
      setText();
      sync();
    });
    syncs.push(() => dot.setAttribute('aria-pressed', String(worn() === id)));
    dots.append(dot);
  }
  const step = (by, label, className) => {
    const made = el('button', className, 'A');
    made.type = 'button';
    made.setAttribute('aria-label', label);
    made.addEventListener('click', () => {
      setting.size += by;
      setText();
      sync();
    });
    syncs.push(() => (made.disabled = setting.size + by < SIZE.least || setting.size + by > SIZE.most));
    return made;
  };
  const size = el('div', 'seg');
  size.append(step(-1, 'Smaller text', 'seg-small'), step(1, 'Larger text', 'seg-large'));

  // The page's foot: the app's name as its logo has it, asterisk and all, and the version
  // beside it.
  const foot = el('p', 'set-foot');
  foot.append('inquisitive', el('span', 'star', '*'), el('span', 'version', about?.version ?? ''));

  const page = el('div', 'settings');
  page.append(
    part(
      'Library',
      '',
      null,
      row('Appearance', look, { more: 'For the library. What you read has its own theme.' }),
      row('Location', places, { more: () => about?.folder ?? '' }),
    ),
    part(
      'Text',
      'How books and articles are set. These are the same choices as the text button gives while you read.',
      sample,
      row('Theme', dots, { value: () => THEMES.find(([id]) => id === worn())[1] }),
      row('Typeface', text('face', FACES, (button, [, , family]) => (button.style.fontFamily = family))),
      row('Size', size, { value: () => String(setting.size), number: true }),
      row('Spacing', text('spacing', SPACINGS)),
      row('Width', text('width', WIDTHS)),
    ),
    part(
      'Reading',
      'Scrolling, or one page at a time, chosen apart for books and for articles. A PDF always scrolls.',
      null,
      row('Books', text('reading', READINGS)),
      row('Articles', text('readingArticles', READINGS)),
    ),
    part('Intelligence', '', null, row('ChatGPT', chat, { more: using })),
    foot,
  );
  sync();
  settled = sync;
  return page;
}

// With no theme chosen for reading, the one ringed is the app's own, which can change.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => tab.settings && settled?.());

for (const button of document.querySelectorAll('#rail [data-tab]')) {
  button.addEventListener('click', () => choose(button.dataset.tab));
}

$('rail-toggle').addEventListener('click', () => {
  wide = !wide;
  localStorage.setItem('rail', wide ? 'wide' : 'slim');
  drawRail();
});

window.addEventListener('keydown', (e) => {
  if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    // The arrow keys walk through an open menu.
    e.preventDefault();
    const choices = [...menu.node.querySelectorAll('.menu-item')];
    const at = choices.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    choices[at < 0 ? (step > 0 ? 0 : choices.length - 1) : (at + step + choices.length) % choices.length].focus();
    return;
  }
  // Command-F finds in what is being read.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f' && book && !dialog) {
    e.preventDefault();
    return openFind();
  }
  // Read in pages, the arrows, the space bar and Page Up and Down turn the page.
  if (book?.leaf && !menu && !dialog && !panel && !finder && !lister && !picker && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.isContentEditable && !e.target.matches?.('input, textarea')) {
    const by = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (by && !(e.key === ' ' && e.target.closest?.('button'))) { // (the space bar on a button presses the button)
      e.preventDefault();
      return turnPage(by);
    }
  }
  if (e.key !== 'Escape') return;
  if (noter) closeNote(); // Escape puts a note of the book's away,
  else if (picker) closePicker(); // or the row of colours,
  else if (menu) closeMenu(); // or closes a menu,
  else if (dialog) closeDialog(); // or a dialog,
  else if (panel) closePanel(); // or the text panel,
  else if (finder) closeFind(); // or the find panel,
  else if (lister) closeLights(); // or the list of highlights,
  else if (open) showLibrary(); // or what is being read,
  else if (palette) (palette = null), gliding(drawShelf); // or puts the colours away
});

// A click anywhere else puts the colours away too.
document.addEventListener('click', (e) => {
  if (palette && !e.target.closest('.palette, .band-dot')) (palette = null), gliding(drawShelf);
});

// The library arrives from the main process; then the first page can be drawn.
(SAMPLING ? Promise.resolve(null) : window.api.library.load()).then((library) => {
  if (library) {
    items = library.items;
    collections.push(...library.collections);
    spent = library.read ?? {};
    kept = JSON.stringify({ items, collections, read: spent });
  }
  drawRail();
  drawShelf();
  drawCrumbs();
});
