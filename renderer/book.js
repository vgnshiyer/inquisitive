'use strict';

// Reading an EPUB. A book is a zip of XHTML files with a list saying what order they come in
// (its "spine") and usually a table of contents. The main process unpacks the files
// (library.js); this works out the book's shape and makes each part safe to put on the page.
//
// The page shows the book's words in the reader's own type and colours, so a book's own
// styling is left behind: what is kept is its structure (headings, paragraphs, emphasis,
// lists, pictures, links).

const Book = (() => {
  /** The folder a path is in, with its slash: 'OEBPS/text/' for 'OEBPS/text/one.xhtml'. */
  const dir = (path) => path.slice(0, path.lastIndexOf('/') + 1);

  /** A link as written in a book, taken apart: the path it leads to (worked out from the
      folder of the file it is written in) and the place within that file, if it names one. */
  function follow(from, link) {
    const [written, place] = String(link).split('#');
    let path = written;
    try {
      path = decodeURIComponent(written);
    } catch {
      // not percent-encoded after all: take it as written
    }
    if (!path) return { path: from, place }; // a place in the same file
    const steps = [];
    for (const step of (dir(from) + path).split('/')) {
      if (step === '..') steps.pop();
      else if (step && step !== '.') steps.push(step);
    }
    return { path: steps.join('/'), place };
  }

  const parse = (text, kind = 'application/xml') => new DOMParser().parseFromString(text, kind);
  /** Every element of this name, whatever namespace its file puts it in. */
  const all = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const words = (node) => node?.textContent.replace(/\s+/g, ' ').trim() ?? '';

  /** A book's shape: its title and author, its sections in reading order (each a path and a
      size), its contents (each a title, the section it is in, the place within it if it
      names one, and how deep it is nested), and the paths of what it keeps aside from its
      reading order. */
  async function open(item) {
    const text = (path) => window.api.library.text(item.file, path);
    const root = all(parse(await text('META-INF/container.xml')), 'rootfile')[0].getAttribute('full-path');
    const [pack, sizes] = await Promise.all([text(root).then((got) => parse(got)), window.api.library.sizes(item.file)]);

    // What is in the book, by the names the spine and the contents use for it.
    const files = new Map();
    for (const entry of all(pack, 'item')) {
      files.set(entry.getAttribute('id'), { path: follow(root, entry.getAttribute('href')).path, kind: entry.getAttribute('media-type'), marks: entry.getAttribute('properties') ?? '' });
    }
    const sections = all(pack, 'itemref')
      .filter((ref) => ref.getAttribute('linear') !== 'no')
      .map((ref) => files.get(ref.getAttribute('idref')))
      .filter(Boolean)
      .map((file) => ({ path: file.path, size: sizes[file.path] || 1 }));
    if (!sections.length) throw new Error('a book with nothing in it');
    // What the book keeps out of its reading order: most often its notes, each shown where
    // its number is (app.js).
    const aside = all(pack, 'itemref')
      .filter((ref) => ref.getAttribute('linear') === 'no')
      .map((ref) => files.get(ref.getAttribute('idref'))?.path)
      .filter(Boolean);
    const where = (path) => sections.findIndex((section) => section.path === path);

    // The contents: the newer kind of list (a page of nested links) if the book has one,
    // else the older kind (an NCX file).
    const toc = [];
    const listed = (path, place, title, depth) => {
      const section = where(path);
      if (section >= 0 && title) toc.push({ title, section, place, depth });
    };
    const nav = [...files.values()].find((file) => /\bnav\b/.test(file.marks));
    const ncx = [...files.values()].find((file) => file.kind === 'application/x-dtbncx+xml');
    if (nav) {
      const page = parse(await text(nav.path), 'application/xhtml+xml');
      const lists = all(page, 'nav');
      const contents = lists.find((list) => (list.getAttribute('epub:type') ?? list.getAttributeNS('http://www.idpf.org/2007/ops', 'type')) === 'toc') ?? lists[0];
      const walk = (list, depth) => {
        for (const entry of [...(list?.children ?? [])].filter((child) => child.localName === 'li')) {
          const link = [...entry.children].find((child) => child.localName === 'a');
          if (link?.getAttribute('href')) {
            const to = follow(nav.path, link.getAttribute('href'));
            listed(to.path, to.place, words(link), depth);
          }
          walk([...entry.children].find((child) => child.localName === 'ol'), depth + 1);
        }
      };
      walk(contents && all(contents, 'ol')[0], 0);
    }
    if (!toc.length && ncx) {
      const walk = (point, depth) => {
        for (const child of [...point.children].filter((node) => node.localName === 'navPoint')) {
          const to = follow(ncx.path, all(child, 'content')[0]?.getAttribute('src') ?? '');
          listed(to.path, to.place, words(all(child, 'text')[0]), depth);
          walk(child, depth + 1);
        }
      };
      const map = all(parse(await text(ncx.path)), 'navMap')[0];
      if (map) walk(map, 0);
    }

    return { title: words(all(pack, 'title')[0]), author: all(pack, 'creator').map(words).filter(Boolean).join(', '), sections, toc, aside };
  }

  // What a book's page may not bring with it: anything that runs, frames another page, or
  // takes input. (The window's own rules forbid scripts as well.) Its styling is taken out
  // here and let back in part, below.
  const BANNED = ['script', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'audio', 'video', 'canvas', 'template'];

  // ---------- a book's styling ----------
  // A book comes with its own stylesheets. foliate-js, which this follows, keeps all of a
  // book's CSS and lays the reader's choices over it; it can, because it shows the book in a
  // frame of its own. Here the book is part of the app's page, so its CSS is let in only so
  // far: the declarations that carry meaning (alignment, indents, italics, small capitals,
  // spacing, floats, relative sizes) are kept, and whatever would change the reader's type,
  // colours or line spacing, reach outside the book, or fetch anything, is dropped. Its class
  // and id names are given a prefix, so they can never be the app's.

  const SIDES = ['top', 'right', 'bottom', 'left', 'block-start', 'block-end', 'inline-start', 'inline-end'];
  const KEPT = new Set([
    'text-align', 'text-indent', 'font-style', 'font-weight', 'font-variant-caps', 'text-transform', 'text-decoration-line',
    'letter-spacing', 'word-spacing', 'white-space', 'white-space-collapse', 'text-wrap-mode', 'hyphens',
    ...SIDES.flatMap((side) => ['margin-' + side, 'padding-' + side]),
    'display', 'float', 'clear', 'vertical-align', 'list-style-type', 'list-style-position', 'font-size', 'width', 'max-width', 'height',
  ]);

  /** Whether one declaration of a book's is let in. */
  function worth(name, value) {
    if (!KEPT.has(name) || /url\(|var\(|expression/i.test(value)) return false;
    if (name === 'text-align') return /^(left|right|center|start|end)$/.test(value); // not justified: the column is the reader's
    if (name === 'font-size') return /^[\d.]+(em|rem|%)$|^(smaller|larger)$/.test(value); // only in proportion to the reader's size
    if (name === 'width' || name === 'max-width') return /^[\d.]+(em|%)$|^auto$/.test(value);
    if (name === 'height') return value === 'auto';
    if (name === 'float') return /^(left|right|none)$/.test(value);
    return true;
  }

  /** A selector with the book's class and id names given their prefix. Names inside square
      brackets and quotes are left alone. */
  function rename(selector) {
    let out = '';
    let depth = 0;
    let quote = '';
    for (let i = 0; i < selector.length; i++) {
      const c = selector[i];
      if (quote) {
        if (c === '\\') out += c + selector[++i];
        else {
          if (c === quote) quote = '';
          out += c;
        }
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if (c === '[') depth++;
      else if (c === ']') depth--;
      out += c;
      if ((c === '.' || c === '#') && !depth && /[-_a-zA-Z\\\u0080-\uffff]/.test(selector[i + 1] ?? '')) out += 'b-';
    }
    return out;
  }

  /** A selector list, parted at its commas (those not inside brackets). */
  function parted(list) {
    const parts = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < list.length; i++) {
      if ('([' .includes(list[i])) depth++;
      else if (')]'.includes(list[i])) depth--;
      else if (list[i] === ',' && !depth) {
        parts.push(list.slice(from, i));
        from = i + 1;
      }
    }
    return [...parts, list.slice(from)].map((part) => part.trim()).filter(Boolean);
  }

  /** A book's stylesheet, tamed: the rules worth keeping, as text, each ready to be put
      inside the book's own scope. Rules about the page as a whole (html, body) are left
      out, as are those for other media, and fonts and imports. */
  function tame(css) {
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(css);
    } catch {
      return [];
    }
    const rules = [];
    const walk = (list) => {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule) {
          const selectors = parted(rule.selectorText).filter((one) => !/(^|[\s>+~(])(html|body)(?![\w-])|:root/i.test(one)).map(rename);
          const kept = [...rule.style].filter((name) => worth(name, rule.style.getPropertyValue(name))).map((name) => name + ': ' + rule.style.getPropertyValue(name));
          if (selectors.length && kept.length) rules.push(selectors.join(', ') + ' { ' + kept.join('; ') + ' }');
        } else if (rule instanceof CSSMediaRule && !/print/i.test(rule.conditionText) && matchMedia(rule.conditionText).matches) {
          walk(rule.cssRules);
        }
      }
    };
    walk(sheet.cssRules);
    return rules;
  }

  const probe = document.createElement('span'); // for reading a style written on an element

  /** One of a book's files, read as a page. A book's pages are XHTML, which is stricter than
      HTML; one that breaks its rules is read as HTML instead. */
  async function pageOf(item, path) {
    const text = await window.api.library.text(item.file, path);
    const page = parse(text, 'application/xhtml+xml');
    return page.querySelector('parsererror') || !page.body ? parse(text, 'text/html') : page;
  }

  // What cleaning a page keeps.
  const CLEANING = { USE_PROFILES: { html: true, mathMl: true, svg: true }, FORBID_TAGS: BANNED, FORBID_ATTR: ['style', 'srcset', 'sizes'] };

  /** One section of a book as it is searched: cleaned as `section` cleans it, so that its
      words are exactly the page's, but kept out of the window's own document, so that none
      of its pictures is fetched. Its names are as the book wrote them. */
  async function text(item, book, index) {
    return DOMPurify.sanitize((await pageOf(item, book.sections[index].path)).body, { RETURN_DOM_FRAGMENT: true, RETURN_DOM_IMPORT: false, ...CLEANING });
  }

  /** One of a book's files, ready for the page: cleaned, its pictures pointed at the book,
      its links marked with where they lead (and those to notes as such), and its names (ids and classes) given the
      book's prefix so they cannot be mistaken for the app's own. With it come the
      stylesheets it asks for (as paths in the book) and the styles written in its head. */
  async function piece(item, path) {
    const page = await pageOf(item, path);
    const address = (from) => 'book://b/' + encodeURIComponent(item.file) + '/' + follow(path, from).path.split('/').map(encodeURIComponent).join('/');
    const elsewhere = (from) => !from || /^[a-z][a-z0-9+.-]*:/i.test(from); // no address, or one outside the book

    const sheets = [...page.querySelectorAll('link[href]')].filter((link) => /\bstylesheet\b/i.test(link.getAttribute('rel') ?? '')).map((link) => follow(path, link.getAttribute('href')).path);
    const written = [...page.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    // A style written on an element is set aside under another name, to be let back in part.
    for (const styled of page.body.querySelectorAll('[style]')) styled.setAttribute('data-b-style', styled.getAttribute('style'));
    // A link the book itself calls a note's number is marked as one (what it calls things
    // does not outlast the cleaning).
    for (const link of page.body.querySelectorAll('a[href]')) {
      const called = [link.getAttribute('epub:type'), link.getAttributeNS('http://www.idpf.org/2007/ops', 'type'), link.getAttribute('role')].join(' ');
      if (/\bnoteref\b/.test(called)) link.setAttribute('data-b-note', '');
      else link.removeAttribute('data-b-note');
    }

    const clean = DOMPurify.sanitize(page.body, { RETURN_DOM_FRAGMENT: true, ...CLEANING });

    for (const picture of clean.querySelectorAll('img')) {
      if (elsewhere(picture.getAttribute('src'))) picture.remove();
      else picture.setAttribute('src', address(picture.getAttribute('src')));
      picture.removeAttribute('width');
      picture.removeAttribute('height');
    }
    // A picture inside a drawing, which is how many covers are made.
    const XLINK = 'http://www.w3.org/1999/xlink';
    for (const picture of clean.querySelectorAll('image')) {
      const from = picture.getAttribute('href') ?? picture.getAttributeNS(XLINK, 'href');
      picture.removeAttributeNS(XLINK, 'href');
      if (elsewhere(from)) picture.remove();
      else picture.setAttribute('href', address(from));
    }
    for (const named of clean.querySelectorAll('[id]')) named.id = 'b-' + named.id;
    for (const named of clean.querySelectorAll('[name]')) named.removeAttribute('name');
    for (const classed of clean.querySelectorAll('[class]')) classed.setAttribute('class', [...classed.classList].map((name) => 'b-' + name).join(' '));
    for (const styled of clean.querySelectorAll('[data-b-style]')) {
      probe.style.cssText = styled.dataset.bStyle;
      for (const name of [...probe.style]) if (worth(name, probe.style.getPropertyValue(name))) styled.style.setProperty(name, probe.style.getPropertyValue(name));
      styled.removeAttribute('data-b-style');
    }
    for (const link of clean.querySelectorAll('a[href]')) {
      const to = link.getAttribute('href');
      if (/^(https?:|mailto:)/i.test(to)) link.dataset.out = to;
      else if (!/^[a-z][a-z0-9+.-]*:/i.test(to)) {
        const led = follow(path, to);
        link.dataset.to = led.path;
        if (led.place) link.dataset.place = led.place;
      }
      link.setAttribute('href', '#'); // the page handles the click
    }
    return { content: clean, sheets, written };
  }

  /** One section of a book, ready for the page. */
  const section = (item, book, index) => piece(item, book.sections[index].path);

  return { open, section, piece, text, tame, BANNED };
})();
