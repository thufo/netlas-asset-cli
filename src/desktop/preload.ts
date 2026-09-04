import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "./api";

const api: DesktopApi = {
  getState: () => ipcRenderer.invoke("app:get-state"),
  setLanguage: (language) => ipcRenderer.invoke("app:set-language", language),
  saveSettings: (input) => ipcRenderer.invoke("settings:save", input),
  runQuery: (request) => ipcRenderer.invoke("query:run", request),
  cancelQuery: () => ipcRenderer.invoke("query:cancel"),
  exportResult: (format, data) => ipcRenderer.invoke("result:export", { format, data }),
  toggleFavorite: (id) => ipcRenderer.invoke("history:favorite", id),
  deleteHistory: (id) => ipcRenderer.invoke("history:delete", id),
  clearHistory: (includeFavorites) => ipcRenderer.invoke("history:clear", includeFavorites),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openRelease: () => ipcRenderer.invoke("update:open-release"),
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on("update:state", listener);
    return () => ipcRenderer.removeListener("update:state", listener);
  },
};

contextBridge.exposeInMainWorld("netlas", api);
