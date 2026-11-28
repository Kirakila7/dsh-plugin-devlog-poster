# dsh-plugin-devlog-poster

[![Version](https://img.shields.io/badge/release-v0.9.0-2563EB?style=flat-square)](https://github.com/Kirakila7/dsh-plugin-devlog-poster/releases)
[![Zero Dependencies](https://img.shields.io/badge/runtime_dependencies-0-10B981?style=flat-square)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-64748B?style=flat-square)](./LICENSE)
[![Ecosystems](https://img.shields.io/badge/ecosystems-DSH%20%7C%20Antigravity%20%7C%20Codex%20%7C%20Gemini%20CLI%20%7C%20Skills-7C3AED?style=flat-square)](#4-大生态一键安装dsh--agent-skills--antigravity--openai-codex)

> **English Quick Summary**: Zero-dependency Node.js (>=20) **Build-in-Public devlog, 4-slide visual card & multi-repo work-report engine** with **Dual Editions** — switch in one click between **💼 Office Executive Edition** (clean minimalist KPI work briefs for Slack/Feishu/DingTalk/LinkedIn, zero anime) and **✨ Community ACG Edition** (4 AI-girl comic 4-slide carousels for Xiaohongshu/Douyin/Bilibili/X/Reddit/Bluesky/Dev.to). Works at **zero extra LLM API cost** inside AI coding agents (`npx skills add Kirakila7/dsh-plugin-devlog-poster` or `npx -y github:Kirakila7/dsh-plugin-devlog-poster generate --edition office --open`). Already listed in **DSH Official Marketplace** & **Antigravity Awesome Skills**.

**DeepSeek Harness (DSH) / Antigravity / Codex / Gemini CLI** 通用的 **Build in Public** 开发日志、4 图轮播卡片与团队日报/周报多平台发布插件（零外部运行时依赖，Node >= 20）。

一次采集本地单仓 / 多仓 Git 进展，支持 **💼 办公专业版** 与 **✨ 社区二创版** 顶部一键切换，自动完成 **海内外 9 平台文案** + **4 图 1080×1440 视觉套图** + **本地预览 / Playwright 自动填草稿箱** + **6 通道工作日报直推**：
- **💼 办公专业版（`--edition office`）**：极简商务 4 图简报（KPI 仪表盘 + 今日交付 / 风险复盘 / 下一步行动项），零二次元零玩梗，直接发飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ / LinkedIn
- **✨ 社区二创版（`--edition community`）**：保留四大 AI 娘二次元文化（素材来源 **Zipzipipe**），以「工作日报图文」形式输出亮色漫画 4 图轮播，适配小红书 / 抖音 / B 站 / X
- **GitHub**：结构化 Release Notes / `DEVLOG.md`（支持 `gh release create` 直发与 dry-run 确认门）
- **小红书 / 抖音 / B 站**：强钩子图文 + 3:4 竖版 4 图轮播（支持本地 Playwright 自动渲染 1080×1440 PNG 并持久化登录自动填草稿箱，绝不自动点最终发布）+ B 站 16:9 横卡与口播脚本
- **海外开发者平台（Build in Public）**：原生英文适配 **X (Twitter)**（≤280 字符单推 + 3–4 条串推 Thread + 预填直发链接）、**Reddit**（真实不营销 Showoff 长帖 + 推荐版块 + 预填发帖链接）、**LinkedIn**（克制工程复盘帖）、**Bluesky**（≤300 字符 + ATProto 直发 / Intent 链接）与 **Dev.to**（含 YAML Frontmatter 的完整 Markdown + 官方 API 草稿直发）
- **团队日报 / 周报**：纯文本 + Markdown 双模板，支持飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ (OneBot v11)

| 维度 | 💼 办公专业版 (`--edition office`) | ✨ 社区二创版 (`--edition community`) |
| --- | --- | --- |
| **定位** | 团队日报 / 周报 / 站会汇报 | 二次元「工作日报图文」社区报 |
| **视觉风格** | 深蓝页眉 + 量化 KPI 卡片，零二次元零玩梗 | 四大 AI 娘封面 + 亮色漫画 4 图轮播 |
| **适用平台** | 飞书 / 钉钉 / 企微 / Slack / LinkedIn / GitHub | 小红书 / 抖音 / B 站 / X / Reddit / Dev.to |
| **一键切换** | `preview.html` 顶部胶囊按钮实时互切 | 同工作台实时互切 + 4 位 AI 娘换肤 |

---

## ⚡ 30 秒快速上手

零安装、零配置，直接在任意 Git 仓库里运行即可生成完整发布包并打开预览工作台：

```bash
# 1. 一键生成四平台文案 + 4 图轮播套图，并自动在浏览器打开 preview.html
node src/cli.js generate --open

# 2. 检查当前环境（Node / Git / 内置 AI 娘素材 / 配置 / 可选 gh 与 Playwright）
node src/cli.js doctor
```

> 想要切换到 **💼 办公专业版**（零二次元、极简商务工作日报）或切换 **✨ 社区二创版** 的 AI 娘画风（支持简写别名 `fish` / `hakimi` / `gpt`）：
> ```bash
> # 社区二创版（二次元工作日报图文，默认）
> node src/cli.js generate --edition community --style gemini --highlight "完成 4 图轮播套图" --open
>
> # 办公专业版（极简商务 4 图日报简报，零二次元零玩梗，适合直接发工作群）
> node src/cli.js generate --edition office --open
> ```

---

### 双版本模式（单仓双模式 · 工作台顶部一键切换）
- **✨ 社区二创版（`--edition community`，默认）**：保留二次元文化与四大 AI 娘画风，以**工作日报图文（社区报）**形式输出亮色漫画 4 图轮播，适配小红书 / 抖音 / B站 / X。
- **💼 办公专业版（`--edition office`，别名 `work` / `pro` / `办公`）**：零二次元、零玩梗，独立深蓝极简商务 4 图简报（KPI 仪表盘 + 今日交付 / 风险复盘 / 下一步行动项），直接适用于飞书 / 钉钉 / 企业微信 / Slack / LinkedIn 与团队汇报。

### 内置 4 套模型风格（文案 + 卡片配色与矢量徽章 + Q 版 AI 娘生图 Prompt 全链路联动）
- `big_fat_fish`（默认，别名 `fish`）：🐳 **大肥鱼（DeepSeek）** — 弱小、可怜、但能吃，认真掏小本本科普
- `gemini`（别名 `hakimi`）：✦ **哈基米（Gemini）** — 哈基，基米，哈基米！元气猫耳接梗播报
- `chatgpt`（别名 `gpt`）：🟢 **白龙娘（ChatGPT）** — 神秘、强大、但偶发降智，一本正经交付复盘
- `claude`：✴ **克劳德大小姐（Claude）** — 高冷、知性、抱书克制（附防风控祈祷）

| 🐳 大肥鱼（DeepSeek） | ✦ 哈基米（Gemini） |
| :---: | :---: |
| <img src="./assets/mascots/big_fat_fish.png" width="320" alt="大肥鱼更新日志"/> | <img src="./assets/mascots/gemini.png" width="320" alt="哈基米更新日志"/> |
| 🟢 白龙娘（ChatGPT） | ✴ 克劳德大小姐（Claude） |
| <img src="./assets/mascots/chatgpt.png" width="320" alt="白龙娘交付日志"/> | <img src="./assets/mascots/claude.png" width="320" alt="克劳德开发手记"/> |

> **素材来源致谢**：四大 AI 娘角色形象与二创灵感来源自 **Zipzipipe** 的 AI 娘形象。

---

## 📦 4 大生态一键安装（DSH / Agent Skills / Antigravity / OpenAI Codex）

同一份仓库开箱即用适配 4 大生态——在 Agent 会话内默认直接用 Agent 自身推理提炼日志（**零额外 LLM API 费用**），在终端里也支持零安装 `npx` 直跑：

| 生态 | 打包入口 | 安装 / 接入方式 |
| --- | --- | --- |
| **DSH (DeepSeek Harness)** | `package.json` (`dsh.bundle`) + `cordis.patch.yml` | `dsh plugin --profile web add github:Kirakila7/dsh-plugin-devlog-poster` |
| **通用 Agent Skills** (Claude Code / Cursor / Windsurf 等) | `skills/devlog-poster/SKILL.md` | `npx skills add Kirakila7/dsh-plugin-devlog-poster` |
| **Google Antigravity** | 根目录 `plugin.json` + `skills/devlog-poster/` | `agy plugin install https://github.com/Kirakila7/dsh-plugin-devlog-poster` |
| **OpenAI Codex** | `.codex-plugin/plugin.json` + `skills/devlog-poster/` | 克隆或挂载仓库为 Codex 插件目录，自动加载 `.codex-plugin/plugin.json` 与 `skills/devlog-poster` |

> **手动本地软链 / 零安装 CLI 兜底**：
> ```bash
> # 可选：在任意仓库零安装直跑 CLI
> npx -y github:Kirakila7/dsh-plugin-devlog-poster generate --open
>
> # 可选：本地开发时将 Skill 软链到全局 Agent 目录
> mkdir -p ~/.agents/skills && ln -s "$(pwd)/skills/devlog-poster" ~/.agents/skills/devlog-poster
> ```

安装完成后，直接对 Agent 说「帮我写今天的开发日志 / 发小红书 / 写工作日报」，Agent 会自动读取当前仓库 `git log`、`git diff --stat` 与对话上下文，提炼出像真人写的亮点、踩坑与下一步，再调用 CLI 一键生成 4 平台文案与 4 图轮播卡片并打开预览页。

---

## ✨ CLI `--ai` 自动摘要（独立终端直出）

不在 Agent 会话里、直接跑终端 CLI？加上 `--ai` 即可零依赖调用原生 `fetch` 读取 `git log --stat` 与代码 diff，按所选 AI 娘风格自动提炼 `title / highlights / pitfalls / nextSteps`：

- **自动探测顺序**：`DEEPSEEK_API_KEY` → `OPENAI_API_KEY` → `GEMINI_API_KEY` → `ANTHROPIC_API_KEY`（也支持 `custom_openai` 自定义兼容端点）
- **平滑兜底**：未配置 API Key 或请求失败时**绝不崩溃**，自动回退到 Git 提交记录并给出配置提示

```bash
# 自动探测环境变量中的 API Key 并生成（支持 --style 风格联动）
export DEEPSEEK_API_KEY=sk-xxx
node src/cli.js generate --ai --style big_fat_fish --open

# 指定 Provider / Model，或在日报/周报中启用 AI 摘要
node src/cli.js generate --ai --ai-provider gemini --ai-model gemini-2.0-flash --open
node src/cli.js send-report --ai --channel feishu --period daily

# 持久化 AI 配置（config show 自动脱敏 aiApiKey）
node src/cli.js config set aiProvider deepseek
node src/cli.js config set aiApiKey sk-xxx
```

---

## 🗂️ 多项目自动聚合（日报 / 周报 / 跨仓 Devlog）

一天同时推进多个仓库？无需手动切换目录，直接指定父目录或配置 `watchDirs` / `watchRepos`，插件会自动扫描活跃仓库（严格按 `--since` 时间窗口过滤，无提交的仓库自动跳过），并在日报/周报与 GitHub 更新日志中按 `[项目名]` 自动分组汇总：

```bash
# 1. 临时扫描父目录下的所有活跃仓库（默认深度 2，自动跳过 node_modules / dist 等目录）
node src/cli.js generate --scan-dir ~/workspace --since "24 hours ago" --open
node src/cli.js send-report --scan-dir ~/workspace --period daily

# 2. 显式指定多个仓库路径（支持逗号分隔或重复传参）
node src/cli.js send-report --repos ~/workspace/app-a,~/workspace/app-b --period weekly

# 3. 持久化常用工作区，后续一条 --all-watched 搞定每日多项目汇总
node src/cli.js config set watchDirs ~/workspace
node src/cli.js generate --all-watched --open
node src/cli.js send-report --all-watched --period daily
```

> 默认不传多仓库参数时，100% 保持单仓库行为不变；也可通过 `--max-depth <n>` 控制目录扫描深度。

---

## 安装为 DSH 插件

推送到 GitHub 后，可通过 DSH CLI 安装：

```bash
dsh plugin --profile web add github:Kirakila7/dsh-plugin-devlog-poster
```

### 暴露给 DSH Agent 的工具

| 工具名 | 作用 |
| --- | --- |
| `devlog_collect_context` | 读取本地 Git 仓库的近期 commits、增删行数、改动文件（支持 `scanDirs` / `repos` 多仓自动聚合） |
| `devlog_generate_bundle` | 一键生成 GitHub / 小红书 / B站 / 抖音文案、双比例 SVG 卡片、P1~P4 轮播套图与支持 4 风格实时换肤的 `preview.html`（支持 `scanDirs` / `repos` 多仓聚合） |
| `devlog_publish_github` | 追加写入 `DEVLOG.md` 或调用 `gh release create` 发布（默认 `dryRun: true` 防误发） |
| `devlog_save_draft` | 使用独立 Playwright 浏览器自动渲染 PNG 卡片并填表存入小红书 / B站 / 抖音草稿箱（永不自动点发布，默认 `dryRun: true`） |
| `devlog_send_work_report` | 生成结构化工作日报/周报（支持 `scanDirs` / `repos` 按项目分组汇总），并通过 Webhook 推送到 **飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ (OneBot v11)**（默认 `dryRun: true`） |
| `devlog_generate_image` | 图文版专用：按平台（小红书 3:4 / B站 16:9 / 抖音 3:4 / GitHub 16:9）与模型风格生成生图提示词模板，并可绑定 **OpenAI / Gemini Imagen / 火山引擎 Seedream / OpenAI 兼容端点** 出图（默认 `dryRun: true`） |

---

## CLI 完整用法（零外部依赖，Node >= 20）

### 1. 生成 Devlog 发布包与 4 图轮播卡片

```bash
# 生成四平台 Devlog 发布包 + 4 图轮播卡片 + 自动打开浏览器预览页
node src/cli.js generate \
  --name "Nekofans" \
  --style big_fat_fish \
  --highlight "完成 3D 会客厅双向社交轮盘评审" \
  --highlight "搭建 DSH 四平台开发日志发布器" \
  --pitfall "动态上下文槽在鼠标偏移时极易误触，改用固定方位" \
  --next "接入发布后点赞/评论数据回流" \
  --open

# 输出机器可读 JSON（适合脚本/CI 集成）
node src/cli.js generate --json
```

### 2. 发布到 GitHub / 海外平台 / 自动填入平台草稿箱

```bash
# 预览 GitHub Release 发布（默认 dry-run）
node src/cli.js publish-github --mode release --tag v0.5.2

# 真正追加写入本地 DEVLOG.md
node src/cli.js publish-github --mode devlog_file --execute

# 海外平台发布（默认 dry-run；省略 --bundle 自动选取 out/ 下最新 bundle）
# X / Reddit / LinkedIn 零 API Key，返回预填 Intent URL 与即发正文
node src/cli.js publish-global --platform x
node src/cli.js publish-global --platform reddit
node src/cli.js publish-global --platform linkedin

# Dev.to 官方 API（默认创建 published: false 草稿，加 --published 才公开）
export DEVTO_API_KEY=your_devto_api_key
node src/cli.js publish-global --platform devto
node src/cli.js publish-global --platform devto --execute

# Bluesky（支持零 Key intentUrl，或配置 BLUESKY_HANDLE + BLUESKY_APP_PASSWORD 走官方 ATProto 直发）
node src/cli.js publish-global --platform bluesky
node src/cli.js publish-global --platform bluesky --execute

# 预览独立浏览器存草稿计划（省略 --bundle 会自动选取 out/ 下最新 bundle）
node src/cli.js save-draft --platform xiaohongshu

# 真正执行自动填表存草稿（需先安装可选依赖：npm install playwright && npx playwright install chromium）
node src/cli.js save-draft --platform xiaohongshu --execute
```

### 3. 工作日报 / 周报与图文版生图

```bash
# 预览或推送工作日报 / 周报（支持 feishu / dingtalk / wecom / slack / discord / qq_onebot）
node src/cli.js send-report --channel feishu --endpoint https://open.feishu.cn/open-apis/bot/v2/hook/xxx --period daily
node src/cli.js send-report --channel qq_onebot --endpoint http://127.0.0.1:3000 --group-id 123456 --period daily --execute

# 按平台与风格生成生图提示词，或直接调用绑定的生图模型出图
node src/cli.js generate-image --platform xiaohongshu --style big_fat_fish --provider openai
node src/cli.js generate-image --platform bilibili --style gemini --provider volcengine --output cover.png --execute
```

### 4. 配置管理与环境体检

```bash
# 查看已生效配置（自动脱敏 token/apiKey）及全局/项目级配置文件路径
node src/cli.js config show

# 写入全局默认配置或当前仓库本地配置（.devlog-poster.json）
node src/cli.js config set defaultStyle gemini
node src/cli.js config set reportEndpoint https://open.feishu.cn/open-apis/bot/v2/hook/xxx --local

# 重置配置为默认值
node src/cli.js config reset --local

# 一键环境体检（支持 --json）
node src/cli.js doctor
```

### 运行测试

```bash
node --test test/*.test.js
```

---

## 版本演进与 Roadmap
- **v0.1 ~ v0.5（已完成）**：
  - DSH Cordis 插件 6 工具注册 + Git 上下文采集 + 四平台文案（大肥鱼 / 哈基米 / 白龙娘 / 克劳德大小姐 4 套风格联动）
  - 3:4 & 16:9 双比例卡片 + 小红书/抖音 P1~P4 轮播套图 + `preview.html` 创作者工作台（实时换肤 / 复制 / 导出 PNG）
  - 工作日报 / 周报（飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ OneBot v11）
  - 多模型生图 Prompt 与 Provider 接入（OpenAI / Gemini Imagen / Volcengine Seedream / 自定义端点）
  - 独立 Playwright 浏览器自动填表存草稿（永不自动发布）+ 全局/本地持久化配置 + `doctor` 环境诊断 + `--open` 一键开预览
- **后续计划**：
  - 发布后点赞 / 评论 / 收藏数据回流看板（Build-in-Public 激励闭环）
  - 多仓库联合周报汇总与自定义风格模板插件化
