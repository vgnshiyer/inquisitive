const { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const library = require('./library.js');
const assistant = require('./assistant.js');

// A test run can keep its window off the screen (INQUISITIVE_HEADLESS=1), so it does not get
// in the way of whoever is at the Mac.
const headless = Boolean(process.env.INQUISITIVE_HEADLESS);
// Such a run keeps its own data too, apart from the app's.
if (headless) app.setPath('userData', path.join(app.getPath('temp'), 'inquisitive-test'));

let win = null;

// What the app keeps for itself between runs, apart from the library: whether it is light or
// dark, or follows the Mac ('system'). It is read before the window opens, so that the
// window opens in the right one.
const KEPT = path.join(app.getPath('userData'), 'settings.json');
const LOOKS = ['system', 'light', 'dark'];
function kept() {
  try {
    return JSON.parse(fs.readFileSync(KEPT, 'utf8'));
  } catch {
    return {}; // nothing kept yet
  }
}

// Where the window buttons sit: in the top bar, as far from its top as from the window's left.
const LIGHTS = { x: 16, y: 15 };

function createWindow() {
  win = new BrowserWindow({
    show: !headless,
    width: 1180,
    height: 780,
    minWidth: 640,
    minHeight: 400,
    // The window draws its own top bar, beside the window buttons.
    titleBarStyle: 'hidden',
    trafficLightPosition: LIGHTS,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#181613' : '#f6f1e6', // --paper in style.css
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !headless,
    },
  });
  // With INQUISITIVE_SAMPLE set, the window shows stand-in items in place of the library and
  // keeps nothing: for working on how the app looks.
  const query = {};
  if (process.env.INQUISITIVE_SAMPLE) query.sample = '1';
  // A test run (off-screen, or with a library of its own) goes without the opening, so
  // nothing has to wait for it; INQUISITIVE_OPENING=1 keeps it, for testing the opening.
  if ((headless || process.env.INQUISITIVE_LIBRARY) && !process.env.INQUISITIVE_OPENING) query.quiet = '1';
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  // The window never leaves its own page: a file dropped on it, for one, is not opened in it.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.on('closed', () => {
    win = null;
  });
}

// While something is being read the top bar keeps out of sight, and the window buttons go
// with it; the window says when they should be there.
ipcMain.on('window-buttons', (event, show) => {
  const asked = BrowserWindow.fromWebContents(event.sender);
  if (process.platform !== 'darwin' || !asked) return;
  asked.setWindowButtonVisibility(Boolean(show));
  // Shown again, the buttons come back where macOS would put them, not where they were: put
  // them back.
  if (show) asked.setWindowButtonPosition(LIGHTS);
});

// The bar comes back when the pointer goes up to it, and how far you have read shows when the
// pointer goes down to the foot. The page cannot see the pointer over the part of a window
// you drag by, which is where the bar is, so the pointer is watched from here: while the
// window asks, it is told each time the pointer enters or leaves the top or the foot.
const BAND = 44; // how deep the top and the foot are: the top bar's height
let watching = null;

ipcMain.on('watch-pointer', (event, on) => {
  clearInterval(watching);
  watching = null;
  const asked = BrowserWindow.fromWebContents(event.sender);
  if (!on || !asked) return;
  let zone = 'none';
  watching = setInterval(() => {
    if (asked.isDestroyed()) return clearInterval(watching);
    const at = screen.getCursorScreenPoint();
    const bounds = asked.getContentBounds();
    const y = at.y - bounds.y;
    const inside = asked.isFocused() && at.x >= bounds.x && at.x < bounds.x + bounds.width && y >= 0 && y < bounds.height;
    // Once at the top the pointer has to come well clear of it to count as gone, so the bar
    // does not flicker at its lower edge.
    const now = !inside ? 'none' : y < (zone === 'top' ? BAND + 20 : BAND) ? 'top' : y >= bounds.height - BAND ? 'foot' : 'none';
    if (now === zone) return;
    zone = now;
    event.sender.send('pointer', zone);
  }, 60);
});

// The Settings page: what it shows of the app (its version, whether it is light or dark, and
// where the library is, with the home folder written ~), and what it changes.
/** A folder as it is shown: the home folder written ~. */
const shown = (folder) => (folder.startsWith(os.homedir() + path.sep) ? '~' + folder.slice(os.homedir().length) : folder);
ipcMain.handle('settings:load', () => ({ version: app.getVersion(), appearance: nativeTheme.themeSource, folder: shown(library.folder()) }));
ipcMain.on('settings:appearance', (event, look) => {
  if (!LOOKS.includes(look)) return;
  nativeTheme.themeSource = look;
  try {
    fs.writeFileSync(KEPT, JSON.stringify({ ...kept(), appearance: look }, null, 2));
  } catch {
    // not kept: it holds for this run
  }
});
// The library, moved into a folder you choose (a test run off-screen is told which). Where it
// went is kept, to be found there next time. Gives where it now is, or why it did not move.
ipcMain.handle('settings:move', async (event, into) => {
  const picked = headless ? into : (await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Move the library',
    message: `Choose a folder to keep your library in. It moves there whole, as a folder called “${path.basename(library.folder())}”.`,
    buttonLabel: 'Move Here',
    properties: ['openDirectory', 'createDirectory'],
  })).filePaths[0];
  if (!picked) return { none: true };
  const moved = library.move(picked);
  if (!moved.folder) return moved;
  // (Where a run was told where its library is, that holds for the next run too.)
  if (!process.env.INQUISITIVE_LIBRARY) {
    try {
      fs.writeFileSync(KEPT, JSON.stringify({ ...kept(), library: moved.folder }, null, 2));
    } catch {
      return { folder: shown(moved.folder), why: 'The library was moved, but where to could not be kept. It will be looked for in Documents next time.' };
    }
  }
  return { folder: shown(moved.folder) };
});
// The library's folder, shown in the Finder. (A test run off-screen opens nothing.)
ipcMain.on('settings:reveal', () => {
  if (!headless) shell.openPath(library.folder());
});

app.whenReady().then(() => {
  const look = kept().appearance;
  if (LOOKS.includes(look)) nativeTheme.themeSource = look;
  // The library is where it was moved to, if it was. If that folder cannot be found (a disk
  // not plugged in, say), this run uses the usual one, and where it was moved to is kept.
  const moved = !process.env.INQUISITIVE_LIBRARY && !headless && kept().library;
  if (typeof moved === 'string' && moved) {
    if (fs.existsSync(moved)) library.place(moved);
    else dialog.showMessageBoxSync({ type: 'warning', message: 'Your library cannot be found.', detail: `It was last kept at ${shown(moved)}. Until that folder is back, Inquisitive uses ${shown(library.usual())}.` });
  }
  // Run from source, the Dock would show Electron's own icon; this gives it the app's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  library.listen();
  assistant.listen();
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
