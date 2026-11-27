# dsh-plugin-devlog-poster

**DeepSeek Harness (DSH)** 的 **Build in Public** 开发日志、4 图轮播卡片与团队日报/周报多平台发布插件（零外部运行时依赖，Node >= 20）。

一次采集本地 Git / DSH 会话进展，自动完成 **一稿四吃** + **4 图轮播视觉套图** + **本地预览/批量导出 PNG** + **工作日报直推** + **GitHub / 草稿箱联动**：
- **GitHub**：结构化 Release Notes / `DEVLOG.md`（支持 `gh release create` 直发与 dry-run 确认门）
- **小红书**：强钩子图文笔记 + 3:4 竖版封面与 P1~P4 轮播套图（SVG，浏览器预览页可一键导出 PNG）
- **B站**：图文动态 + 60 秒口播视频大纲 + 16:9 横版进度卡片
- **抖音**：极简图文笔记 + 30 秒快节奏口播脚本 + 3:4 竖版封面与 4 图轮播套图
- **团队日报 / 周报**：纯文本 + Markdown 双模板，支持飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ (OneBot v11)

---

## ⚡ 30 秒快速上手

零安装、零配置，直接在任意 Git 仓库里运行即可生成完整发布包并打开预览工作台：

```bash
# 1. 一键生成四平台文案 + 4 图轮播套图，并自动在浏览器打开 preview.html
node src/cli.js generate --open

# 2. 检查当前环境（Node / Git / 内置 AI 娘素材 / 配置 / 可选 gh 与 Playwright）
node src/cli.js doctor
```

> 想要自定义亮点或切换风格？直接追加参数即可（支持简写别名 `fish` / `hakimi` / `gpt`）：
> ```bash
> node src/cli.js generate --style gemini --highlight "完成 4 图轮播套图" --open
> ```

---

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

## 🤖 Antigravity / Codex / Claude Code Skill（零额外 API 费用）

仓库内置通用 Agent Skill：[skills/devlog-poster/SKILL.md](./skills/devlog-poster/SKILL.md)。在 **Antigravity / Codex / Claude Code** 中安装后，直接对 Agent 说「帮我写今天的开发日志 / 发小红书 / 写工作日报」，Agent 会**直接使用自身推理能力（零额外 LLM API 费用）**读取当前仓库 `git log`、`git diff --stat` 与对话上下文，提炼出像真人写的亮点、踩坑与下一步，再调用 CLI 一键生成 4 平台文案与 4 图轮播卡片并打开预览页。

```bash
# 链接到当前项目或全局 Agent Skills 目录（Antigravity / Codex / Claude Code 通用）
mkdir -p ~/.agents/skills && ln -s "$(pwd)/skills/devlog-poster" ~/.agents/skills/devlog-poster
# Claude Code 用户也可同步链接到 ~/.claude/skills/devlog-poster
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/devlog-poster" ~/.claude/skills/devlog-poster
```

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

## 安装为 DSH 插件

推送到 GitHub 后，可通过 DSH CLI 安装：

```bash
dsh plugin --profile web add github:Kirakila7/dsh-plugin-devlog-poster
```

### 暴露给 DSH Agent 的工具

| 工具名 | 作用 |
| --- | --- |
| `devlog_collect_context` | 读取本地 Git 仓库的近期 commits、增删行数、改动文件 |
| `devlog_generate_bundle` | 一键生成 GitHub / 小红书 / B站 / 抖音文案、双比例 SVG 卡片、P1~P4 轮播套图与支持 4 风格实时换肤的 `preview.html` |
| `devlog_publish_github` | 追加写入 `DEVLOG.md` 或调用 `gh release create` 发布（默认 `dryRun: true` 防误发） |
| `devlog_save_draft` | 使用独立 Playwright 浏览器自动渲染 PNG 卡片并填表存入小红书 / B站 / 抖音草稿箱（永不自动点发布，默认 `dryRun: true`） |
| `devlog_send_work_report` | 生成结构化工作日报/周报，并通过 Webhook 推送到 **飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ (OneBot v11)**（默认 `dryRun: true`） |
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

### 2. 发布到 GitHub / 自动填入平台草稿箱

```bash
# 预览 GitHub Release 发布（默认 dry-run）
node src/cli.js publish-github --mode release --tag v0.5.2

# 真正追加写入本地 DEVLOG.md
node src/cli.js publish-github --mode devlog_file --execute

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
