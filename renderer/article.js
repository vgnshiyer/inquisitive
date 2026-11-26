'use strict';

// Saving an article from the web. The main process fetches the page (library.js); this finds
// the article in it, with Mozilla's Readability (what Firefox's reader view uses), cleans
// it, and sets it out as a small page of its own. That page and its pictures are then saved
// as a folder in the library, and from there an article is read just as a book of one
// section is (book.js).

const Article = (() => {
  const PAGE = 'article.html';
  const WORDS = 230; // about what is read in a minute
  const LEAST = 140; // fewer letters than this is not an article: a page of links, or a wall asking you to sign in
  const words = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
  const plain = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** A fetched page, read for its article: its title, who wrote it, the site it is from,
      about how many minutes it takes to read, the page to save, and the web addresses of its
      pictures. In the page each picture's address is a stand-in ("picture-3.inq", for the
      fourth), to be changed for the file's name once it has been fetched. Throws if no
      article is found. */
  function read(html, address) {
    const page = new DOMParser().parseFromString(html, 'text/html');
    // Addresses in the page are written from where the page was; say where that is.
    const base = page.querySelector('base[href]') ?? page.head.insertBefore(page.createElement('base'), page.head.firstChild);
    try {
      base.setAttribute('href', new URL(base.getAttribute('href') ?? '', address).href);
    } catch {
      base.setAttribute('href', address);
    }
    const found = new Readability(page).parse();
    if (!found || words(found.textContent).length < LEAST) throw new Error('no article found');

    const clean = DOMPurify.sanitize(found.content, { RETURN_DOM_FRAGMENT: true, USE_PROFILES: { html: true, mathMl: true, svg: true }, FORBID_TAGS: Book.BANNED, FORBID_ATTR: ['style', 'class', 'srcset', 'sizes'] });

    // Pictures: one address each, to be fetched and saved beside the page.
    const pictures = [];
    for (const several of clean.querySelectorAll('picture')) several.replaceWith(...[several.querySelector('img')].filter(Boolean));
    for (const picture of clean.querySelectorAll('img')) {
      const from = picture.getAttribute('src') ?? '';
      if (!/^https?:/i.test(from)) {
        picture.remove();
        continue;
      }
      const index = pictures.includes(from) ? pictures.indexOf(from) : pictures.push(from) - 1;
      picture.setAttribute('src', `picture-${index}.inq`);
      for (const name of ['width', 'height', 'loading', 'decoding']) picture.removeAttribute(name);
    }
    // A link to another place on the same page stays within the article.
    const here = new URL(address).href.split('#')[0];
    for (const link of clean.querySelectorAll('a[href]')) {
      const to = link.getAttribute('href');
      if (to.startsWith(here + '#')) link.setAttribute('href', to.slice(here.length));
    }
    // Its headings are its contents: each needs a name to be gone to by.
    let count = 0;
    for (const heading of clean.querySelectorAll('h2, h3')) heading.id ||= 'inq-' + ++count;

    const site = words(found.siteName) || new URL(address).hostname.replace(/^www\./, '');
    // A page's title often has its site's name tacked on, before or after: "… — The Review".
    const tacked = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const title = words(found.title).replace(new RegExp(`\\s+[|\\-–—:·•]\\s+${tacked}$|^${tacked}\\s+[|\\-–—:·•]\\s+`, 'i'), '') || site;
    const author = words(found.byline).replace(/^by\s+/i, '');
    const holder = document.createElement('div');
    holder.append(clean);
    const lines = [
      '<!doctype html>',
      `<html${found.lang ? ` lang="${plain(found.lang)}"` : ''}>`,
      '<head>',
      '<meta charset="utf-8">',
      `<title>${plain(title)}</title>`,
      `<link rel="canonical" href="${plain(address)}">`,
      '</head>',
      '<body>',
      '<header>',
      `<h1>${plain(title)}</h1>`,
      `<p>${plain([author, site].filter(Boolean).join(' · '))}</p>`,
      '</header>',
      holder.innerHTML,
      '</body>',
      '</html>',
      '',
    ];
    return { title, author, site, minutes: Math.max(1, Math.round(words(found.textContent).split(' ').length / WORDS)), html: lines.join('\n'), pictures };
  }

  /** A saved article's shape, as a book's is given (book.js): one section, the page, and for
      contents its headings, if it has more than one. */
  async function open(item) {
    const text = await window.api.library.text(item.file, PAGE);
    const headings = [...new DOMParser().parseFromString(text, 'text/html').body.querySelectorAll('h2[id], h3[id]')].filter((heading) => words(heading.textContent));
    const top = headings.some((heading) => heading.localName === 'h2') ? 2 : 3;
    const toc = headings.map((heading) => ({ title: words(heading.textContent), section: 0, place: heading.id, depth: Number(heading.localName[1]) - top }));
    return { title: item.title, author: item.author, sections: [{ path: PAGE, size: text.length || 1 }], toc: toc.length > 1 ? toc : [] };
  }

  return { read, open };
})();
