const { app, BrowserWindow, ipcMain, nativeTheme, screen } = require('electron');
const path = require('node:path');

// A test run can keep its window off the screen (INQUISITIVE_HEADLESS=1), so it does not get
// in the way of whoever is at the Mac.
const headless = Boolean(process.env.INQUISITIVE_HEADLESS);
// Such a run keeps its own data too, apart from the app's.
if (headless) app.setPath('userData', path.join(app.getPath('temp'), 'inquisitive-test'));

let win = null;

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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#181613' : '#f5f1e8', // --paper in style.css
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !headless,
    },
  });
  // With INQUISITIVE_EMPTY set, the window starts with an empty library, to see the pages as
  // they are on a first launch.
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), process.env.INQUISITIVE_EMPTY ? { query: { empty: '1' } } : {});
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
