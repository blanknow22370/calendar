"use strict";

const asar = require("@electron/asar");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const root = path.resolve(__dirname, "..");
  const releaseRoot = path.join(root, "release");
  const destination = path.join(releaseRoot, "ChronicleForge-win32-x64");
  const staging = path.join(releaseRoot, ".app-staging");
  if (!destination.startsWith(`${releaseRoot}${path.sep}`) || !staging.startsWith(`${releaseRoot}${path.sep}`)) throw new Error("Invalid release path");

  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.rm(staging, { recursive: true, force: true });
  await fs.promises.mkdir(releaseRoot, { recursive: true });
  await fs.promises.cp(path.join(root, "node_modules", "electron", "dist"), destination, { recursive: true });

  const electronExe = path.join(destination, "electron.exe");
  const appExe = path.join(destination, "ChronicleForge.exe");
  await fs.promises.rename(electronExe, appExe);
  await fs.promises.rm(path.join(destination, "resources", "default_app.asar"), { force: true });

  await fs.promises.mkdir(path.join(staging, "assets"), { recursive: true });
  for (const file of ["app.js", "desktop.js", "index.html", "package.json", "preload.js", "styles.css"]) {
    await fs.promises.copyFile(path.join(root, file), path.join(staging, file));
  }
  for (const file of ["app-icon.ico", "app-icon.png", "app-icon.svg"]) {
    await fs.promises.copyFile(path.join(root, "assets", file), path.join(staging, "assets", file));
  }
  await asar.createPackage(staging, path.join(destination, "resources", "app.asar"));
  await fs.promises.rm(staging, { recursive: true, force: true });

  const reseditModule = await import(pathToFileURL(path.join(root, "node_modules", "@electron", "packager", "dist", "resedit.js")));
  await reseditModule.resedit(appExe, {
    iconPath: path.join(root, "assets", "app-icon.ico"),
    fileVersion: "3.6.0.0",
    productVersion: "3.6.0.0",
    productName: "Chronicle Forge",
    win32Metadata: {
      CompanyName: "Chronicle Forge",
      FileDescription: "中文多层时间线编辑器",
      OriginalFilename: "ChronicleForge.exe",
      ProductName: "Chronicle Forge"
    }
  });
  console.log(destination);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
