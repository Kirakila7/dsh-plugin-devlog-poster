# dsh-plugin-devlog-poster

**DeepSeek Harness (DSH)** 的 **Build in Public** 开发日志生成与多平台发布插件（v1 最小闭环）。

一次采集本地 Git / DSH 会话进展，自动完成 **一稿四吃** + **视觉卡片生成** + **本地预览/导出** + **GitHub 直发**：
- **GitHub**：结构化 Release Notes / `DEVLOG.md`（支持 `gh release create` 直发与 dry-run 确认门）
- **小红书**：强钩子图文笔记 + 3:4 竖版封面卡片（SVG，浏览器预览页可一键导出 PNG）
- **B站**：图文动态 + 60 秒口播视频大纲 + 16:9 横版进度卡片
- **抖音**：极简图文笔记 + 30 秒快节奏口播脚本 + 3:4 竖版封面卡片

### 内置 4 套模型风格（文案 + 卡片配色与矢量徽章联动）
- `big_fat_fish`（默认）：🐳 蓝色大肥鱼（DeepSeek / DSH 社区风）
- `gemini`：✦ Gemini 星云风
- `chatgpt`：🟢 ChatGPT 极简效率风
- `claude`：✴ Claude 暖陶土书卷风

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
| `devlog_generate_bundle` | 一键生成 GitHub / 小红书 / B站 / 抖音文案、双比例 SVG 卡片与支持 4 风格实时换肤的 `preview.html` |
| `devlog_publish_github` | 追加写入 `DEVLOG.md` 或调用 `gh release create` 发布（默认 `dryRun: true` 防误发） |
| `devlog_save_draft` | 使用独立 Playwright 浏览器自动渲染 PNG 卡片并填表存入小红书 / B站 / 抖音草稿箱（永不自动点发布，默认 `dryRun: true`） |

---

## 本地独立运行（零外部依赖，Node >= 20）

```bash
# 生成四平台 Devlog 发布包 + 卡片 + 浏览器预览页
node src/cli.js generate \
  --name "Nekofans" \
  --highlight "完成 3D 会客厅双向社交轮盘评审" \
  --highlight "搭建 DSH 四平台开发日志发布器 v1" \
  --pitfall "动态上下文槽在鼠标偏移时极易误触，改用固定方位" \
  --next "v2 接入小红书 / B站 / 抖音浏览器自动存草稿"

# 预览 GitHub 发布（默认 dry-run）
node src/cli.js publish-github --mode release --tag v0.1.0

# 真正写入本地 DEVLOG.md
node src/cli.js publish-github --mode devlog_file --execute
```

# 预览 v2 独立浏览器存草稿计划（小红书 / B站 / 抖音）
node src/cli.js save-draft --platform xiaohongshu --bundle out/<你的目录>

# 真正执行自动填表存草稿（需先安装可选依赖：npm install playwright && npx playwright install chromium）
node src/cli.js save-draft --platform xiaohongshu --bundle out/<你的目录> --execute

运行测试：

```bash
node --test test/*.test.js
```

---

## Roadmap
- **v1（已完成）**：DSH Cordis 插件注册 + Git 上下文采集 + 四平台文案 + 双比例 SVG 卡片 + `preview.html` 一键复制/导出 PNG + GitHub 直发
- **v2（计划）**：独立浏览器实例自动填表并存入小红书 / B站 / 抖音草稿箱（不抢主桌面鼠标）+ 发布后点赞/评论数据回流（激励闭环）
