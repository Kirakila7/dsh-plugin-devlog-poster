import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveStyle } from './styles.js';

export const PLATFORM_IMAGE_PRESETS = {
  xiaohongshu: {
    platform: 'xiaohongshu',
    label: '小红书封面',
    aspectRatio: '3:4',
    size: '1024x1365',
    composition:
      'Vertical 3:4 editorial poster composition, generous top and bottom breathing room for cover typography, crisp focal subject in the center, trendy Xiaohongshu indie-maker aesthetic, clean lighting',
  },
  bilibili: {
    platform: 'bilibili',
    label: 'B站横版封面',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Wide 16:9 cinematic desktop studio composition, vibrant anime-inspired tech illustration, expressive lighting and depth of field, engaging Bilibili devlog thumbnail energy',
  },
  douyin: {
    platform: 'douyin',
    label: '抖音竖版封面',
    aspectRatio: '3:4',
    size: '1024x1365',
    composition:
      'High-contrast vertical 3:4 mobile-first poster, bold central visual hook, glowing rim light, punchy modern digital art style that reads instantly on a phone screen',
  },
  github: {
    platform: 'github',
    label: 'GitHub 仓库横幅',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Minimalist 16:9 open-source social preview banner, sleek architectural geometry, balanced negative space, crisp developer-tool branding aesthetic',
  },
  x: {
    platform: 'x',
    label: 'X (Twitter) 推文配图',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Wide 16:9 punchy social preview illustration for X / Twitter timeline, crisp central focal subject, strong silhouette contrast at feed thumbnail size, generous clean margin for Build-in-Public tech storytelling',
  },
  reddit: {
    platform: 'reddit',
    label: 'Reddit 帖子封面',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Wide 16:9 authentic indie-maker showcase visual for Reddit r/SideProject, cozy developer desk and code-craft energy, grounded editorial composition without clickbait clutter',
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn 分享横图',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Wide 16:9 refined engineering editorial illustration for LinkedIn feed, structured visual balance, clean geometric depth, approachable modern developer-brand polish',
  },
  devto: {
    platform: 'devto',
    label: 'Dev.to 文章头图',
    aspectRatio: '16:9',
    size: '1344x768',
    composition:
      'Wide 16:9 developer blog header illustration for Dev.to (center-band safe for 1000x420 banner crop), expressive open-source devlog visual storytelling with balanced side margins',
  },
};

const SHARED_CHIBI_ART_STYLE =
  '2-head-tall cute chibi anime comic illustration, clean bold dark ink outlines, bright cel-shaded flat pastel coloring, expressive meme-sticker charm, soft clean background';

const STYLE_VISUAL_DIRECTIVES = {
  big_fat_fish:
    `${SHARED_CHIBI_ART_STYLE}. Character: DeepSeek "Big Fat Fish" — blue long-haired girl with a whale tail and white frilly maid headband, holding a huge bowl of steamed white rice or earnestly opening a little notebook to explain code, surrounded by glowing deep-ocean blue bubbles (#061326 to #38BDF8)`,
  gemini:
    `${SHARED_CHIBI_ART_STYLE}. Character: Gemini "Hakimi (哈基米)" — energetic purple-blue twin-bun cat-ear girl with pink-and-gold heterochromia eyes and a glowing four-point star hairclip, holding a starry microphone surrounded by floating musical notes and violet-blue sparkles (#0B0A1F, #60A5FA, #C084FC)`,
  chatgpt:
    `${SHARED_CHIBI_ART_STYLE}. Character: ChatGPT white dragon girl — silver-white hair, cute little dragon horns and tiny wings, white geometric knot-flower hair ornament, confident genius smile or playful dizzy X-eyes, accented with emerald-mint tech sparkles (#071915, #10A37F, #34D399)`,
  claude:
    `${SHARED_CHIBI_ART_STYLE}. Character: Claude bookish lady — warm orange long hair with a starburst flower ribbon, holding a brown hardcover book in one hand and a tiny playful red warning sign in the other, warm terracotta and cream editorial glow (#1C1410, #D97757, #F4A261)`,
};

export const SUPPORTED_IMAGE_PROVIDERS = [
  'openai',
  'gemini',
  'volcengine',
  'custom_openai',
  'svg_fallback',
];

/**
 * Build platform-adapted image generation prompt bound to the chosen model style and devlog context.
 */
export function buildImagePrompt(context, { platform = 'xiaohongshu', style = 'big_fat_fish' } = {}) {
  const preset = PLATFORM_IMAGE_PRESETS[platform] || PLATFORM_IMAGE_PRESETS.xiaohongshu;
  const theme = resolveStyle(style);
  const styleCue = STYLE_VISUAL_DIRECTIVES[theme.id] || STYLE_VISUAL_DIRECTIVES.big_fat_fish;
  const shortName = context.projectName.split('/').pop() || context.projectName;
  const mainHighlight =
    context.highlights?.[0] ||
    context.commits?.[0]?.subject ||
    'Shipping a new developer tool milestone';

  const prompt = [
    `Topic: Indie developer Build-in-Public devlog cover for software project "${shortName}", visualizing the milestone: "${mainHighlight}".`,
    `Style: ${styleCue}.`,
    `Layout: ${preset.composition}.`,
    'Quality: ultra-clean vector/editorial finish, cohesive color harmony, high visual polish.',
    'Constraints: DO NOT render garbled text, watermarks, or random letters; keep clean negative space so title overlays stay legible.',
  ].join('\n');

  const negativePrompt =
    'blurry, cluttered background, garbled text, gibberish Chinese characters, watermark, lowres, oversaturated, stock photo watermark';

  return {
    platform: preset.platform,
    label: preset.label,
    style: theme.id,
    styleName: theme.name,
    aspectRatio: preset.aspectRatio,
    size: preset.size,
    prompt,
    negativePrompt,
  };
}

/**
 * Build prompts for all 4 social platforms for a given style.
 */
export function buildAllPlatformImagePrompts(context, { style = 'big_fat_fish' } = {}) {
  const result = {};
  for (const platform of Object.keys(PLATFORM_IMAGE_PRESETS)) {
    result[platform] = buildImagePrompt(context, { platform, style });
  }
  return result;
}

/**
 * Build provider HTTP request for OpenAI / Gemini / Volcengine Ark / OpenAI-compatible image APIs.
 */
export function buildImageProviderRequest({
  provider = 'openai',
  model,
  endpoint,
  apiKey,
  promptSpec,
}) {
  if (!SUPPORTED_IMAGE_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported image provider "${provider}". Supported: ${SUPPORTED_IMAGE_PROVIDERS.join(', ')}`
    );
  }

  if (provider === 'svg_fallback') {
    return { provider, mode: 'local_svg', promptSpec };
  }

  if (provider === 'gemini') {
    const targetModel = model || 'imagen-3.0-generate-002';
    const base = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${base}/models/${targetModel}:predict${apiKey ? `?key=${apiKey}` : ''}`;
    return {
      provider,
      model: targetModel,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        instances: [{ prompt: promptSpec.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: promptSpec.aspectRatio,
        },
      },
    };
  }

  if (provider === 'volcengine') {
    const targetModel = model || 'doubao-seedream-3-0-t2i-250415';
    const url = endpoint || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    return {
      provider,
      model: targetModel,
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: {
        model: targetModel,
        prompt: promptSpec.prompt,
        size: promptSpec.size,
        response_format: 'b64_json',
      },
    };
  }

  // openai or custom_openai
  const targetModel = model || 'gpt-image-1';
  const url = endpoint || 'https://api.openai.com/v1/images/generations';
  return {
    provider,
    model: targetModel,
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: {
      model: targetModel,
      prompt: promptSpec.prompt,
      size: promptSpec.aspectRatio === '16:9' ? '1536x1024' : '1024x1536',
      n: 1,
    },
  };
}

/**
 * Generate a platform visual image via bound image model provider.
 * Defaults to dryRun=true to preview prompt & payload without spending API credits.
 */
export async function generateVisualImage({
  context,
  platform = 'xiaohongshu',
  style = 'big_fat_fish',
  provider = 'openai',
  model,
  endpoint,
  apiKey,
  outputPath,
  dryRun = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const promptSpec = buildImagePrompt(context, { platform, style });
  const resolvedKey =
    apiKey ||
    (provider === 'gemini'
      ? process.env.GEMINI_API_KEY
      : provider === 'volcengine'
        ? process.env.ARK_API_KEY
        : process.env.OPENAI_API_KEY);

  const req = buildImageProviderRequest({
    provider,
    model,
    endpoint,
    apiKey: resolvedKey,
    promptSpec,
  });

  if (dryRun || provider === 'svg_fallback') {
    return {
      ok: true,
      dryRun: true,
      provider,
      model: req.model || 'svg-card',
      promptSpec,
      requestPreview:
        req.mode === 'local_svg'
          ? { mode: 'local_svg' }
          : { url: req.url.replace(/key=[^&]+/, 'key=***'), body: req.body },
    };
  }

  if (!resolvedKey) {
    throw new Error(
      `API key required for provider "${provider}" when dryRun=false (pass apiKey or set env var).`
    );
  }

  const res = await fetchImpl(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Image provider "${provider}" failed (${res.status}): ${JSON.stringify(data)}`);
  }

  const b64 =
    data?.data?.[0]?.b64_json ||
    data?.predictions?.[0]?.bytesBase64Encoded ||
    null;
  const imageUrl = data?.data?.[0]?.url || null;

  let savedPath = null;
  if (b64 && outputPath) {
    savedPath = resolve(outputPath);
    writeFileSync(savedPath, Buffer.from(b64, 'base64'));
  }

  return {
    ok: true,
    dryRun: false,
    provider,
    model: req.model,
    promptSpec,
    savedPath,
    imageUrl,
  };
}
