---
name: devlog-poster
description: >
  Generate Build-in-Public devlogs, 4-slide Xiaohongshu/Douyin/Bilibili/GitHub carousel packs,
  and daily/weekly team work reports (Feishu, DingTalk, WeCom, Slack, Discord, QQ) from the
  current git repository and conversation context using your own agent reasoning at zero extra
  LLM API cost. Use when the user asks to write or publish a devlog, build-in-public post,
  social update, release note, or daily/weekly work report (写开发日志 / 发小红书 / 发B站 /
  抖音图文 / 工作日报 / 周报 / 总结今天的代码改动 / Build in Public).
---

# devlog-poster — Universal Build-in-Public & Work Report Skill

Works natively in **Antigravity**, **Codex**, and **Claude Code** using your own reasoning (**zero extra LLM API cost** — no external API key required).

## Core Principle

You (the coding agent) already hold the full conversation context and can inspect local git history directly. **Do NOT ask the user to configure an external LLM API key when running inside an agent session.** Instead, distill authentic, human-sounding devlog bullets yourself and pass them directly to the `devlog-poster` CLI to render multi-platform copy, 3:4 & 16:9 SVG cards, P1–P4 carousel slides, and the interactive `preview.html` creator workbench.

---

## Step-by-Step Workflow

### Step 1: Collect Real Context from the Repo & Session

Run read-only git inspection in the target workspace (do not mutate the repo):

```bash
git status -sb
git log -n 10 --stat --date=short --pretty=format:"%h %ad %s"
git diff --stat
```

Combine:
1. Recent commits, diff stats, and key changed files from git.
2. What you and the user actually debugged, debated, or shipped in the current conversation.

### Step 2: Distill Human-Sounding Devlog Points (Zero Extra API Cost)

Using your own reasoning, synthesize concrete, honest bullets grounded strictly in the observed code changes (never invent commits, numbers, or features):

- **`highlights` (3–5 items)**: Concrete shipped features, UX wins, or architecture improvements explained clearly for humans (avoid raw commit-hash dumps).
- **`pitfalls` (1–3 items)**: Real bugs, edge cases, or design trade-offs hit along the way — authentic debugging stories make Build-in-Public posts resonate.
- **`nextSteps` (1–3 items)**: Crisp, actionable next milestones.
- **Optional `title`**: A punchy devlog title matching the chosen AI-girl persona.

Choose the persona style requested by the user (or default to `big_fat_fish`).

### Step 3: Invoke the CLI to Generate the Bundle & Open Preview

Resolve the CLI in portable order — globally linked/installed `devlog-poster`, then local repo `node ./src/cli.js`, then zero-install `npx -y github:Kirakila7/dsh-plugin-devlog-poster`:

```bash
if command -v devlog-poster >/dev/null 2>&1; then
  DEVLOG_CMD=(devlog-poster)
elif [ -f ./src/cli.js ] && [ -f ./skills/devlog-poster/SKILL.md ]; then
  DEVLOG_CMD=(node ./src/cli.js)
else
  DEVLOG_CMD=(npx -y github:Kirakila7/dsh-plugin-devlog-poster)
fi
```

Run `generate --open` with your distilled bullets:

```bash
"${DEVLOG_CMD[@]}" generate \
  --open \
  --style big_fat_fish \
  --highlight "完成 4 图轮播套图与一键批量导出 PNG 工作台" \
  --highlight "支持大肥鱼/哈基米/白龙娘/克劳德 4 套风格实时换肤" \
  --highlight "新增 --ai 自动摘要与多 Agent Skill 零成本接入" \
  --pitfall "浏览器预览里多张 SVG 共用 defs ID 会互相污染，改为独立命名空间" \
  --next "接入发布后点赞与评论数据回流统计"
```

Useful optional flags:
- `--repo <path>`: target repository path (defaults to current working directory)
- `--scan-dir <path>`: scan a parent directory for active git repos in `--since` (repeatable or comma-separated)
- `--repos <paths>`: explicitly aggregate multiple git repo paths (repeatable or comma-separated)
- `--all-watched`: aggregate all repos configured via `watchDirs` / `watchRepos`
- `--max-depth <n>`: max scan depth for `--scan-dir` / `--all-watched` (default `2`)
- `--name <project>`: override display project name
- `--title <text>`: override devlog title
- `--since <window>`: git log window (default `"24 hours ago"`, e.g. `"7 days ago"` for weekly wrap-ups)
- `--out <dir>`: output directory (default `out`)
- `--json`: emit machine-readable JSON paths

For multi-project daily/weekly summaries, configure watched folders once or pass `--scan-dir`:

```bash
# Save watched parent directories once
"${DEVLOG_CMD[@]}" config set watchDirs ~/workspace

# Auto-aggregate all active repos today (excludes repos with no commits in --since)
"${DEVLOG_CMD[@]}" generate --all-watched --open
"${DEVLOG_CMD[@]}" send-report --scan-dir ~/workspace --period daily
```

After generating, report the bundle path, `preview.html` path, and a concise summary of the generated platforms:
- **Domestic & GitHub**: GitHub, Xiaohongshu, Bilibili, Douyin, Daily Work Report, and P1–P4 carousel slides.
- **Global Overseas Platforms (`🌍 海外平台` tab)**: **X (Twitter)** (<=280 single post + 3–4 tweet thread + intent URL), **Bluesky** (<=300 post + intent URL), **Reddit** (authentic show-off Markdown + subreddit suggestions + submit URL), **LinkedIn** (engineering reflection post), and **Dev.to** (complete Markdown with YAML frontmatter).

### Step 4: Optional Follow-Up Actions (Respect `dryRun` Safety!)

All publishing, draft-filling, and webhook-sending commands **default to safe dry-run mode**. Always preview first without `--execute`, show the preview plan to the user, and **only add `--execute` after explicit user confirmation**.

1. **Publish to GitHub (`DEVLOG.md` or GitHub Release)**:
   ```bash
   # Preview first (safe dry-run)
   "${DEVLOG_CMD[@]}" publish-github --mode devlog_file
   "${DEVLOG_CMD[@]}" publish-github --mode release --tag v0.6.0

   # Execute ONLY after user confirms
   "${DEVLOG_CMD[@]}" publish-github --mode devlog_file --execute
   ```

2. **Publish to Overseas Global Platforms (`X` / `Reddit` / `LinkedIn` / `Bluesky` / `Dev.to`)**:
   - Auto-discovers the latest bundle in `out/` when `--bundle` is omitted.
   - `x`, `reddit`, `linkedin` work with **zero API keys** via prefilled web intent URLs (`intentUrl` / `submitUrl`) + ready-to-post copy.
   - `devto` calls the official Dev.to API (`DEVTO_API_KEY` / `config set devtoApiKey`, defaults to `published: false` draft unless `--published` is passed).
   - `bluesky` supports zero-key `intentUrl` or ATProto API (`BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD`).
   ```bash
   # Preview first (safe dry-run, masked credentials)
   "${DEVLOG_CMD[@]}" publish-global --platform x
   "${DEVLOG_CMD[@]}" publish-global --platform reddit
   "${DEVLOG_CMD[@]}" publish-global --platform linkedin
   "${DEVLOG_CMD[@]}" publish-global --platform bluesky
   "${DEVLOG_CMD[@]}" publish-global --platform devto

   # Execute ONLY after user confirms (e.g. create Dev.to draft or post to Bluesky via ATProto)
   "${DEVLOG_CMD[@]}" publish-global --platform devto --execute
   "${DEVLOG_CMD[@]}" publish-global --platform bluesky --execute
   ```

3. **Fill Social Platform Draft Box (Xiaohongshu / Bilibili / Douyin)**:
   - Safety guarantee: opens an isolated Playwright browser, fills title/body/card image, and attempts to save as draft — **never auto-clicks Publish**.
   ```bash
   # Preview draft plan first (auto-selects latest bundle in out/)
   "${DEVLOG_CMD[@]}" save-draft --platform xiaohongshu

   # Execute ONLY after user confirms (requires optional playwright + chromium)
   "${DEVLOG_CMD[@]}" save-draft --platform xiaohongshu --execute
   ```

4. **Send Daily / Weekly Work Report (Feishu / DingTalk / WeCom / Slack / Discord / QQ OneBot v11)**:
   ```bash
   # Preview payload first (safe dry-run)
   "${DEVLOG_CMD[@]}" send-report --channel feishu --period daily \
     --highlight "..." --pitfall "..." --next "..."

   # Execute ONLY after user confirms
   "${DEVLOG_CMD[@]}" send-report --channel feishu --period daily --execute
   ```

5. **Environment Diagnostics**:
   ```bash
   "${DEVLOG_CMD[@]}" doctor
   ```

---

## Built-in 4 AI-Girl Styles

Pass any canonical ID or alias to `--style`:

| Style ID | Aliases | Character & Persona | Best Vibe |
| --- | --- | --- | --- |
| `big_fat_fish` (default) | `fish`, `deepseek`, `ds` | 🐳 **大肥鱼（DeepSeek · 科普干饭娘）** — 弱小、可怜、但能吃，认真掏小本本科普 | 亲切真诚、技术细节扎实带点反差萌 |
| `gemini` | `hakimi`, `gem`, `google` | ✦ **哈基米（Gemini · 元气接梗娘）** — 哈基，基米，哈基米！元气猫耳接梗播报 | 轻快跳跃、网感强、适合小红书/抖音 |
| `chatgpt` | `gpt`, `openai`, `dragon` | 🟢 **白龙娘（ChatGPT · 强大但偶发降智）** — 神秘、强大、但偶尔降智，一本正经交付复盘 | 结构化清晰、干练带冷幽默自嘲 |
| `claude` | `anthropic`, `cl` | ✴ **克劳德大小姐（Claude · 高冷知性但封号）** — 高冷、知性、抱书克制（附防风控祈祷） | 优雅克制、重架构取舍与工程思考 |

> **Credit / 素材致谢**：The 4 built-in chibi AI-girl characters and visual inspirations are credited to **Zipzipipe**. Always preserve Zipzipipe attribution when referencing or sharing generated covers.

---

## Standalone Terminal Fallback (`--ai`)

When a user runs `devlog-poster` directly in a terminal outside an AI coding agent, they can pass `--ai` to auto-summarize git log & diff via `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY` (with automatic graceful fallback to git commits when no key is set). Inside Antigravity / Codex / Claude Code, prefer Step 2 above so the summary costs zero extra API tokens.
