// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path  = require("path");
const fs    = require("fs");
const RPC   = require("discord-rpc");

const DISCORD_APP_ID = "1373652899661479989";
RPC.register(DISCORD_APP_ID);
const rpc = new RPC.Client({ transport: "ipc" });
rpc.on("ready", () => {
  rpc.setActivity({
    details: "Idle in Harmonicon",
    largeImageKey: "harmonicon_icon",
    largeImageText: "Harmonicon Audio App",
    instance: false,
  });
});
rpc.login({ clientId: DISCORD_APP_ID }).catch(console.error);

// ─── 1. Folder locations ──────────────────────────────────────────────
const userAudioRoot    = path.join(app.getPath("home"), "Harmonicon-Uploads");
const builtInAudioRoot = path.join(__dirname, "public", "audio");

// ─── 2. Helpers ────────────────────────────────────────────────────────
function readAudioRoot(root, isUser = false) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).map((cat) => ({
    category: cat,
    files: fs.readdirSync(path.join(root, cat)).map((file) =>
    isUser ? { label: file, path: path.join(root, cat, file) } : file
    ),
  }));
}

function scanLibrary() {
  const builtIn = readAudioRoot(builtInAudioRoot, false);
  const user    = readAudioRoot(userAudioRoot,   true);
  const map     = new Map();
  function insert(cat, file) {
    const label = typeof file === "string" ? file : file.label;
    if (!map.has(cat)) map.set(cat, new Map());
    map.get(cat).set(label, file);
  }
  builtIn.forEach(({ category, files }) => files.forEach((f) => insert(category, f)));
  user   .forEach(({ category, files }) => files.forEach((f) => insert(category, f)));
  return [...map].map(([category, fileMap]) => ({
    category,
    files: [...fileMap.values()],
  }));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isInsideUserRoot(p) {
  const rel = path.relative(userAudioRoot, p);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

// ─── 3. IPC handlers ──────────────────────────────────────────────────
ipcMain.handle("get-library", () => scanLibrary());

ipcMain.handle("save-audio", async (_e, src, category, name) => {
  const safeName = name.replace(/[<>:"/\\|?*]+/g, "_");
  const dir  = path.join(userAudioRoot, category);
  ensureDir(dir);
  const ext = path.extname(typeof src === 'string' ? src : safeName) || ".mp3";
  const dest = path.join(dir, safeName + ext);

  try {
    if (Buffer.isBuffer(src)) {
      await fs.promises.writeFile(dest, src);
    } else if (typeof src === "string") {
      await fs.promises.copyFile(src, dest);
    } else if (src && typeof src.path === "string") {
      await fs.promises.copyFile(src.path, dest);
    } else {
      throw new TypeError("Invalid src argument: must be a string path or Buffer");
    }
  } catch (err) {
    console.error("Failed to save file:", err);
    throw new Error("Failed to save file: " + err.message);
  }

  return dest;
});

ipcMain.handle("delete-file", async (_e, abs) => {
  if (!isInsideUserRoot(abs)) throw new Error("Invalid path");
  await fs.promises.unlink(abs);
  return true;
});

ipcMain.handle("delete-category", async (_e, cat) => {
  const dir = path.join(userAudioRoot, cat);
  if (!isInsideUserRoot(dir)) throw new Error("Invalid category");
  await fs.promises.rm(dir, { recursive: true, force: true });
  return true;
});

ipcMain.handle("update-presence", (_e, activity) => {
  rpc.setActivity(activity).catch(console.error);
});

// ─── 4. Create window & load ──────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "public", "icon.ico"),
  });
  win.loadFile(path.join(__dirname, "src", "index.html"));
}

// ─── 5. App lifecycle ─────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
