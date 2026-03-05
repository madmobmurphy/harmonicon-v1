// preload.js  ───────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // fetch merged library (built-in + user)
  getLibrary:     () => ipcRenderer.invoke("get-library"),

  // persist an uploaded audio file into userData
  saveAudio:      (tempPath, category, displayName) =>
                    ipcRenderer.invoke("save-audio", tempPath, category, displayName),

  // delete one custom file by absolute path
  deleteFile:     (absPath) => ipcRenderer.invoke("delete-file", absPath),

  // delete an entire custom category folder
  deleteCategory: (category) => ipcRenderer.invoke("delete-category", category),

  // update Discord Rich Presence from the renderer
  updatePresence:(activity) => ipcRenderer.invoke("update-presence", activity),
});
