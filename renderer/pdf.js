// Reading a PDF, with PDF.js (Mozilla's reader, in node_modules/pdfjs-dist). It reads the
// file and draws each page to a canvas; the app lays those out as its sheets (app.js) and
// gives them the theme's paper and ink (style.css).
//
// This file is a module, as PDF.js is; it leaves what it offers on the window as `Pdf`.

import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.mjs';

const home = new URL('../node_modules/pdfjs-dist/', import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = home + 'build/pdf.worker.mjs';
// One worker does the reading for every PDF, started when the first is opened. (Left to
// itself PDF.js starts a new one for each, which makes each slow to open.)
let worker = null;

window.Pdf = {
  /** Opens a PDF: how many pages it has, the shape of each (width over height), its title
      and author if it gives them, and its outline as contents (each a title, the
      page it leads to, counted from 0, and how deep it is nested). */
  async open(item) {
    const data = await window.api.library.bytes(item.file);
    worker ??= new pdfjs.PDFWorker();
    const task = pdfjs.getDocument({ data, worker, cMapUrl: home + 'cmaps/', standardFontDataUrl: home + 'standard_fonts/', wasmUrl: home + 'wasm/', iccUrl: home + 'iccs/', isEvalSupported: false });
    const doc = await task.promise;
    // The shape of every page, so each sheet is right from the start. A very long PDF's are
    // taken to be the shape of its first, and put right as each is drawn.
    const shapeOf = async (number) => {
      const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 });
      return width / height;
    };
    const first = await shapeOf(1);
    const shapes = doc.numPages <= 400 ? await Promise.all(Array.from({ length: doc.numPages }, (_, i) => shapeOf(i + 1))) : Array(doc.numPages).fill(first);
    const info = (await doc.getMetadata().catch(() => null))?.info ?? {};
    const toc = [];
    const walk = async (entries, depth) => {
      for (const entry of entries ?? []) {
        try {
          // An entry leads to a named place, or straight to a page (by reference, or by number).
          const place = typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
          if (place?.[0] != null) toc.push({ title: String(entry.title).trim(), section: typeof place[0] === 'object' ? await doc.getPageIndex(place[0]) : place[0], depth });
        } catch {
          // an entry that leads nowhere is left out
        }
        await walk(entry.items, depth + 1);
      }
    };
    await walk(await doc.getOutline().catch(() => null), 0);
    return { doc, task, pages: doc.numPages, shapes, title: String(info.Title ?? '').trim(), author: String(info.Author ?? '').trim(), toc };
  },

  /** Draws one page (counted from 1) to a new canvas, sharp at this many pixels wide on
      screen. With it comes the page's words: an unseen copy of its text, each run laid
      exactly over its picture on the canvas, which is what the pointer selects and what is
      copied. (A scanned page has no words to give.) Gives the canvas, the words, the
      page's links, and its shape. */
  async draw(doc, number, width) {
    const page = await doc.getPage(number);
    const flat = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (Math.max(1, width) * devicePixelRatio) / flat.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    const words = document.createElement('div');
    words.className = 'words';
    const scale = Math.max(1, width) / flat.width; // screen pixels to one of the page's own points
    words.style.setProperty('--total-scale-factor', String(scale));
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: words, viewport: page.getViewport({ scale }) }).render().catch(() => {});
    // Its links: where each lies on the page (as parts of its width and height), and where
    // it leads: out to the web, or to a place in the PDF.
    const links = [];
    for (const mark of await page.getAnnotations().catch(() => [])) {
      if (mark.subtype !== 'Link' || !mark.rect || !(mark.url || mark.dest)) continue;
      const [left, top] = flat.convertToViewportPoint(mark.rect[0], mark.rect[1]);
      const [right, foot] = flat.convertToViewportPoint(mark.rect[2], mark.rect[3]);
      const box = [Math.min(left, right) / flat.width, Math.min(top, foot) / flat.height, Math.abs(right - left) / flat.width, Math.abs(foot - top) / flat.height];
      links.push(mark.url ? { box, out: mark.url } : { box, dest: mark.dest });
    }
    return { canvas, words, links, shape: flat.width / flat.height };
  },

  /** Where a link within a PDF leads: the page (counted from 0), and how far down it (0 at
      its top, 1 at its foot). Nothing, if it leads nowhere. */
  async place(doc, dest) {
    try {
      // To a named place, or straight to a page (by reference, or by number).
      const to = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (to?.[0] == null) return null;
      const section = typeof to[0] === 'object' ? await doc.getPageIndex(to[0]) : to[0];
      if (!(section >= 0 && section < doc.numPages)) return null;
      // How far down, where the place says: the page's top otherwise.
      const how = to[1]?.name;
      const height = how === 'XYZ' ? to[3] : how === 'FitH' || how === 'FitBH' ? to[2] : how === 'FitR' ? to[5] : null;
      if (typeof height !== 'number') return { section, part: 0 };
      const flat = (await doc.getPage(section + 1)).getViewport({ scale: 1 });
      return { section, part: Math.max(0, Math.min(1, flat.convertToViewportPoint(0, height)[1] / flat.height)) };
    } catch {
      return null;
    }
  },

  /** One page's words (counted from 1) as they are searched: its runs of text one after
      another, with a new line wherever a line ends. */
  async text(doc, number) {
    const { items } = await (await doc.getPage(number)).getTextContent({ disableNormalization: true });
    return items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join('');
  },

  /** Puts a PDF away. */
  close(pdf) {
    pdf?.task.destroy();
  },
};
