# s1oop Cloudflare Blog

> 基于 **Astro 6 静态外壳 ＋ Cloudflare Pages Functions ＋ Cloudflare D1 边缘无服务器数据库** 的沉浸式人文阅读与极简内容发布系统。  
> **An edge-native, editorial archive engineered for quiet long-form reading, zero layout shift, and serverless edge storage.**

[![Live Demo](https://img.shields.io/badge/Demo-s1oop.bbroot.com-0f766e?style=flat-square&logo=cloudflare&logoColor=white)](https://s1oop.bbroot.com)
[![Built with Astro](https://img.shields.io/badge/Built%20with-Astro%206-ff5d01?style=flat-square&logo=astro&logoColor=white)](https://astro.build/)
[![Deployed on Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Database Cloudflare D1](https://img.shields.io/badge/Storage-Cloudflare%20D1-1f6feb?style=flat-square&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](LICENSE)

---

## 📖 设计哲学：什么是 "quiet archive"？

大多数现代博客系统往往陷入两个极端：
- **过于笨重**：依赖 Node.js/PHP 常驻进程、中心化 MySQL 与庞大 CMS 后台，运维与冷启动成本高昂；
- **纯静态不可动态交互**：每次写文章都必须提交代码并重新触发全站 CI/CD 构建，无法实现即写即发的后台管理。

**`s1oop-cloudflare-blog`** 探索了一条**兼具静态极速与边缘动态发布的第三条路径**：
1. **静态外壳 ＋ 边缘查询**：公共页面为 Astro 编译的静态纯 HTML 外壳，动态正文与检索由 Cloudflare D1 全球边缘 SQLite 提供纳秒级直出；
2. **私有化一键发布工作流**：内置 `/s1oop/admin` 专属发布流，支持 Markdown 上传即时编译、配图内联预检与孤儿资产自动回收；
3. **零外部存储依赖（免 R2）**：将文章配图作为 BLOB 直接存储在 D1 `blog_assets` 表中，实现“文章与配图原子发布”，无需额外配置 R2 存储桶；
4. **沉静排印质感**：精选多衬线字族与 Zero-CLS 骨架流，专注沉浸式长期阅读。

---

## ⚡ 核心架构决策与权衡 (Key Engineering Decisions)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                 系统数据与运行时流向全景                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   [ Astro 6 静态外壳 ] ────► 编译生成静态 UI 壳 (dist/) ────► [ Cloudflare Pages CDN ]   │
│                                                                        │                 │
│                                (浏览器访问 / API 路由)                 ▼                 │
│                                                                 [ 全球终端用户 ]         │
│                                                                        │                 │
│                                                                        ▼                 │
│   [ 私有后台 /s1oop/admin ] ──► (POST Markdown + 图片) ──► [ Pages Functions /api/* ]    │
│                                                                        │                 │
│                                  (原子写入文章与 BLOB 资产)            ▼                 │
│                                                           [ Cloudflare D1 边缘 SQLite ]  │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 01. In-D1 资产原子存储架构（为什么不用 R2？）
* **背景与决策**：传统博客往往将文本存入数据库，图片上传至对象存储（如 AWS S3 / Cloudflare R2）。这引入了跨服务认证、冷启动延迟以及“文章删除了但图片残留”的分布式一致性问题。
* **实现**：设计 `blog_assets` 表，将博客轻量配图直接以二进制形式（BLOB/Base64）存入 D1 数据库。
* **收益**：
  - **原子事务发布**：文章与关联图片在一次 D1 事务中完成写入或删除；
  - **零额外开销**：完全免除 R2 存储桶的鉴权与计费绑定，部署极度纯粹。

### 02. 混合渲染管线：Astro 静态外壳 ＋ 边缘 API 直出
* **决策**：
  - 首页、专栏、关于与更新记录页以 Astro 预编译为静态 HTML，享受 CDN 全球 100% 缓存命中；
  - 正文阅读器使用 `/blog/live?slug=...` 客户端单页路由，通过 Pages Functions 代理至 `workers/api.js` 直连 D1。
* **收益**：发布新文章时**无需重新触发全站数十秒的 CI/CD 构建**，后台点击发布即刻全球可见。

### 03. Zero-CLS 骨架流体验 (Zero Cumulative Layout Shift)
* **决策**：在首页文章流与专栏数据异步拉取阶段，采用原生 CSS 严格计算高度的 **Zero-CLS 骨架屏（Skeleton Stream Placeholder）**。
* **收益**：彻底消除动态文章流载入时造成的布局跳动与视口抖动，Core Web Vitals 稳定性达到 100%。

### 04. 杂志级多衬线排印系统 (Editorial Serif Typography)
* **决策**：精选西文 `Newsreader`（舒适长文阅读）＋ `Cormorant Garamond`（古典标题）与中文 `Noto Serif SC（思源宋体）`，配合严格的字距、行高比与灰度阶梯微调。
* **收益**：彻底告别无衬线黑体的冰冷感，营造典雅、温润的书卷气。

### 05. 极简轻量无运行时交互 (Vanilla JS Micro-Scripts)
* **决策**：全站交互拒绝引入庞大的客户端 SPA 框架，仅由 `home-feed.js` 与 `panel-pointer.js` 等纯原生微脚本驱动。
* **收益**：打包体积微乎其微，运行时 0 内存泄漏与阻塞，极速秒开。

---

## 📂 目录结构全景 (Project Structure)

```text
s1oop-cloudflare-blog/
├── functions/api/[[path]].js  # Cloudflare Pages Functions 边缘路由入口
├── workers/api.js             # D1 数据库交互、Markdown 解析与鉴权核心逻辑
├── migrations/                # D1 数据库 SQL 迁移文件
│   ├── 0001_runtime_posts.sql            # 核心文章表结构
│   ├── 0002_blog_assets.sql              # In-D1 图片资产存储表
│   ├── 0003_site_settings.sql            # 全局站点运行配置
│   ├── 0004_runtime_post_search_text.sql # 全文检索索引字段
│   └── 0005_blog_comments.sql            # 评论与审核表结构
├── public/                    # 静态资产与 Favicon 图标集
├── src/
│   ├── components/            # 页面导航、页脚与骨架屏组件
│   ├── layouts/               # 杂志级基础排版骨架 (BaseLayout.astro)
│   ├── pages/                 # Astro 静态路由 (/blog, /collections, /search, /s1oop)
│   └── scripts/               # 原生轻量交互脚本 (home-feed.js / panel-pointer.js)
├── astro.config.mjs           # Astro 6 编译构建配置
├── tailwind.config.cjs        # 衬线字体族与排版样式配置
└── wrangler.jsonc             # Cloudflare D1 绑定与部署定义
```

---

## 🔌 API 接口规范 (API Contract)

### 🌐 公开接口 (Public Endpoints)

| 方法 | 路由 | 描述 |
| :--- | :--- | :--- |
| `GET` | `/api/posts` | 获取已发布的文章列表（支持归档、专栏过滤与分页） |
| `GET` | `/api/posts/:slug` | 获取指定 slug 的正文 HTML 与元数据（供阅读器渲染） |
| `GET` | `/api/assets/*` | 读取 D1 中存储的二进制图片资产 |
| `GET` | `/api/comments` | 获取公开评论列表（受后台全局开关控制） |
| `POST` | `/api/comments` | 提交一条新的读者评论 |

### 🔒 管理后台私有接口 (Admin Endpoints - 需 ADMIN_PASSWORD 鉴权)

| 方法 | 路由 | 描述 |
| :--- | :--- | :--- |
| `POST` | `/api/admin/check` | 验证管理后台访问凭据 |
| `GET` | `/api/admin/posts` | 管理后台获取全量文章列表（含草稿） |
| `POST` | `/api/admin/posts` | 上传 Markdown 文件及关联配图，自动编译写入 D1 |
| `DELETE` | `/api/admin/posts/:slug` | 物理级联删除文章及其专属图片资产 |
| `GET` | `/api/admin/assets/orphans` | 统计未被任何文章引用的孤儿图片资产 |
| `DELETE` | `/api/admin/assets/orphans` | 批量清理并回收孤儿图片资产占用的 D1 空间 |
| `PATCH` | `/api/admin/settings` | 动态切换全站评论开关等运行时配置 |

---

## 🚀 快速上手与部署 (Quick Start & Deployment)

### 1. 本地开发

```bash
# 克隆仓库
git clone https://github.com/s1oopX/s1oop-cloudflare-blog.git
cd s1oop-cloudflare-blog

# 安装依赖
npm install

# 复制环境变量配置
cp .dev.vars.example .dev.vars

# 启动本地开发服务 (同时启动 Astro 与 API 代理)
npm run dev
```

浏览器打开 `http://127.0.0.1:4322` 即可预览。

---

### 2. 生产环境部署（Cloudflare Pages ＋ D1）

#### 步骤一：创建并初始化 Cloudflare D1 数据库

```bash
# 创建 D1 数据库实例
npx wrangler d1 create s1oop-blog-content

# 按序执行数据库迁移脚本
npx wrangler d1 execute s1oop-blog-content --file migrations/0001_runtime_posts.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0002_blog_assets.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0003_site_settings.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0004_runtime_post_search_text.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0005_blog_comments.sql
```

#### 步骤二：绑定 Cloudflare Pages 并上线

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 进入 **Workers & Pages** ➔ **Create application** ➔ **Pages**；
2. 连接个人 GitHub 仓库 `s1oop-cloudflare-blog`；
3. 构建配置参数：
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js version**: `22`
4. 进入 Pages 项目的 **Settings** ➔ **Functions** ➔ **D1 database bindings**：
   - **Variable name**: `BLOG_DB`
   - **D1 database**: 选择刚才创建的 `s1oop-blog-content`
5. 在 **Environment variables** 中添加：
   - `ADMIN_PASSWORD`: 你的私有管理后台密码
6. 触发重新部署，1 分钟内即可全球上线！

---

## 🎯 设计边界与非目标 (Non-Goals)

为了捍卫系统轻量、专注阅读的初衷，本项目明确声明以下设计边界：
- ❌ **不做大体积富文本编辑器**：坚持本地 Markdown 离线写作与原生文件上传，拒绝在线复杂排版带来的 HTML 脏代码；
- ❌ **不引入重型中心化数据库**：不依赖远程 MySQL/PostgreSQL，所有数据存放在 Serverless 边缘 SQLite（D1）中；
- ❌ **不做复杂多用户角色**：专为个人独立创作者打造，单管理员密码鉴权，杜绝庞大的权限中台开销。

---

## 📄 开源许可证 (License)

本项目采用 [MIT License](LICENSE) 开源。欢迎自由 Fork 并搭建属于你的云原生沉浸式阅读空间。
