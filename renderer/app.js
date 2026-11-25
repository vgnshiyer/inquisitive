'use strict';

// The layout only: a rail of tabs, the library beside it, and a page that takes the window
// when something is opened. There is no real library or reader yet, so the shelf is stocked
// with stand-ins.
const SAMPLE = [
  { id: 'geb', kind: 'book', title: 'Gödel, Escher, Bach', author: 'Douglas Hofstadter', pages: 777, progress: 0.34, added: 40, opened: 0, collection: 'math' },
  { id: 'shannon', kind: 'pdf', title: 'A Mathematical Theory of Communication', author: 'Claude Shannon', pages: 55, progress: 0.12, added: 12, opened: 3, collection: 'math' },
  { id: 'research', kind: 'article', title: 'You and Your Research', author: 'Richard Hamming', minutes: 45, progress: 1, added: 30, opened: 20, collection: 'science' },
  { id: 'state', kind: 'book', title: 'Seeing Like a State', author: 'James C. Scott', pages: 445, progress: 0, added: 2, collection: 'society' },
  { id: 'bitter', kind: 'article', title: 'The Bitter Lesson', author: 'Rich Sutton', minutes: 6, progress: 1, added: 9, opened: 9, collection: 'computing' },
  { id: 'gene', kind: 'book', title: 'The Selfish Gene', author: 'Richard Dawkins', pages: 360, progress: 0.61, added: 25, opened: 1, collection: 'science' },
  { id: 'attention', kind: 'pdf', title: 'Attention Is All You Need', author: 'Ashish Vaswani and others', pages: 15, progress: 0, added: 1, collection: 'computing' },
  { id: 'hamming', kind: 'book', title: 'The Art of Doing Science and Engineering', author: 'Richard Hamming', pages: 376, progress: 0.08, added: 5, opened: 6 }, // in no collection
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
  { id: 'finished', name: 'Finished', test: (item) => item.progress >= 1, empty: 'What you finish reading is kept here.' },
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
  menu = null;
}

/** Open a menu. Of its entries, a string is a group's label, null is a dividing line, and
    the rest are things to choose: { name, run } with, if wanted, an icon, a collection's
    colour (hue; null for none), on (it is the current choice), tick, or danger. `at` is a
    button to hang the menu from, or the point { x, y } to open it at. */
function openMenu(entries, at) {
  closeMenu();
  const node = el('div', 'menu');
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
  menu = { node, owner };
}

// A press anywhere else closes the menu (a press on its own button is left to that button).
document.addEventListener('mousedown', (e) => {
  if (menu && !menu.node.contains(e.target) && !menu.owner?.contains(e.target)) closeMenu();
}, true);
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
document.addEventListener('scroll', closeMenu, true);

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

/** A card: what kind of thing it is and how long, its title, who wrote it, and a line showing
    how far you are. Pointed at, the place gives way to an arrow: it opens. A lead card is
    the same thing writ large, across the page. */
function card(item, lead) {
  const made = el('button', lead ? 'card lead' : 'card');
  made.type = 'button';
  made.dataset.hue = hueOf(item);
  const head = el('span', 'card-head');
  head.append(el('span', '', KINDS[item.kind]), el('span', '', lengthOf(item)));
  if (lead) head.append(el('span', '', openedOf(item)));
  const meter = el('span', 'meter');
  meter.style.setProperty('--done', Math.round(item.progress * 100) + '%');
  const end = el('span', 'card-end');
  end.append(el('span', 'card-place', placeOf(item)), el('span', 'card-go'));
  const foot = el('span', 'card-foot');
  foot.append(meter, end);
  made.append(head, el('span', 'card-title', item.title), el('span', 'card-author', item.author), foot);
  made.addEventListener('click', () => read(item));
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
    done ? { name: 'Mark as unread', icon: 'restart', run: change(() => (item.progress = 0)) } : { name: 'Mark as finished', icon: 'finished', run: change(() => (item.progress = 1)) },
    null,
    'Move to',
    ...collections.map((c) => ({ name: c.name, hue: c.hue, tick: item.collection === c.id, run: change(() => (item.collection = c.id)) })),
    { name: 'No collection', hue: null, tick: !collections.some((c) => c.id === item.collection), run: change(() => delete item.collection) },
    null,
    { name: 'Remove from library', icon: 'bin', danger: true, run: change(() => (items = items.filter((other) => other !== item))) },
  ];
}

function grid(list, className) {
  const made = el('div', className ? 'cards ' + className : 'cards');
  made.append(...list.map((item) => card(item)));
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
    started. */
function going() {
  const started = items.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => a.opened - b.opened);
  const [lead, ...rest] = started.filter((item) => item.opened <= STALE);
  if (!lead) return [];
  const made = el('div', 'going');
  made.append(card(lead, true));
  if (rest.length) made.append(grid(rest.slice(0, MORE), 'short row'));
  return [band('Continue', made, started.length)];
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
  const recent = [...items].sort((a, b) => a.added - b.added).slice(0, RECENT);
  return [...going(), band('Recently added', grid(recent))];
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

/** Drag a shelf, by its grip, to another place among the shelves. A copy of the shelf goes
    with the pointer. The shelf itself stays on the page, faded, and steps from place to
    place as the copy passes the others, so it always shows where letting go would put it.
    Near the top or bottom of the page, the page moves along. Escape puts everything back. */
function dragShelf(collection, grip, e) {
  const page = $('library');
  const held = grip.closest('.band');
  const shelves = () => [...$('shelf-body').querySelectorAll('.band[data-id]')];
  const from = held.getBoundingClientRect();
  const grab = { x: e.clientX - from.left, y: e.clientY - from.top }; // where on the shelf it was taken hold of
  let at = { x: e.clientX, y: e.clientY };
  let settling = 0; // until when the shelves are still sliding into their new places
  let frame = 0;

  // The copy that goes with the pointer.
  const ghost = held.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.inert = true;
  ghost.style.width = from.width + 'px';
  document.body.append(ghost);
  const follow = () => {
    ghost.style.left = at.x - grab.x + 'px';
    ghost.style.top = at.y - grab.y + 'px';
  };

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
  const place = () => {
    if (performance.now() < settling) return; // wait for the last step to finish sliding
    const others = shelves().filter((shelf) => shelf !== held);
    const next = others.find((shelf) => ((box) => at.y < box.top + box.height / 2)(shelf.getBoundingClientRect()));
    if (next ? held.nextElementSibling !== next : others.length && others.at(-1).nextElementSibling !== held) step(() => (next ? next.before(held) : others.at(-1).after(held)));
  };

  const tick = () => {
    const box = page.getBoundingClientRect();
    const edge = 64; // how near an edge the pointer must be for the page to move
    const past = at.y < box.top + edge ? at.y - (box.top + edge) : at.y > box.bottom - edge ? at.y - (box.bottom - edge) : 0;
    if (past) page.scrollTop += past * 0.3;
    place();
    frame = requestAnimationFrame(tick);
  };
  const move = (ev) => {
    at = { x: ev.clientX, y: ev.clientY };
    follow();
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    hold.removeEventListener('pointermove', move);
    hold.removeEventListener('pointerup', drop);
    hold.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    document.body.classList.remove('dragging');
  };
  const drop = () => {
    stop();
    // The order is now the one on the page.
    const order = shelves().map((shelf) => shelf.dataset.id);
    collections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    // The copy settles onto the faded shelf, and then the page is drawn afresh.
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
    drawShelf(); // from the order as it was
  };
  const key = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    cancel();
  };

  // The pointer is held by the page itself, not the grip: the grip moves about the page with
  // its shelf, and an element taken out of the page lets go of the pointer.
  const hold = document.body;
  hold.setPointerCapture(e.pointerId);
  hold.addEventListener('pointermove', move);
  hold.addEventListener('pointerup', drop);
  hold.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  document.body.classList.add('dragging');
  held.classList.add('held');
  follow();
  frame = requestAnimationFrame(tick);
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
      dragShelf(collection, grip, e);
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
    return $('shelf-body').replaceChildren(list.length || !tab.empty ? grid(list) : el('p', 'band-none', tab.empty));
  }
  // Library: everything, of the kinds chosen, in the order chosen.
  if (!items.length) return $('shelf-body').replaceChildren(begin());
  const list = shown(items.filter(tab.test), looks.library);
  $('shelf-body').replaceChildren(shelfTools(looks.library), list.length ? grid(list) : none(looks.library, 'in your library'));
}

function showLibrary() {
  open = null;
  document.body.dataset.screen = 'library';
  $('reading').hidden = true;
  $('library').hidden = false;
  drawCrumbs();
}

// ---------- reading ----------

/** Lines standing in for a paragraph: full ones, then a short last line. */
function paragraph(lines, last) {
  const made = [];
  for (let i = 0; i < lines; i++) {
    const line = el('div', 'line');
    if (i === lines - 1) {
      line.classList.add('end');
      line.style.width = last + '%';
    }
    made.push(line);
  }
  return made;
}

function read(item) {
  open = item;
  $('page').replaceChildren(el('h2', '', item.title), el('p', 'byline', item.author), ...paragraph(6, 46), ...paragraph(8, 72), ...paragraph(5, 30), ...paragraph(7, 58));
  $('progress').textContent = placeOf(item);
  document.body.dataset.screen = 'reading';
  $('library').hidden = true;
  $('reading').hidden = false;
  $('reading').scrollTop = 0;
  drawCrumbs();
}

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
