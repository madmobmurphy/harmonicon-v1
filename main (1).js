const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// Create the main application window.  This function can be expanded to
// customise your window (e.g. set size, icon, preload script).  Ensure that
// 'preload.js' exists in the same directory and exposes your IPC wrappers.
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Load your application's HTML.  Adjust this path if your build
  // outputs to a different folder (e.g. dist/index.html).
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// On macOS it is common to recreate a window in the app when the dock icon is
// clicked and there are no other windows open.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * IPC handler to save audio files.  It accepts three arguments:
 *  - src: either a file path (string), a Buffer, or an object containing a
 *    .path property.  Node's fs API requires a string or Buffer; any other
 *    type will cause an error【165857702112707†L106-L108】.
 *  - category: the folder name under the Harmonicon-Uploads directory.
 *  - label: the desired display name (without extension) of the file.
 *
 * The file will be stored in a directory within the user's home folder,
 * specifically under ~/Harmonicon-Uploads/<category>.  Any required
 * directories are created automatically.  The handler sanitizes the label
 * and computes a safe file name, then copies or writes the file using
 * Node's fs API.
 */
ipcMain.handle('save-audio', async (_event, src, category, label) => {
  // Validate category and label
  if (typeof category !== 'string' || !category.trim()) {
    throw new Error('Category must be a non-empty string');
  }
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error('Label must be a non-empty string');
  }

  // Sanitize label: remove path separators and leading dots
  const safeLabel = label.replace(/[\\\/]/g, '').replace(/^\.+/, '');
  // Choose extension: if src is a string use its extension, otherwise default to .mp3
  const ext = path.extname(typeof src === 'string' ? src : safeLabel) || '.mp3';
  // Determine destination directory and file name
  const uploadsDir = path.join(app.getPath('home'), 'Harmonicon-Uploads', category);
  const destPath = path.join(uploadsDir, safeLabel + ext);

  // Ensure destination directory exists
  await fs.promises.mkdir(uploadsDir, { recursive: true });

  try {
    if (Buffer.isBuffer(src)) {
      // Write the buffer directly to disk
      await fs.promises.writeFile(destPath, src);
    } else if (typeof src === 'string') {
      // Copy from an existing file path
      await fs.promises.copyFile(src, destPath);
    } else if (src && typeof src.path === 'string') {
      // Support objects with a .path property (e.g. older File objects)
      await fs.promises.copyFile(src.path, destPath);
    } else {
      // Invalid type: throw a descriptive error
      throw new TypeError('Invalid src type; expected a file path string or Buffer');
    }
  } catch (err) {
    console.error('Failed to save audio file:', err);
    throw new Error('File write failed: ' + err.message);
  }

  return destPath;
});

// Placeholder handlers for library management.  You should implement these
// according to your application's needs.  For example, getLibrary should
// merge built-in audio files with the user's uploaded audio.
ipcMain.handle('getLibrary', async () => {
  // TODO: return an array of { category: string, files: Array<{label, path}|string> }
  return [];
});

ipcMain.handle('deleteFile', async (_event, filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.error('Failed to delete file:', err);
    throw new Error('Delete file failed: ' + err.message);
  }
});

ipcMain.handle('deleteCategory', async (_event, category) => {
  // Remove the entire category directory from Harmonicon-Uploads.  Be cautious
  // when deleting directories; fs.rm will recursively remove the contents.
  const dir = path.join(app.getPath('home'), 'Harmonicon-Uploads', category);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to delete category:', err);
    throw new Error('Delete category failed: ' + err.message);
  }
});