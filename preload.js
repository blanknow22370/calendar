"use strict";

const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("chronicleDesktop", Object.freeze({
  saveProject: payload => ipcRenderer.invoke("project:save", payload),
  openProject: () => ipcRenderer.invoke("project:open"),
  onCommand: callback => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("desktop-command", listener);
    return () => ipcRenderer.removeListener("desktop-command", listener);
  }
}));
