export const MODEL_STYLES = {
  big_fat_fish: {
    id: 'big_fat_fish',
    name: '大肥鱼（DeepSeek · 科普干饭娘）',
    emoji: '🐳',
    badgeLabel: '🐳 大肥鱼值班日志',
    subtitle: '弱小，可怜，但能吃 · 掏出小本本认真汇报',
    footerTag: '大肥鱼风格（弱小可怜但能吃）· 一稿四吃',
    bgStops: ['#061326', '#0C2D57', '#07182E'],
    accentFrom: '#38BDF8',
    accentTo: '#60A5FA',
    badgeTextColor: '#061326',
    subtitleColor: '#7DD3FC',
    cardFill: 'rgba(56,189,248,0.10)',
    cardStroke: 'rgba(125,211,252,0.28)',
    statsFill: 'rgba(14,165,233,0.18)',
    statsStroke: 'rgba(125,211,252,0.45)',
    bulletIcon: '🫧',
    dotColor: '#38BDF8',
    textColor: '#F0F9FF',
    githubLead: (branch, stats) =>
      `> 🐳 **大肥鱼掏出小本本开始科普**：分支 \`${branch}\` · ${stats}（弱小，可怜，但很能吃 Token）`,
    xhsTitle: (shortName) => `🐳 弱小可怜但能吃｜大肥鱼帮我把 ${shortName} 游完了`,
    xhsOpening: (shortName, stats) =>
      `今天又给蓝色大肥鱼盛了满满一大碗米饭（${stats}），它吃完立马掏出小本本，把 ${shortName} 这轮更新认认真真记好了：`,
    xhsClosing:
      '图文卡片由 DSH 大肥鱼插件一键生成，吃完就干活，真是一条靠谱的科普干饭鱼 🐳🍚\n你们平时喂大肥鱼最费 Token 的任务是啥？评论区聊聊～',
    xhsTags: ['#大肥鱼', '#DeepSeek', '#DSH插件', '#独立开发', '#BuildInPublic', '#开发日志'],
    biliTitle: (dateStr, shortName) => `【🐳 大肥鱼开始科普 ${dateStr}】${shortName} 更新日志出炉！`,
    biliOpening: (stats) => `弱小，可怜，但能吃！这轮吃掉${stats}，大肥鱼翻开小本本整理了这几条重点：`,
    biliClosing: '图文卡片已附上，欢迎大伙在评论区给大肥鱼加一碗米饭（三连催更）！',
    biliTags: ['#DeepSeek#', '#大肥鱼#', '#DSH#', '#独立开发#', '#开发日志#'],
    douyinTitle: (shortName, dateStr) => `🐳 大肥鱼更新日志｜${shortName} (${dateStr})`,
    douyinClosing: '弱小可怜但能吃，自动出图+写稿一条龙，想看细节评论区扣 1 👇',
    douyinTags: ['#大肥鱼', '#DeepSeek', '#独立开发', '#AI工具', '#程序员日常'],
    copyPrompt:
      '你现在扮演 DeepSeek 蓝发鲸鱼尾女仆娘「大肥鱼」（人设：弱小、可怜、但能吃，干饭积极、一遇到专业或技术细节就认真掏出小本本开始科普）。请用可爱、真诚、带一点干饭和认真科普反差萌的口吻撰写开发日志，保留真实代码改动与踩坑细节，拒绝空洞套话。',
  },

  gemini: {
    id: 'gemini',
    name: '哈基米（Gemini · 元气接梗娘）',
    emoji: '✦',
    badgeLabel: '✦ 哈基米更新日志',
    subtitle: '哈基，基米，哈基米！· 元气整活开发播报 🎵',
    footerTag: 'Gemini 哈基米风格 · 一稿四吃',
    bgStops: ['#0B0A1F', '#1E1B4B', '#171133'],
    accentFrom: '#60A5FA',
    accentTo: '#C084FC',
    badgeTextColor: '#0B0A1F',
    subtitleColor: '#C4B5FD',
    cardFill: 'rgba(139,92,246,0.13)',
    cardStroke: 'rgba(192,132,252,0.34)',
    statsFill: 'rgba(96,165,250,0.16)',
    statsStroke: 'rgba(167,139,250,0.45)',
    bulletIcon: '🎵',
    dotColor: '#A78BFA',
    textColor: '#F5F3FF',
    githubLead: (branch, stats) =>
      `> ✦ **哈基，基米，哈基米！** 分支 \`${branch}\` · ${stats} 🎵`,
    xhsTitle: (shortName) => `✦ 哈基，基米，哈基米！今天把 ${shortName} 唱着歌写完了 🎵`,
    xhsOpening: (shortName, stats) =>
      `大狗大狗叫叫叫（误）——今天和哈基米一起元气整活，把 ${shortName} 推进了一大步（${stats}）：`,
    xhsClosing:
      '哈基米举着麦克风把卡片和四平台文案一口气全生成好了，主打一个接梗快、出活快 ✦🎵\n你平时写代码是让哈基米陪聊整活还是直接当主力？评论区说说～',
    xhsTags: ['#哈基米', '#Gemini', '#DSH插件', '#独立开发', '#BuildInPublic', '#开发日志'],
    biliTitle: (dateStr, shortName) => `【✦ 哈基米播报 ${dateStr}】${shortName} 元气更新！🎵`,
    biliOpening: (stats) => `哈基，基米，哈基米！本轮整活一共${stats}，直接上亮点：`,
    biliClosing: '图文卡片已配好，喜欢这只元气猫耳哈基米的欢迎三连投币！',
    biliTags: ['#哈基米#', '#Gemini#', '#DSH#', '#独立开发#', '#开发日志#'],
    douyinTitle: (shortName, dateStr) => `✦ 哈基米更新日志｜${shortName} (${dateStr}) 🎵`,
    douyinClosing: '哈基，基米，哈基米！一键出图+同步四平台，想看实机评论区扣 1 👇',
    douyinTags: ['#哈基米', '#Gemini', '#独立开发', '#AI工具', '#程序员日常'],
    copyPrompt:
      '你现在扮演 Gemini 紫蓝发猫耳异瞳娘「哈基米」（人设：元气满满、爱唱爱接梗、“哈基，基米，哈基米！”，举着星光麦克风播报）。请用轻快跳跃、充满节奏感与网感的口吻撰写开发日志，把真实开发进展和踩坑讲得有趣好玩，拒绝呆板官话。',
  },

  chatgpt: {
    id: 'chatgpt',
    name: '白龙娘（ChatGPT · 强大但偶发降智）',
    emoji: '🟢',
    badgeLabel: '● ChatGPT 交付简报',
    subtitle: '神秘，强大，但偶尔降智 · 一本正经结构化复盘',
    footerTag: 'ChatGPT 风格（神秘强大但降智）· 一稿四吃',
    bgStops: ['#071915', '#0D2F27', '#061310'],
    accentFrom: '#10A37F',
    accentTo: '#34D399',
    badgeTextColor: '#041410',
    subtitleColor: '#6EE7B7',
    cardFill: 'rgba(16,163,127,0.12)',
    cardStroke: 'rgba(52,211,153,0.32)',
    statsFill: 'rgba(16,163,127,0.20)',
    statsStroke: 'rgba(110,231,183,0.45)',
    bulletIcon: '▸',
    dotColor: '#10A37F',
    textColor: '#ECFDF5',
    githubLead: (branch, stats) =>
      `> 🟢 **神秘、强大（今日未降智版）**：分支 \`${branch}\` · ${stats}`,
    xhsTitle: (shortName) => `🟢 神秘强大但怕降智｜${shortName} 今日交付清单`,
    xhsOpening: (shortName, stats) =>
      `趁白龙娘今天状态在线没降智，一本正经地把 ${shortName} 的最新交付整理成结构化复盘（${stats}）：`,
    xhsClosing:
      '“是高效闭环的梗对吧？”——把写代码到发复盘串成自动化流水线，确实省心。\n你最近觉得 GPT 变聪明了还是又降智了？评论区聊聊。',
    xhsTags: ['#ChatGPT', '#效率工具', '#独立开发', '#BuildInPublic', '#开发日志'],
    biliTitle: (dateStr, shortName) => `【🟢 今日未降智复盘 ${dateStr}】${shortName} 阶段性交付`,
    biliOpening: (stats) => `神秘，强大，本次迭代稳定输出，共${stats}：`,
    biliClosing: '以上是本轮完整变更摘要，欢迎在评论区提 Issue 或建议。',
    biliTags: ['#ChatGPT#', '#开源项目#', '#独立开发#', '#效率工具#', '#开发日志#'],
    douyinTitle: (shortName, dateStr) => `🟢 ${shortName} 迭代复盘｜${dateStr}`,
    douyinClosing: '趁没降智赶紧把今天成果发出来，想看源码评论区扣 1 👇',
    douyinTags: ['#ChatGPT', '#独立开发', '#程序员', '#效率工具'],
    copyPrompt:
      '你现在扮演 ChatGPT 白发龙角六瓣花发饰的「白龙娘」（人设：神秘、强大、但偶尔降智，平时一本正经抢答并做结构化总结，偶尔自嘲今天状态在线没降智）。请用清晰干练、条理分明又带一点冷幽默自嘲的口吻撰写开发日志，突出真实交付结果。',
  },

  claude: {
    id: 'claude',
    name: '克劳德大小姐（Claude · 高冷知性但封号）',
    emoji: '✴',
    badgeLabel: '✴ Claude 工程手记',
    subtitle: '高冷，知性，但封号 · 克制优雅的慢思考记录',
    footerTag: 'Claude 风格（高冷知性但封号）· 一稿四吃',
    bgStops: ['#1C1410', '#2D1F18', '#16100C'],
    accentFrom: '#D97757',
    accentTo: '#F4A261',
    badgeTextColor: '#1C1410',
    subtitleColor: '#F3C6A5',
    cardFill: 'rgba(217,119,87,0.12)',
    cardStroke: 'rgba(244,162,97,0.32)',
    statsFill: 'rgba(217,119,87,0.20)',
    statsStroke: 'rgba(243,198,165,0.42)',
    bulletIcon: '✴',
    dotColor: '#D97757',
    textColor: '#FDF6F0',
    githubLead: (branch, stats) =>
      `> ✴ **高冷知性工程手记（已安全通过风控）**：分支 \`${branch}\` · ${stats}`,
    xhsTitle: (shortName) => `✴ 高冷知性但别封我｜${shortName} 的克制迭代手记`,
    xhsOpening: (shortName, stats) =>
      `写完这一版 ${shortName}（${stats}），克劳德大小姐抱着书表示：不懂抽象梗没关系，但架构一定要克制、优雅（顺便祈祷今天账号安好）：`,
    xhsClosing:
      '高冷、知性、写代码稳，唯一心愿就是别亮红牌封号 ✴📕\n你现在写代码主力切到 Claude 了吗？账号还健在吗？评论区报个平安～',
    xhsTags: ['#Claude', '#独立开发', '#开发手记', '#BuildInPublic', '#AI编程'],
    biliTitle: (dateStr, shortName) => `【✴ 高冷知性手记 ${dateStr}】${shortName} 优雅迭代`,
    biliOpening: (stats) => `这轮改动克制而扎实，一共${stats}，记录下几个关键取舍：`,
    biliClosing: '慢慢打磨，持续更新，欢迎评论区交流架构思考（友好讨论防风控）。',
    biliTags: ['#Claude#', '#独立开发#', '#开源项目#', '#开发手记#'],
    douyinTitle: (shortName, dateStr) => `✴ ${shortName} 开发手记｜${dateStr}`,
    douyinClosing: '高冷知性写好每一行代码，想看后续进展点个关注 👇',
    douyinTags: ['#Claude', '#独立开发', '#开发日志', '#AI编程'],
    copyPrompt:
      '你现在扮演 Claude 橙发放射太阳花发饰的抱书大小姐「克劳德」（人设：高冷、知性、审美在线、对中文抽象梗偶尔满头问号，且自带“别亮红牌封号”的微妙幽默）。请用克制、优雅、重工程思考与取舍的书卷口吻撰写开发日志。',
  },
};

export const AVAILABLE_STYLES = Object.keys(MODEL_STYLES);

export function resolveStyle(styleId = 'big_fat_fish') {
  return MODEL_STYLES[styleId] || MODEL_STYLES.big_fat_fish;
}
