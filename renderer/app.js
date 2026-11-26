'use strict';

// The layout only: a rail of tabs, the library beside it, and a page that takes the window
// when something is opened. There is no real library or reader yet, so the shelf is stocked
// with stand-ins.
// The stand-in books' chapters, for the reader's contents.
const CHAPTERS = {
  geb: ['The MU-puzzle', 'Meaning and Form in Mathematics', 'Figure and Ground', 'Consistency, Completeness, and Geometry', 'Recursive Structures and Processes', 'The Location of Meaning', 'The Propositional Calculus', 'Typographical Number Theory', 'Mumon and Gödel', 'Levels of Description, and Computer Systems', 'Brains and Thoughts', 'Minds and Thoughts', 'BlooP and FlooP and GlooP', 'On Formally Undecidable Propositions of TNT and Related Systems', 'Jumping out of the System', 'Self-Ref and Self-Rep', 'Church, Turing, Tarski, and Others', 'Artificial Intelligence: Retrospects', 'Artificial Intelligence: Prospects', 'Strange Loops, Or Tangled Hierarchies'],
  state: ['Nature and Space', 'Cities, People, and Language', 'Authoritarian High Modernism', 'The High-Modernist City', 'The Revolutionary Party', 'Soviet Collectivization, Capitalist Dreams', 'Compulsory Villagization in Tanzania', 'Taming Nature', 'Thin Simplifications and Practical Knowledge', 'Conclusion'],
  gene: ['Why Are People?', 'The Replicators', 'Immortal Coils', 'The Gene Machine', 'Aggression: Stability and the Selfish Machine', 'Genesmanship', 'Family Planning', 'Battle of the Generations', 'Battle of the Sexes', 'You Scratch My Back, I’ll Ride on Yours', 'Memes: The New Replicators', 'Nice Guys Finish First', 'The Long Reach of the Gene'],
  hamming: ['Orientation', 'Foundations of the Digital Revolution', 'History of Computers: Hardware', 'History of Computers: Software', 'History of Computer Applications', 'Limits of Computer Applications: AI I', 'Artificial Intelligence II', 'Artificial Intelligence III', 'n-Dimensional Space', 'Coding Theory I', 'Coding Theory II', 'Error-Correcting Codes', 'Information Theory', 'Digital Filters I', 'Digital Filters II', 'Digital Filters III', 'Digital Filters IV', 'Simulation I', 'Simulation II', 'Simulation III', 'Fiber Optics', 'Computer-Aided Instruction', 'Mathematics', 'Quantum Mechanics', 'Creativity', 'Experts', 'Unreliable Data', 'Systems Engineering', 'You Get What You Measure', 'You and Your Research'],
};
// The stand-in items. A book also has its chapters, and the one it is open at.
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
const ago = (days) => days ?? Infinity; // something never opened was opened longest ago
const SORTS = [
  ['Last opened', [['opened', 'Recently opened', (a, b) => ago(a.opened) - ago(b.opened)], ['unopened', 'Longest unopened', (a, b) => ago(b.opened) - ago(a.opened)]]],
  ['Date added', [['added', 'Recently added', (a, b) => a.added - b.added], ['oldest', 'Oldest added', (a, b) => b.added - a.added]]],
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

// Opened with ?empty (main.js does it when INQUISITIVE_EMPTY is set), the app starts as it
// would the first time: nothing in the library, no collections. A stand-in, like SAMPLE.
const FRESH = new URLSearchParams(location.search).has('empty');
if (FRESH) collections.length = 0;
let items = FRESH ? [] : SAMPLE;

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
    choice), tick, or danger. `at` is a button to hang the menu from, or the point { x, y }
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
const openedOf = (item) => (item.opened === 0 ? 'Opened today' : item.opened === 1 ? 'Opened yesterday' : `Opened ${item.opened} days ago`);

/** When an item was finished, in words: "Finished 16 Nov", with the year if it is not this one. */
function finishedOf(item) {
  if (item.finished == null) return 'Finished';
  const on = new Date(Date.now() - item.finished * 864e5);
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
  head.append(el('span', '', KINDS[item.kind]), el('span', '', lengthOf(item)));
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
    done ? { name: 'Mark as unread', icon: 'restart', run: change(() => ((item.progress = 0), delete item.finished)) } : { name: 'Mark as finished', icon: 'finished', run: change(() => ((item.progress = 1), (item.finished = 0))) },
    null,
    'Move to',
    ...collections.map((c) => ({ name: c.name, hue: c.hue, tick: item.collection === c.id, run: change(() => (item.collection = c.id)) })),
    { name: 'No collection', hue: null, tick: !collections.some((c) => c.id === item.collection), run: change(() => delete item.collection) },
    null,
    { name: 'Remove from library', icon: 'bin', danger: true, run: change(() => (items = items.filter((other) => other !== item))) },
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
  const started = items.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => a.opened - b.opened);
  const [lead, ...rest] = started.filter((item) => item.opened <= STALE);
  if (!lead) return { bands: [], under: [] };
  const more = rest.slice(0, MORE);
  const made = el('div', 'going');
  made.append(card(lead, true));
  if (more.length) made.append(grid(more, 'short row'));
  return { bands: [band('Continue', made, started.length)], under: [lead, ...more] };
}

/** Home: what to carry on with, then the latest additions. */
/** What Home and Library show while the library has nothing in it: a quotation, set large
    under its mark, then what to do and the button that does it. (The button does nothing
    yet: there is no way to add.) */
function begin() {
  const made = el('div', 'begin');
  const mark = el('span', 'begin-mark', '“');
  mark.setAttribute('aria-hidden', 'true');
  const add = el('button', 'begin-add', 'Add to library');
  add.type = 'button';
  made.append(mark, el('p', 'begin-quote', QUOTE.text), el('p', 'begin-by', QUOTE.by), el('p', 'begin-line', 'Add a book, a PDF or an article to begin.'), add);
  return made;
}

function home() {
  if (!items.length) return [begin()];
  const { bands, under } = going();
  // What is already under Continue is not shown a second time.
  const recent = items.filter((item) => !under.includes(item)).sort((a, b) => a.added - b.added).slice(0, RECENT);
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
    name.addEventListener('input', () => (collection.name = name.textContent.trim() || before)); // a name cannot be emptied
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
      if (e.key === 'Escape') collection.name = before; // Escape leaves the name as it was
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

function drawShelf() {
  $('heading').textContent = tab.name;
  if (tab.home) return $('shelf-body').replaceChildren(...home());
  if (tab.shelves) return $('shelf-body').replaceChildren(...shelves());
  if (!tab.tools) {
    const list = items.filter(tab.test);
    if (tab.dated) list.sort((a, b) => (a.finished ?? 0) - (b.finished ?? 0)); // the latest finished first
    return $('shelf-body').replaceChildren(list.length || !tab.empty ? grid(list, '', tab.dated) : el('p', 'band-none', tab.empty));
  }
  // Library: everything, of the kinds chosen, in the order chosen.
  if (!items.length) return $('shelf-body').replaceChildren(begin());
  const list = shown(items.filter(tab.test), looks.library);
  $('shelf-body').replaceChildren(shelfTools(looks.library), list.length ? grid(list) : none(looks.library, 'in your library'));
}

function showLibrary() {
  closePanel();
  open = null;
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
    book opens at its chapter, an article under its title and author; both have the same
    words, for now. */
function drawPage() {
  const item = open;
  const pdf = item.kind === 'pdf';
  $('page').className = pdf ? 'sheets' : '';
  $('reading').scrollTop = 0;
  if (pdf) return $('page').replaceChildren(...Array.from({ length: item.pages }, (_, i) => sheet(i + 1)));
  const head = item.chapters ? [el('p', 'over', 'Chapter ' + item.chapter), el('h2', '', item.chapters[item.chapter - 1])] : [el('h2', '', item.title), el('p', 'byline', item.author)];
  $('page').replaceChildren(...head, ...TEXT.map((words) => el('p', 'text', words)));
}

function read(item) {
  open = item;
  $('place').textContent = Math.round(item.progress * 100) + '%';
  contentsTool.hidden = !item.chapters; // only what has chapters has contents
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

// The contents: a book's chapters, in a menu hung from the top bar's contents button, open at
// the chapter being read. Choosing one goes to it.
const contentsTool = document.querySelector('[data-tool="contents"]');

contentsTool.addEventListener('click', () => {
  if (menu?.owner === contentsTool) return closeMenu();
  const chapters = open.chapters.map((name, i) => ({
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
  const root = document.documentElement.style;
  root.setProperty('--read-font', (FACES.find(([id]) => id === setting.face) ?? FACES[0])[2]);
  root.setProperty('--read-size', setting.size + 'px');
  root.setProperty('--read-leading', (SPACINGS.find(([id]) => id === setting.spacing) ?? SPACINGS[1])[2]);
  const width = WIDTHS.find(([id]) => id === setting.width) ?? WIDTHS[1];
  root.setProperty('--read-width', width[2] + 'px');
  root.setProperty('--sheet-width', width[3] + 'px');
  reading.scrollTop = at * room();
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
  else if (panel) closePanel(); // or the text panel,
  else if (open) showLibrary(); // or what is being read,
  else if (palette) (palette = null), drawShelf(); // or puts the colours away
});

// A click anywhere else puts the colours away too.
document.addEventListener('click', (e) => {
  if (palette && !e.target.closest('.palette, .band-dot')) (palette = null), drawShelf();
});

drawRail();
drawShelf();
drawCrumbs();
