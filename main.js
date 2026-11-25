const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('node:path');

// A test run can keep its window off the screen (INQUISITIVE_HEADLESS=1), so it does not get
// in the way of whoever is at the Mac.
const headless = Boolean(process.env.INQUISITIVE_HEADLESS);
// Such a run keeps its own data too, apart from the app's.
if (headless) app.setPath('userData', path.join(app.getPath('temp'), 'inquisitive-test'));

let win = null;

function createWindow() {
  win = new BrowserWindow({
    show: !headless,
    width: 1180,
    height: 780,
    minWidth: 640,
    minHeight: 400,
    // The window draws its own top bar, beside the window buttons.
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#181613' : '#f5f1e8', // --paper in style.css
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: !headless,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
