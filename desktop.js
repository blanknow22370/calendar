"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron/main");
const fs = require("node:fs");
const path = require("node:path");

if (app.isPackaged) {
  app.setPath("userData", path.join(path.dirname(process.execPath), "data"));
}

const windowStatePath = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), "utf8"));
    if (Number.isFinite(state.width) && Number.isFinite(state.height)) return state;
  } catch (_) { /* first launch */ }
  return { width: 1500, height: 940, maximized: true };
}

function saveWindowState(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getNormalBounds();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(windowStatePath(), JSON.stringify({ ...bounds, maximized: window.isMaximized() }, null, 2));
}

function safeFileName(value) {
  return String(value || "时间线项目").replace(/[\\/:*?"<>|]/g, "-").trim() || "时间线项目";
}

function createApplicationMenu(window) {
  return Menu.buildFromTemplate([
    {
      label: "文件",
      submenu: [
        { label: "导入项目…", accelerator: "Ctrl+O", click: () => window.webContents.send("desktop-command", "import") },
        { label: "导出项目…", accelerator: "Ctrl+Shift+S", click: () => window.webContents.send("desktop-command", "export") },
        { type: "separator" },
        { label: "打开数据目录", click: () => shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "togglefullscreen", label: "全屏" }
      ]
    }
  ]);
}

function createWindow() {
  const state = readWindowState();
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: "#fbfbfe",
    icon: path.join(__dirname, "assets", "app-icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  window.setMenu(createApplicationMenu(window));
  window.loadFile("index.html");
  window.once("ready-to-show", () => {
    if (state.maximized) window.maximize();
    window.show();
  });
  window.on("close", () => saveWindowState(window));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

ipcMain.handle("project:save", async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: "导出时间线项目",
    defaultPath: path.join(app.getPath("documents"), `${safeFileName(payload?.name)}.json`),
    filters: [{ name: "Chronicle Forge 项目", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.promises.writeFile(result.filePath, String(payload?.content || ""), "utf8");
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "导入时间线项目",
    properties: ["openFile"],
    filters: [{ name: "Chronicle Forge 项目", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, filePath: result.filePaths[0], content: await fs.promises.readFile(result.filePaths[0], "utf8") };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
