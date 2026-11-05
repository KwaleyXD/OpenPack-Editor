const { app, BrowserWindow, protocol, net, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Serving dist/ from a custom origin keeps root-relative URLs (/assets, /vanilla_base)
// working and gives localStorage a stable origin for autosave.
const SCHEME = "app";
const HOST = "openpack";
const DIST_DIR = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function resolveDistPath(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = path.normalize(path.join(DIST_DIR, relative));
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    return null;
  }
  return filePath;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    backgroundColor: "#1e1e1e",
    title: "OpenPack Studio",
    icon: path.join(DIST_DIR, "logo.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(`${SCHEME}://${HOST}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const filePath = resolveDistPath(request.url);
    if (!filePath) return new Response("Forbidden", { status: 403 });
    return net
      .fetch(pathToFileURL(filePath).toString())
      .catch(() => new Response("Not found", { status: 404 }));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
