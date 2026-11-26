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

// The tabs on the rail (their buttons are in index.html). Home is a page of its own: what to
// carry on with, and what is new. Library, Finished and Collections are ways of looking at
// the library; Collections is a page of shelves, one for each collection.
const TABS = [
  { id: 'home', name: 'Home', home: true },
  { id: 'library', name: 'Library', test: () => true, tools: true },
  { id: 'finished', name: 'Finished', test: (item) => item.progress >= 1, dated: true, empty: 'What you finish reading is kept here.' },
  { id: 'collections', name: 'Collections', shelves: true },
  { id: 'settings', name: 'Settings', test: () => false }, // a screen of its own; nothing on it yet
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
    const state = JSON.stringify({ items, collections });
    if (state === kept) return;
    kept = state;
    window.api.library.save(JSON.parse(state));
  };
  if (now) write();
  else keeping = setTimeout(write, 400);
}
window.addEventListener('beforeunload', () => save(true));

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

function closeMenu() {
  if (!menu) return;
  menu.node.remove();
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
  tab = TABS.find((entry) => entry.id === id);
  drawRail();
  drawShelf();
  drawCrumbs();
  $('library').scrollTop = 0;
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
    started. Gives the section, and the items shown in it. */
function going() {
  const started = items.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => when(b.opened) - when(a.opened));
  const [lead, ...rest] = started.filter((item) => daysSince(when(item.opened)) <= STALE);
  if (!lead) return { bands: [], under: [] };
  const more = rest.slice(0, MORE);
  const made = el('div', 'going');
  made.append(card(lead, true));
  if (more.length) made.append(grid(more, 'short row'));
  return { bands: [band('Continue', made, started.length)], under: [lead, ...more] };
}

/** Home: what to carry on with, then the latest additions. */
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
  // What is already under Continue is not shown a second time.
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
      drawShelf();
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
    const pick = (id) => () => ((look.sort = id), drawShelf());
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
      drawShelf();
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
      drawShelf();
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
  $('heading').textContent = tab.name;
  if (tab.home) return $('shelf-body').replaceChildren(...home());
  if (tab.shelves) return $('shelf-body').replaceChildren(...shelves());
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
  wear();
  zone = 'none';
  reveal(false, false);
  window.api.watchPointer(true);
  document.body.dataset.screen = 'reading';
  $('library').hidden = true;
  $('reading').hidden = false;
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
  let shape;
  try {
    shape = await (item.kind === 'article' ? Article : Book).open(item);
  } catch {
    if (open === item) page.replaceChildren(el('p', 'book-none', `This ${item.kind === 'article' ? 'article' : 'book'} could not be opened.`));
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
  const mine = (book = { item, ...shape, parts, before, fetched: new Map(), dressed: new Set(), sheet: new CSSStyleSheet(), ready: false });
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, mine.sheet]; // the book's own styling, such of it as is kept
  contentsTool.hidden = !shape.toc.length;
  item.sections = parts.length;
  const at = item.at ?? { section: 0, part: 0 };
  await around(Math.min(at.section, parts.length - 1));
  if (book !== mine) return;
  seek(at);
  mine.ready = true;
  // From here the page fetches whatever it comes near.
  mine.watch = new IntersectionObserver((seen) => seen.forEach((entry) => entry.isIntersecting && fill(Number(entry.target.dataset.index))), { root: $('reading'), rootMargin: '1400px 0px' });
  parts.forEach((part) => mine.watch.observe(part));
}

/** Opens a real PDF on the page, at the place it was left. It is a book of another kind: each
    page is a part, a sheet the shape of the page, blank until the page comes near it and
    then drawn (and blank again once it is far away, so a long PDF does not fill the memory). */
async function bindPdf(item) {
  const page = $('page');
  page.replaceChildren();
  let pdf;
  try {
    pdf = await Pdf.open(item);
  } catch {
    if (open === item) page.replaceChildren(el('p', 'book-none', 'This PDF could not be opened.'));
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
  const mine = (book = { item, pdf, sections: parts.map(() => ({ size: 1 })), toc: pdf.toc, parts, before: Array.from({ length: parts.length + 1 }, (_, i) => i), fetched: new Map(), ready: false });
  contentsTool.hidden = !pdf.toc.length;
  item.pages = item.sections = parts.length;
  seek(item.at ?? { section: 0, part: 0 });
  mine.ready = true;
  mine.watch = new IntersectionObserver((seen) => seen.forEach((entry) => (entry.isIntersecting ? fill : blank)(Number(entry.target.dataset.index))), { root: $('reading'), rootMargin: '1400px 0px' });
  parts.forEach((part) => mine.watch.observe(part));
}

/** Draws a PDF's page onto its sheet, once. */
function drawSheet(mine, index) {
  if (!mine.fetched.has(index)) {
    const sheet = mine.parts[index];
    const done = ({ canvas, words, shape }) => {
      if (book !== mine || mine.fetched.get(index) !== drawing) return; // shut, or put away, or drawn afresh meanwhile
      canvas.className = 'leaf';
      sheet.style.aspectRatio = String(shape);
      sheet.replaceChildren(canvas, words);
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
  const line = $('reading').scrollTop + lineOf();
  let section = 0;
  for (let i = 0; i < book.parts.length && depthOf(book.parts[i]) <= line + 1; i++) section = i; // (a pixel of leeway: a part brought exactly to the line is the one you are in)
  const part = book.parts[section];
  return { section, part: Math.max(0, Math.min(1, (line - depthOf(part)) / (part.offsetHeight || 1))) };
}

/** Brings a place to the reading line. */
function seek({ section, part }) {
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
  $('reading').scrollTop = depthOf(to) - lineOf();
  $('page').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); // it arrives as a page does
}

/** Notes where you are: on the item (to come back to), in the corner, and in the library. How
    far through the book that is goes by the sizes of its sections. At the very foot of the
    last one, the book is finished. */
function note() {
  if (!book?.ready) return;
  const { item, sections, before } = book;
  const at = placeNow();
  const reading = $('reading');
  const end = reading.scrollTop + reading.clientHeight >= reading.scrollHeight - 4;
  item.at = { section: at.section, part: Math.round(at.part * 1e4) / 1e4 };
  item.progress = end ? 1 : Math.min(0.999, (before[at.section] + at.part * sections[at.section].size) / before.at(-1));
  if (end) item.finished ??= Date.now();
  else delete item.finished;
  $('place').textContent = Math.round(item.progress * 100) + '%';
  save();
}

/** Puts a real book away, noting where you were. */
function shut() {
  if (!book) return;
  note();
  book.watch?.disconnect();
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== book.sheet);
  Pdf.close(book.pdf);
  book = null;
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

// A link in a book leads to another place in it, or out to the web.
$('page').addEventListener('click', (e) => {
  const link = book && e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  if (link.dataset.out) return window.api.library.out(link.dataset.out);
  const section = book.sections.findIndex((entry) => entry.path === link.dataset.to);
  if (section >= 0) go(section, link.dataset.place);
});

// The contents: a book's chapters, in a menu hung from the top bar's contents button, open at
// the chapter being read. Choosing one goes to it.
const contentsTool = document.querySelector('[data-tool="contents"]');

contentsTool.addEventListener('click', () => {
  if (menu?.owner === contentsTool) return closeMenu();
  // A real book's contents are its own: titles, some nested under others. The one being
  // read is the last that starts at or before where you are: in an earlier section, or in
  // this one at or above the reading line.
  const at = book?.ready ? placeNow().section : -1;
  const line = $('reading').scrollTop + (book ? lineOf() : 0) + 1;
  const here = book?.ready ? book.toc.findLast((entry) => entry.section < at || (entry.section === at && !(named(at, entry.place) && depthOf(named(at, entry.place)) > line))) : null;
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

/** Shows what the pointer has gone to. The bar also stays while the text panel or the
    contents hang from it. */
function settle() {
  if (open) reveal(Boolean(panel || menu) || zone === 'top', zone === 'foot');
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
const setting = { theme: null, face: 'sans', size: 17, spacing: 'normal', width: 'normal' };
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
      drawPanel();
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
  );
  keep();
}

function closePanel() {
  if (!panel) return;
  panel.remove();
  panel = null;
  textTool.setAttribute('aria-expanded', 'false');
  textTool.dataset.tip = textTool.getAttribute('aria-label');
  settle();
}

function openPanel() {
  closeMenu();
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
  if (e.key !== 'Escape') return;
  if (menu) closeMenu(); // Escape closes a menu,
  else if (dialog) closeDialog(); // or a dialog,
  else if (panel) closePanel(); // or the text panel,
  else if (open) showLibrary(); // or what is being read,
  else if (palette) (palette = null), drawShelf(); // or puts the colours away
});

// A click anywhere else puts the colours away too.
document.addEventListener('click', (e) => {
  if (palette && !e.target.closest('.palette, .band-dot')) (palette = null), drawShelf();
});

// The library arrives from the main process; then the first page can be drawn.
(SAMPLING ? Promise.resolve(null) : window.api.library.load()).then((library) => {
  if (library) {
    items = library.items;
    collections.push(...library.collections);
    kept = JSON.stringify({ items, collections });
  }
  drawRail();
  drawShelf();
  drawCrumbs();
});
