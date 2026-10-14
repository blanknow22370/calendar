# 发布网页版

Chronicle Forge 的浏览器版本是一个纯静态站点：没有构建步骤，不需要后端，不上传任何用户数据。三个文件就能跑起来——`index.html`、`styles.css`、`app.js`，加上 `assets/` 里的图标。

## 生成本地发布包

```powershell
cd source
npm.cmd run build:web
```

输出在 `source/release/web/`，里面只有浏览器需要的文件。之所以要单独生成、而不是直接把 `source/` 传上服务器，是因为 `source/` 里还放着 `desktop.js`、`preload.js`、`package.json` 这些只在 Electron 桌面版里使用的文件，公网没必要暴露。

想先在本地看一眼效果：

```powershell
cd source
npm.cmd run serve:web
```

然后打开 <http://localhost:4173>。

## 选择托管方式

| 方式 | 适合场景 | 需要什么 |
| --- | --- | --- |
| GitHub Pages | 开源项目、想顺带挂代码 | 一个 GitHub 仓库 |
| Netlify | 想拖拽上传、自动 HTTPS | 注册免费账号 |
| Vercel | 同上，CLI 体验更好 | 注册免费账号 |
| 对象存储 / 自有服务器 | 已有域名和服务器 | 一个能放静态文件的目录 |

四种方式都已经配好了对应文件（`.nojekyll`、`netlify.toml`、`vercel.json`），选一种走即可。

## 方式一：GitHub Pages

`source/.github/workflows/pages.yml` 已经写好，推上去就会自动构建并发布，不需要额外的构建步骤或 `npm install`（脚本只用 Node 内置模块）。

> 本项目实际部署信息：仓库 `https://github.com/blanknow22370/calendar.git`，
> 发布地址 `https://blanknow22370.github.io/calendar/`。
> 下文命令中的 `<你的用户名>/<仓库名>` 均指这一组。

### 第一步：在 GitHub 上建空仓库

浏览器打开 <https://github.com/new>，填仓库名（例如 `chronicle-forge`），**不要**勾选 "Add a README file"，否则本地首次推送会冲突。

仓库必须是 **Public**。GitHub 免费账号的 Pages 只在公开仓库上可用，私有仓库发布 Pages 需要 Pro。

### 第二步：推送代码

```powershell
cd source
git init
git add .
git commit -m "Chronicle Forge v3.6"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

首次 `push` 会弹出浏览器让你登录 GitHub 授权，或者要求输入 Personal Access Token。

分支名必须是 `main`。工作流里写的是 `branches: [main]`，如果你用 `master`，推上去不会触发任何构建。

### 第三步：打开 Pages

到仓库的 **Settings → Pages**，把 **Source** 从 "Deploy from a branch" 改成 **GitHub Actions**。这一步只需要做一次。

回到仓库的 **Actions** 标签页，能看到 "Deploy web version to GitHub Pages" 正在跑。首次大约一两分钟，绿色对勾出现后访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

以后每次 `git push` 到 main 都会自动重新发布。

### 为什么子路径不会出问题

Pages 的项目站点地址带一级子路径（`/chronicle-forge/`），很多静态站点在这里会白屏，因为它对资源用了以 `/` 开头的绝对路径。本项目天然兼容：`index.html` 里的 `styles.css`、`app.js`、`assets/app-icon.svg` 全是相对引用，`site.webmanifest` 里的 `start_url` 和 `scope` 用的也是 `./`，所以放在任意层级都能正常加载。

### 常见失败原因

工作流报 `Get Pages site failed`，说明第三步的 Source 还没改成 GitHub Actions，去 Settings → Pages 确认。

页面打开是空白但仓库里文件都在，检查 Actions 里的构建日志，确认 `node scripts/build-web.cjs` 这一步成功输出了 `release/web`。

推送后 Actions 没有任何记录，检查分支名是不是 `main`，以及 `.github/workflows/pages.yml` 是否真的在仓库根目录（也就是 `source/.github/workflows/pages.yml`，不能多套一层目录）。

## 方式二：Netlify

最简单的是拖拽：先跑 `npm.cmd run build:web`，然后把 `source/release/web/` 整个目录拖到 <https://app.netlify.com/drop>。`netlify.toml` 会自动生效，加上安全响应头和静态资源缓存。

想用命令行：

```powershell
cd source/release/web
npx netlify-cli deploy --dir=. --prod
```

## 方式三：Vercel

```powershell
cd source/release/web
npx vercel --prod
```

首次运行会引导你登录并关联项目，`vercel.json` 里的响应头配置会被自动读取。

## 方式四：自有服务器

把 `source/release/web/` 里的文件传到 Web 根目录即可。Nginx 参考配置：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    root /var/www/chronicle-forge;
    index index.html;

    error_page 404 /404.html;

    location /assets/ {
        add_header Cache-Control "public, max-age=604800";
    }
}
```

务必开启 HTTPS。页面的 CSP 允许 `blob:`，而一些浏览器只在安全上下文中才完全开放剪贴板、文件拖放等能力。

## 上线后需要知道的事

**数据存在访问者自己的浏览器里。** 项目通过 `localStorage` 自动保存，服务端不存任何东西，也不会有任何跨用户的数据共享。这意味着两件事：一是不同人访问同一个网址，各自看到的是各自的空白时间线；二是清理浏览器数据会丢掉项目，重要内容要提醒用户用「导出项目」存成 JSON。

**外部检索依赖三个公开接口。** 素材库会请求中文维基百科、Wikidata 和 Open Library。这三个接口都带了 `origin=*`，允许任意域名跨域调用，所以部署到任何域名都能用。页面的 CSP 也把 `connect-src` 限定在这三个域名上，等于给检索范围加了一道白名单。

**国内访问维基百科需要注意。** 页面本身能正常打开，但素材库检索中文维基这一路可能超时；Wikidata 和 Open Library 通常不受影响。

**首屏内容是内置示例项目。** 首次打开会加载 `app.js` 里 `sampleProject()` 生成的演示数据，项目名为「示例项目 · 双线时间轴」，包含一条现实基准线和一条分歧出来的架空线，覆盖时代、人物、事件、设定四种节点类型。它是纯虚构的占位内容，访客怎么改都只存在自己的浏览器里，不会影响其他人。想换成自己的示例，改 `sampleProject()` 和 `exampleText` 两处即可。

## 每次改版后如何重新发布

源码改动后重新生成并覆盖部署：

```powershell
cd source
npm.cmd run build:web
# GitHub Pages：git add . && git commit -m "更新" && git push
# Netlify / Vercel：重新执行对应 deploy 命令
```

`release/` 已经在 `.gitignore` 里，生成物不会被提交，由 CI 或本地命令重新产出，不需要手工维护两份代码。

## 验证清单

发布前建议过一遍：

```powershell
cd source
npm.cmd run serve:web
```

打开页面后确认：时间轴正常渲染、右上角「风格」能切换主题、新建节点后刷新页面内容还在、`Ctrl+O` 能导入 JSON、素材库检索返回结果、浏览器控制台没有红色报错。再缩到 600px 宽度看一眼移动端布局。
