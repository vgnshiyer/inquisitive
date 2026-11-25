'use strict';

// The layout only: a rail of tabs, the library beside it, and a page that takes the window
// when something is opened. There is no real library or reader yet, so the shelf is stocked
// with stand-ins.
const SAMPLE = [
  { id: 'geb', kind: 'book', title: 'Gödel, Escher, Bach', author: 'Douglas Hofstadter', pages: 777, progress: 0.34, added: 40, opened: 0, collection: 'Mathematics' },
  { id: 'shannon', kind: 'pdf', title: 'A Mathematical Theory of Communication', author: 'Claude Shannon', pages: 55, progress: 0.12, added: 12, opened: 3, collection: 'Mathematics' },
  { id: 'research', kind: 'article', title: 'You and Your Research', author: 'Richard Hamming', minutes: 45, progress: 1, added: 30, opened: 20, collection: 'Science' },
  { id: 'state', kind: 'book', title: 'Seeing Like a State', author: 'James C. Scott', pages: 445, progress: 0, added: 2, collection: 'Society' },
  { id: 'bitter', kind: 'article', title: 'The Bitter Lesson', author: 'Rich Sutton', minutes: 6, progress: 1, added: 9, opened: 9, collection: 'Computing' },
  { id: 'gene', kind: 'book', title: 'The Selfish Gene', author: 'Richard Dawkins', pages: 360, progress: 0.61, added: 25, opened: 1, collection: 'Science' },
  { id: 'attention', kind: 'pdf', title: 'Attention Is All You Need', author: 'Ashish Vaswani and others', pages: 15, progress: 0, added: 1, collection: 'Computing' },
  { id: 'hamming', kind: 'book', title: 'The Art of Doing Science and Engineering', author: 'Richard Hamming', pages: 376, progress: 0.08, added: 5, opened: 6 }, // in no collection
];

const KINDS = { book: 'Book', pdf: 'PDF', article: 'Article' };
// A collection's colour (a number from style.css); its items wear it.
const COLLECTIONS = { Mathematics: 1, Science: 0, Society: 6, Computing: 3 };
const PLAIN = 7; // the colour of an item in no collection

const RECENT = 4; // how many of the latest additions Home shows

// The tabs on the rail (their buttons are in index.html). Home is a page of its own: what to
// carry on with, and what is new. Library, Finished and Collections are ways of looking at
// the library: a name, and which items belong (Collections shows them all, by collection).
const TABS = [
  { id: 'home', name: 'Home', home: true },
  { id: 'library', name: 'Library', test: () => true },
  { id: 'finished', name: 'Finished', test: (item) => item.progress >= 1 },
  { id: 'collections', name: 'Collections', test: () => true, grouped: true },
  { id: 'settings', name: 'Settings', test: () => false }, // a screen of its own; nothing on it yet
];

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

let items = SAMPLE;
let tab = TABS[0]; // the tab chosen on the rail
let open = null; // the item being read, if any

/** How far along an item is, in words: "New", "34%" or "Finished". */
function placeOf(item) {
  if (!item.progress) return 'New';
  if (item.progress >= 1) return 'Finished';
  return Math.round(item.progress * 100) + '%';
}

/** An item's colour: its collection's, or the plain one if it is in none. */
const hueOf = (item) => COLLECTIONS[item.collection] ?? PLAIN;

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
  toggle.title = wide ? 'Collapse sidebar' : 'Expand sidebar';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.setAttribute('aria-expanded', String(wide));
  for (const button of document.querySelectorAll('#rail .tab')) {
    // Slim, a tab's name is its tooltip; wide, the name is written beside the icon.
    button.title = wide ? '' : button.getAttribute('aria-label');
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

/** A card: what kind of thing it is and how long, its title, who wrote it, and a line showing
    how far you are. Pointed at, the place gives way to an arrow: it opens. A lead card is
    the same thing writ large, across the page. */
function card(item, lead) {
  const made = el('button', lead ? 'card lead' : 'card');
  made.type = 'button';
  made.dataset.hue = hueOf(item);
  const head = el('span', 'card-head');
  head.append(el('span', '', KINDS[item.kind]), el('span', '', lengthOf(item)));
  const meter = el('span', 'meter');
  meter.style.setProperty('--done', Math.round(item.progress * 100) + '%');
  const end = el('span', 'card-end');
  end.append(el('span', 'card-place', placeOf(item)), el('span', 'card-go'));
  const foot = el('span', 'card-foot');
  foot.append(meter, end);
  made.append(head, el('span', 'card-title', item.title), el('span', 'card-author', item.author), foot);
  made.addEventListener('click', () => read(item));
  return made;
}

function grid(list) {
  const made = el('div', 'cards');
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

/** Home: the thing you last had open and have not finished, then the latest additions. */
function home() {
  const going = items.filter((item) => item.progress > 0 && item.progress < 1).sort((a, b) => a.opened - b.opened)[0];
  const recent = [...items].sort((a, b) => a.added - b.added).slice(0, RECENT);
  return [...(going ? [band('Continue', card(going, true))] : []), band('Recently added', grid(recent))];
}

/** Every item, under its collection's name; those in none come last. */
function collections(list) {
  const loose = list.filter((item) => !item.collection);
  const of = (name) => list.filter((item) => item.collection === name);
  return [...Object.keys(COLLECTIONS).map((name) => band(name, grid(of(name)), of(name).length)), ...(loose.length ? [band('No collection', grid(loose), loose.length)] : [])];
}

function drawShelf() {
  $('heading').textContent = tab.name;
  if (tab.home) return $('shelf-body').replaceChildren(...home());
  const list = items.filter(tab.test);
  $('shelf-body').replaceChildren(...(tab.grouped ? collections(list) : [grid(list)]));
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
  if (e.key === 'Escape' && open) showLibrary(); // Escape closes what is being read
});

drawRail();
drawShelf();
drawCrumbs();
