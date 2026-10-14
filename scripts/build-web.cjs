"use strict";

// 生成网页版发布目录：只挑选浏览器运行必需的文件，剔除 Electron 专属代码。
// 用法：npm.cmd run build:web
//
// 输出：release/web/  —— 可直接拖到任意静态托管（GitHub Pages / Netlify / Vercel / 对象存储）。
// 之所以要单独生成而不是直接发布 source/，是因为 source/ 里混着 desktop.js、preload.js、
// package.json 等只在 Electron 里使用的文件，公网托管没必要暴露它们。

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releaseRoot = path.join(root, "release");
const out = path.join(releaseRoot, "web");

// index.html 直接引用的文件，加上托管平台需要的配套文件
const WEB_FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "404.html",
  "robots.txt",
  "site.webmanifest",
  "netlify.toml",
  "vercel.json"
];

// assets/ 下被 index.html 和 manifest 引用的图标
const ICON_FILES = ["app-icon.ico", "app-icon.png", "app-icon.svg"];

(async () => {
  if (!out.startsWith(`${releaseRoot}${path.sep}`)) throw new Error("Invalid output path");

  await fs.promises.rm(out, { recursive: true, force: true });
  await fs.promises.mkdir(path.join(out, "assets"), { recursive: true });

  const written = [];
  for (const file of WEB_FILES) {
    const from = path.join(root, file);
    if (!fs.existsSync(from)) throw new Error(`缺少网页版文件：${file}`);
    await fs.promises.copyFile(from, path.join(out, file));
    written.push(file);
  }

  for (const file of ICON_FILES) {
    const from = path.join(root, "assets", file);
    if (!fs.existsSync(from)) throw new Error(`缺少图标文件：assets/${file}`);
    await fs.promises.copyFile(from, path.join(out, "assets", file));
    written.push(`assets/${file}`);
  }

  // GitHub Pages 默认走 Jekyll 处理，会忽略部分文件；.nojekyll 让 Pages 按纯静态目录发布。
  await fs.promises.writeFile(path.join(out, ".nojekyll"), "");
  written.push(".nojekyll");

  // 顺手核对 CSP 里写死的检索域名，避免以后改动接口却忘了同步
  const html = await fs.promises.readFile(path.join(root, "index.html"), "utf8");
  const cspHosts = [...html.matchAll(/https:\/\/([\w.-]+)/g)].map(match => match[1]);
  const expected = ["zh.wikipedia.org", "www.wikidata.org", "openlibrary.org"];
  const missing = expected.filter(host => !cspHosts.includes(host));

  const totalBytes = written.reduce((sum, file) => sum + fs.statSync(path.join(out, file)).size, 0);
  console.log(`网页版已生成：${out}`);
  console.log(`文件 ${written.length} 个，合计 ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(written.join("\n"));
  if (missing.length) {
    console.warn(`\n⚠ index.html 的 CSP 未包含这些检索域名：${missing.join(", ")}`);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
