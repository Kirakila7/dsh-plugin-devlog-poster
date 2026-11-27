import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { resolveStyle } from './styles.js';

export const SUPPORTED_AI_PROVIDERS = [
  'auto',
  'deepseek',
  'openai',
  'gemini',
  'anthropic',
  'custom_openai',
];

export const AUTO_DETECT_ORDER = ['deepseek', 'openai', 'gemini', 'anthropic'];

export const AI_PROVIDER_DEFAULTS = {
  deepseek: {
    envVar: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  gemini: {
    envVar: 'GEMINI_API_KEY',
    model: 'gemini-2.0-flash',
    endpoint:
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  },
  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    model: 'claude-3-5-haiku-latest',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  custom_openai: {
    envVar: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
};

function runGit(repoPath, args, maxBuffer = 4 * 1024 * 1024) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      maxBuffer,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function truncateCleanly(text, maxChars) {
  if (!text || text.length <= maxChars) {
    return { text: text || '', truncated: false };
  }
  const suffix = '\n... [truncated]';
  const budget = Math.max(0, maxChars - suffix.length);
  return {
    text: text.slice(0, budget).trimEnd() + suffix,
    truncated: true,
  };
}

function inferProviderFromEndpoint(endpoint = '') {
  const lower = String(endpoint || '').toLowerCase();
  if (!lower) return null;
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('anthropic')) return 'anthropic';
  if (lower.includes('generativelanguage.googleapis.com') || lower.includes(':generatecontent')) {
    return 'gemini';
  }
  return 'custom_openai';
}

function inferProviderFromKey(apiKey = '') {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AIza')) return 'gemini';
  return 'openai';
}

/**
 * Resolve concrete AI provider and API key from explicit options and environment variables.
 * Auto-detect order: DEEPSEEK_API_KEY -> OPENAI_API_KEY -> GEMINI_API_KEY -> ANTHROPIC_API_KEY.
 */
export function detectAiProvider({
  provider = 'auto',
  apiKey = '',
  endpoint = '',
  env = process.env,
} = {}) {
  const requested = String(provider || 'auto').trim().toLowerCase() || 'auto';
  if (!SUPPORTED_AI_PROVIDERS.includes(requested)) {
    return {
      valid: false,
      requestedProvider: requested,
      resolvedProvider: null,
      apiKey: '',
      envVar: null,
      source: 'invalid',
      configured: false,
    };
  }

  const explicitKey = String(apiKey || '').trim();
  const explicitEndpoint = String(endpoint || '').trim();

  if (requested === 'auto') {
    if (explicitEndpoint) {
      const inferred = inferProviderFromEndpoint(explicitEndpoint) || 'custom_openai';
      const meta = AI_PROVIDER_DEFAULTS[inferred];
      const envKey = String(env?.[meta.envVar] || '').trim();
      const resolvedKey = explicitKey || envKey;
      return {
        valid: true,
        requestedProvider: 'auto',
        resolvedProvider: inferred,
        apiKey: resolvedKey,
        envVar: meta.envVar,
        source: explicitKey ? 'explicit' : envKey ? `env:${meta.envVar}` : 'none',
        configured: Boolean(resolvedKey),
      };
    }

    for (const candidate of AUTO_DETECT_ORDER) {
      const meta = AI_PROVIDER_DEFAULTS[candidate];
      const envKey = String(env?.[meta.envVar] || '').trim();
      if (envKey) {
        return {
          valid: true,
          requestedProvider: 'auto',
          resolvedProvider: candidate,
          apiKey: explicitKey || envKey,
          envVar: meta.envVar,
          source: explicitKey ? 'explicit' : `env:${meta.envVar}`,
          configured: true,
        };
      }
    }

    if (explicitKey) {
      const inferred = inferProviderFromKey(explicitKey) || 'openai';
      const meta = AI_PROVIDER_DEFAULTS[inferred];
      return {
        valid: true,
        requestedProvider: 'auto',
        resolvedProvider: inferred,
        apiKey: explicitKey,
        envVar: meta.envVar,
        source: 'explicit',
        configured: true,
      };
    }

    return {
      valid: true,
      requestedProvider: 'auto',
      resolvedProvider: null,
      apiKey: '',
      envVar: null,
      source: 'none',
      configured: false,
    };
  }

  const meta = AI_PROVIDER_DEFAULTS[requested];
  const envKey = String(env?.[meta.envVar] || '').trim();
  const resolvedKey = explicitKey || envKey;
  return {
    valid: true,
    requestedProvider: requested,
    resolvedProvider: requested,
    apiKey: resolvedKey,
    envVar: meta.envVar,
    source: explicitKey ? 'explicit' : envKey ? `env:${meta.envVar}` : 'none',
    configured: Boolean(resolvedKey),
  };
}

/**
 * Inspect AI summarizer readiness for `doctor` and status diagnostics.
 */
export function getAiKeyStatus({ config = {}, env = process.env } = {}) {
  const provider = config.aiProvider || 'auto';
  const detected = detectAiProvider({
    provider,
    apiKey: config.aiApiKey || '',
    endpoint: config.aiEndpoint || '',
    env,
  });

  const envVarsAvailable = AUTO_DETECT_ORDER.map((id) => ({
    provider: id,
    envVar: AI_PROVIDER_DEFAULTS[id].envVar,
    set: Boolean(String(env?.[AI_PROVIDER_DEFAULTS[id].envVar] || '').trim()),
  }));

  const sourceLabel =
    detected.source === 'explicit'
      ? 'config.aiApiKey'
      : detected.source.startsWith('env:')
        ? detected.source.slice(4)
        : 'none';

  return {
    configured: detected.configured,
    requestedProvider: detected.requestedProvider,
    provider: detected.resolvedProvider,
    model:
      config.aiModel ||
      (detected.resolvedProvider ? AI_PROVIDER_DEFAULTS[detected.resolvedProvider]?.model : null),
    source: sourceLabel,
    envVarsAvailable,
  };
}

/**
 * Collect git log --stat and a cleanly bounded diff patch snippet from repoPath.
 */
export function collectRichDiffContext({
  repoPath = process.cwd(),
  since = '24 hours ago',
  maxCommits = 10,
  maxPatchChars = 6000,
  maxLogChars = 4000,
} = {}) {
  const isGitRepo = runGit(repoPath, ['rev-parse', '--is-inside-work-tree']) === 'true';
  if (!isGitRepo) {
    return {
      isGitRepo: false,
      logStat: '',
      patchSnippet: '',
      truncated: false,
      range: '',
    };
  }

  let rawLogStat = runGit(repoPath, [
    'log',
    `-n`,
    String(maxCommits),
    `--since=${since}`,
    '--stat',
    '--date=short',
    '--pretty=format:%h %ad %an | %s',
  ]);

  let commitShas = runGit(repoPath, [
    'log',
    `-n`,
    String(maxCommits),
    `--since=${since}`,
    '--pretty=format:%h',
  ])
    .split('\n')
    .filter(Boolean);

  if (!rawLogStat) {
    const fallbackCount = Math.min(maxCommits, 5);
    rawLogStat = runGit(repoPath, [
      'log',
      `-n`,
      String(fallbackCount),
      '--stat',
      '--date=short',
      '--pretty=format:%h %ad %an | %s',
    ]);
    commitShas = runGit(repoPath, ['log', `-n`, String(fallbackCount), '--pretty=format:%h'])
      .split('\n')
      .filter(Boolean);
  }

  let range = '';
  let rawPatch = '';
  if (commitShas.length > 0) {
    const oldest = commitShas[commitShas.length - 1];
    const hasParent = Boolean(runGit(repoPath, ['rev-parse', '--verify', `${oldest}^`]));
    range = hasParent ? `${oldest}^..HEAD` : oldest;
    rawPatch = hasParent
      ? runGit(repoPath, ['diff', '--no-color', '--unified=2', range])
      : runGit(repoPath, ['show', '--no-color', '--unified=2', '--format=', oldest]);
  }

  // Also include working tree diff if present and commit patch is empty
  if (!rawPatch) {
    rawPatch = runGit(repoPath, ['diff', '--no-color', '--unified=2']);
  }

  const boundedLog = truncateCleanly(rawLogStat, maxLogChars);
  const boundedPatch = truncateCleanly(rawPatch, maxPatchChars);

  return {
    isGitRepo: true,
    logStat: boundedLog.text,
    patchSnippet: boundedPatch.text,
    truncated: boundedPatch.truncated || boundedLog.truncated,
    range,
  };
}

/**
 * Build system & user prompts bound to the active AI-girl style's copyPrompt.
 */
export function buildSummaryPrompts({
  context = {},
  diffContext = {},
  style = 'big_fat_fish',
  mode = 'devlog',
} = {}) {
  const theme = resolveStyle(style);
  const projectName = context.projectName || basename(context.repoPath || process.cwd());
  const branch = context.branch || 'main';
  const stats = context.stats || { filesChanged: 0, insertions: 0, deletions: 0 };

  const schemaInstruction = [
    '你必须只返回一个合法的 JSON 对象（不要输出额外解释文字或 Markdown 代码块包裹），结构如下：',
    '{',
    '  "title": "可选，1句精炼吸睛的中文标题",',
    '  "highlights": ["3-5 条真实、具体、像真人开发者写的亮点进展"],',
    '  "pitfalls": ["1-3 条真实踩坑/排障/权衡取舍（若 diff 中无明显踩坑，可写架构取舍或边界处理）"],',
    '  "nextSteps": ["1-3 条贴合当前代码演进的下一步计划"]',
    '}',
    '约束：严格基于提供的 git 提交、改动文件与 diff 片段提炼，禁止编造不存在的功能或数据；每条控制在 15-55 字左右，自然好读。',
  ].join('\n');

  const systemPrompt =
    mode === 'report'
      ? [
          '你是一位资深研发工程师，正在把本地 Git 提交与代码 diff 提炼为清晰、客观、可直接发给团队的中文工作日报/周报要点。',
          schemaInstruction,
        ].join('\n\n')
      : [theme.copyPrompt, schemaInstruction].join('\n\n');

  const commitLines = (context.commits || [])
    .slice(0, 12)
    .map((c) => `- ${c.sha || ''} (${c.date || ''}) ${c.subject || ''}`.trim());

  const sections = [
    `项目：${projectName}`,
    `分支：${branch}`,
    `变更统计：${stats.filesChanged || 0} files changed (+${stats.insertions || 0} / -${stats.deletions || 0})`,
  ];

  if (commitLines.length > 0) {
    sections.push(`近期提交：\n${commitLines.join('\n')}`);
  }
  if ((context.changedFiles || []).length > 0) {
    sections.push(`主要改动文件：\n${context.changedFiles.slice(0, 20).join(', ')}`);
  }
  if (diffContext.logStat) {
    sections.push(`git log --stat：\n${diffContext.logStat}`);
  }
  if (diffContext.patchSnippet) {
    sections.push(`代码 diff 片段：\n${diffContext.patchSnippet}`);
  }
  if ((context.highlights || []).length > 0) {
    sections.push(`用户已补充的亮点（请保留语义并补充其他遗漏维度）：\n- ${context.highlights.join('\n- ')}`);
  }

  return {
    style: theme.id,
    styleName: theme.name,
    systemPrompt,
    userPrompt: sections.join('\n\n'),
  };
}

/**
 * Build HTTP request payload for DeepSeek, OpenAI, Gemini, Anthropic, or custom OpenAI-compatible APIs.
 */
export function buildAiProviderRequest({
  provider = 'deepseek',
  model,
  endpoint,
  apiKey = '',
  systemPrompt = '',
  userPrompt = '',
} = {}) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!AI_PROVIDER_DEFAULTS[normalized]) {
    throw new Error(
      `Unsupported AI provider "${provider}". Supported: ${Object.keys(AI_PROVIDER_DEFAULTS).join(', ')}`
    );
  }

  const defaults = AI_PROVIDER_DEFAULTS[normalized];
  const targetModel = String(model || '').trim() || defaults.model;
  const cleanKey = String(apiKey || '').trim();

  if (normalized === 'gemini') {
    const baseUrl =
      String(endpoint || '').trim() ||
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;
    const hasKeyParam = /[?&]key=/.test(baseUrl);
    const url =
      cleanKey && !hasKeyParam
        ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(cleanKey)}`
        : baseUrl;

    return {
      provider: normalized,
      model: targetModel,
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      },
    };
  }

  if (normalized === 'anthropic') {
    const url = String(endpoint || '').trim() || defaults.endpoint;
    return {
      provider: normalized,
      model: targetModel,
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(cleanKey ? { 'x-api-key': cleanKey } : {}),
      },
      body: {
        model: targetModel,
        max_tokens: 1024,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
    };
  }

  // deepseek, openai, custom_openai (OpenAI Chat Completions compatible)
  const url = String(endpoint || '').trim() || defaults.endpoint;
  const body = {
    model: targetModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  };
  if (normalized === 'deepseek' || normalized === 'openai') {
    body.response_format = { type: 'json_object' };
  }

  return {
    provider: normalized,
    model: targetModel,
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}),
    },
    body,
  };
}

/**
 * Extract raw text content from provider-specific JSON responses.
 */
export function extractProviderText(provider, data) {
  if (!data || typeof data !== 'object') return '';
  if (provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
    }
    return '';
  }
  if (provider === 'anthropic') {
    if (Array.isArray(data?.content)) {
      return data.content
        .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
        .map((block) => block.text)
        .join('');
    }
    return '';
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

function normalizeStringList(arr, maxLen) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const text = String(item ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxLen) break;
  }
  return out;
}

/**
 * Strip optional markdown code fences and parse strict devlog summary JSON.
 */
export function parseSummaryJson(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Empty AI summary response');
  }

  let cleaned = rawText.trim();
  // Strip outer markdown code fences such as ```json ... ``` or ``` ... ```
  const fencedMatch = cleaned.match(/^```(?:json|JSON)?\s*\r?\n?([\s\S]*?)\r?\n?```$/);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error('AI response did not contain a valid JSON object');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI summary payload must be a JSON object');
  }

  const title =
    typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : undefined;
  const highlights = normalizeStringList(parsed.highlights, 6);
  const pitfalls = normalizeStringList(parsed.pitfalls, 4);
  const nextSteps = normalizeStringList(parsed.nextSteps, 4);

  if (!title && highlights.length === 0 && pitfalls.length === 0 && nextSteps.length === 0) {
    throw new Error('AI summary JSON contained no usable fields');
  }

  return {
    ...(title ? { title } : {}),
    highlights,
    pitfalls,
    nextSteps,
  };
}

function mergeBullets(userList = [], aiList = [], maxMerged = 5) {
  const cleanUser = (Array.isArray(userList) ? userList : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const cleanAi = (Array.isArray(aiList) ? aiList : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (cleanUser.length === 0) return cleanAi;

  const seen = new Set(cleanUser.map((s) => s.toLowerCase()));
  const merged = [...cleanUser];
  for (const item of cleanAi) {
    if (merged.length >= maxMerged) break;
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * Merge user-provided flags with AI-generated summary cleanly (user inputs take priority).
 */
export function mergeAiSummary(base = {}, aiSummary = {}) {
  const userTitle = typeof base.title === 'string' && base.title.trim() ? base.title.trim() : undefined;
  const aiTitle =
    typeof aiSummary?.title === 'string' && aiSummary.title.trim()
      ? aiSummary.title.trim()
      : undefined;

  return {
    title: userTitle || aiTitle,
    highlights: mergeBullets(base.highlights, aiSummary?.highlights, 5),
    pitfalls: mergeBullets(base.pitfalls, aiSummary?.pitfalls, 3),
    nextSteps: mergeBullets(base.nextSteps, aiSummary?.nextSteps, 3),
  };
}

function maskRequestPreview(req) {
  const headers = { ...req.headers };
  if (headers.Authorization) headers.Authorization = 'Bearer ***';
  if (headers['x-api-key']) headers['x-api-key'] = '***';
  return {
    url: req.url.replace(/([?&]key=)[^&]+/, '$1***'),
    method: req.method,
    headers,
    body: req.body,
  };
}

/**
 * Auto-summarize local git log & diff into structured devlog bullets using native fetch.
 * Never throws on missing API keys or network failures — returns a structured graceful fallback.
 */
export async function summarizeWithAI({
  context = {},
  repoPath = context?.repoPath || process.cwd(),
  since = context?.since || '24 hours ago',
  maxCommits = 10,
  maxPatchChars = 6000,
  style = 'big_fat_fish',
  mode = 'devlog',
  provider = 'auto',
  model,
  endpoint,
  apiKey,
  dryRun = false,
  timeoutMs = 25000,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const detected = detectAiProvider({ provider, apiKey, endpoint, env });
  if (!detected.valid) {
    return {
      ok: false,
      dryRun: Boolean(dryRun),
      provider: detected.requestedProvider,
      reason: 'INVALID_PROVIDER',
      message: `Unsupported AI provider "${provider}".`,
      hint: `Use one of: ${SUPPORTED_AI_PROVIDERS.join(', ')}`,
    };
  }

  const diffContext = collectRichDiffContext({
    repoPath,
    since,
    maxCommits,
    maxPatchChars,
  });

  const prompts = buildSummaryPrompts({
    context: { ...context, repoPath },
    diffContext,
    style,
    mode,
  });

  if (dryRun) {
    const previewProvider = detected.resolvedProvider || 'deepseek';
    const req = buildAiProviderRequest({
      provider: previewProvider,
      model,
      endpoint,
      apiKey: detected.apiKey,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
    });
    return {
      ok: true,
      dryRun: true,
      provider: previewProvider,
      model: req.model,
      configured: detected.configured,
      style: prompts.style,
      prompts,
      diffContext,
      requestPreview: maskRequestPreview(req),
    };
  }

  if (!detected.configured || !detected.resolvedProvider) {
    const expectedVar = detected.envVar || 'DEEPSEEK_API_KEY';
    return {
      ok: false,
      dryRun: false,
      provider: detected.resolvedProvider || detected.requestedProvider,
      reason: 'NO_API_KEY',
      message: detected.envVar
        ? `No API key configured for AI provider "${detected.resolvedProvider}" (${expectedVar}).`
        : 'No AI summarizer API key found in environment or config.',
      hint:
        'export DEEPSEEK_API_KEY=<key> (or OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY), or use the devlog-poster Skill inside Antigravity / Codex / Claude Code at zero extra cost',
    };
  }

  const req = buildAiProviderRequest({
    provider: detected.resolvedProvider,
    model,
    endpoint,
    apiKey: detected.apiKey,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      dryRun: false,
      provider: detected.resolvedProvider,
      model: req.model,
      reason: 'FETCH_UNAVAILABLE',
      message: 'Global fetch is not available in this Node runtime.',
      hint: 'Upgrade to Node.js >= 20 or pass explicit --highlight flags',
    };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
      ...(controller ? { signal: controller.signal } : {}),
    });

    const rawBody = await res.text();
    let data = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const detail =
        data?.error?.message || data?.message || rawBody.slice(0, 180) || `HTTP ${res.status}`;
      return {
        ok: false,
        dryRun: false,
        provider: detected.resolvedProvider,
        model: req.model,
        status: res.status,
        reason: 'HTTP_ERROR',
        message: `AI provider "${detected.resolvedProvider}" returned HTTP ${res.status}: ${detail}`,
        hint: 'Check your API key/model/network or run without --ai (or pass --highlight manually)',
      };
    }

    const rawText = extractProviderText(detected.resolvedProvider, data);
    let summary;
    try {
      summary = parseSummaryJson(rawText);
    } catch (parseErr) {
      return {
        ok: false,
        dryRun: false,
        provider: detected.resolvedProvider,
        model: req.model,
        reason: 'PARSE_ERROR',
        message: `Failed to parse AI summary JSON: ${parseErr.message}`,
        hint: 'Retry with another --ai-model or pass explicit --highlight flags',
      };
    }

    return {
      ok: true,
      dryRun: false,
      provider: detected.resolvedProvider,
      model: req.model,
      style: prompts.style,
      summary,
      diffContext: {
        isGitRepo: diffContext.isGitRepo,
        truncated: diffContext.truncated,
        range: diffContext.range,
      },
    };
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      provider: detected.resolvedProvider,
      model: req.model,
      reason: 'FETCH_ERROR',
      message: `AI summarizer request failed: ${err?.message || String(err)}`,
      hint: 'Check network connectivity / endpoint URL, or omit --ai to use git commits directly',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
