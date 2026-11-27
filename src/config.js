import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AVAILABLE_STYLES } from './styles.js';
import { SUPPORTED_REPORT_CHANNELS } from './work-report.js';
import { SUPPORTED_IMAGE_PROVIDERS } from './image-gen.js';
import { SUPPORTED_AI_PROVIDERS } from './ai-summarizer.js';

export const DEFAULT_CONFIG_PATH = join(homedir(), '.dsh-devlog-poster', 'config.json');
export const LOCAL_CONFIG_FILENAME = '.devlog-poster.json';

export const DEFAULT_CONFIG = {
  defaultStyle: 'big_fat_fish',
  outputDir: 'out',
  aiProvider: 'auto',
  aiModel: '',
  aiEndpoint: '',
  imageProvider: 'openai',
  imageModel: '',
  imageEndpoint: '',
  defaultReportChannel: 'feishu',
  reportEndpoint: '',
  qqGroupId: '',
  qqUserId: '',
};

export const SECRET_CONFIG_KEYS = ['reportToken', 'imageApiKey', 'aiApiKey'];

export const CONFIG_KEYS = [
  ...Object.keys(DEFAULT_CONFIG),
  'reportToken',
  'imageApiKey',
  'aiApiKey',
  'browserProfileDir',
  'ghBin',
];

export const STYLE_ALIASES = {
  fish: 'big_fat_fish',
  deepseek: 'big_fat_fish',
  ds: 'big_fat_fish',
  bigfatfish: 'big_fat_fish',
  'big-fat-fish': 'big_fat_fish',
  hakimi: 'gemini',
  gem: 'gemini',
  google: 'gemini',
  gpt: 'chatgpt',
  openai: 'chatgpt',
  dragon: 'chatgpt',
  anthropic: 'claude',
  cl: 'claude',
};

export function normalizeStyleId(input) {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  if (!key) return null;
  if (AVAILABLE_STYLES.includes(key)) return key;
  return STYLE_ALIASES[key] || null;
}

export function getLocalConfigPath(repoPath = process.cwd()) {
  return resolve(repoPath, LOCAL_CONFIG_FILENAME);
}

function safeReadJson(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function maskSecretValue(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-4)}`;
}

export function maskConfigSecrets(config = {}) {
  const masked = { ...config };
  for (const key of SECRET_CONFIG_KEYS) {
    if (masked[key]) {
      masked[key] = maskSecretValue(masked[key]);
    }
  }
  return masked;
}

/**
 * Validate a configuration patch against known keys and enum constraints.
 */
export function validateConfigPatch(patch = {}) {
  const errors = [];
  const normalized = {};

  for (const [key, rawValue] of Object.entries(patch)) {
    if (!CONFIG_KEYS.includes(key)) {
      errors.push(
        `Unknown config key "${key}". Valid keys: ${CONFIG_KEYS.join(', ')}`
      );
      continue;
    }

    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (key === 'defaultStyle') {
      const styleId = normalizeStyleId(String(value));
      if (!styleId) {
        errors.push(
          `Invalid defaultStyle "${value}". Valid styles: ${AVAILABLE_STYLES.join(', ')} (aliases: fish, hakimi, gpt)`
        );
        continue;
      }
      normalized[key] = styleId;
      continue;
    }

    if (key === 'defaultReportChannel') {
      if (!SUPPORTED_REPORT_CHANNELS.includes(value)) {
        errors.push(
          `Invalid defaultReportChannel "${value}". Valid channels: ${SUPPORTED_REPORT_CHANNELS.join(', ')}`
        );
        continue;
      }
      normalized[key] = value;
      continue;
    }

    if (key === 'imageProvider') {
      if (!SUPPORTED_IMAGE_PROVIDERS.includes(value)) {
        errors.push(
          `Invalid imageProvider "${value}". Valid providers: ${SUPPORTED_IMAGE_PROVIDERS.join(', ')}`
        );
        continue;
      }
      normalized[key] = value;
      continue;
    }

    if (key === 'aiProvider') {
      const normalizedProvider = String(value).toLowerCase();
      if (!SUPPORTED_AI_PROVIDERS.includes(normalizedProvider)) {
        errors.push(
          `Invalid aiProvider "${value}". Valid providers: ${SUPPORTED_AI_PROVIDERS.join(', ')}`
        );
        continue;
      }
      normalized[key] = normalizedProvider;
      continue;
    }

    normalized[key] = value;
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized,
  };
}

/**
 * Load merged configuration from global ~/.dsh-devlog-poster/config.json
 * and optional project-local .devlog-poster.json.
 */
export function loadConfig({
  globalPath = DEFAULT_CONFIG_PATH,
  repoPath = process.cwd(),
} = {}) {
  const globalCfg = safeReadJson(globalPath);
  const localCfg = safeReadJson(getLocalConfigPath(repoPath));
  return {
    ...DEFAULT_CONFIG,
    ...globalCfg,
    ...localCfg,
  };
}

/**
 * Inspect resolved config along with masked secrets and source file status.
 */
export function inspectConfig({
  globalPath = DEFAULT_CONFIG_PATH,
  repoPath = process.cwd(),
} = {}) {
  const localPath = getLocalConfigPath(repoPath);
  const globalExists = Boolean(globalPath && existsSync(globalPath));
  const localExists = existsSync(localPath);
  const config = loadConfig({ globalPath, repoPath });
  return {
    config,
    maskedConfig: maskConfigSecrets(config),
    sources: {
      globalPath,
      globalExists,
      localPath,
      localExists,
    },
  };
}

/**
 * Persist key-value configuration updates to disk.
 */
export function saveConfig(
  patch = {},
  {
    configPath,
    local = false,
    repoPath = process.cwd(),
    validate = false,
  } = {}
) {
  let effectivePatch = patch;
  if (validate) {
    const check = validateConfigPatch(patch);
    if (!check.valid) {
      throw new Error(check.errors.join('; '));
    }
    effectivePatch = check.normalized;
  }

  const targetPath = configPath || (local ? getLocalConfigPath(repoPath) : DEFAULT_CONFIG_PATH);
  const current = safeReadJson(targetPath);
  const next = local && !configPath
    ? { ...current, ...effectivePatch }
    : { ...DEFAULT_CONFIG, ...current, ...effectivePatch };

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { configPath: targetPath, local: Boolean(local && !configPath), config: next };
}

/**
 * Reset global or project-local configuration back to defaults.
 */
export function resetConfig({
  configPath,
  local = false,
  repoPath = process.cwd(),
} = {}) {
  const targetPath = configPath || (local ? getLocalConfigPath(repoPath) : DEFAULT_CONFIG_PATH);
  const existed = existsSync(targetPath);
  if (existed) {
    rmSync(targetPath, { force: true });
  }
  return {
    configPath: targetPath,
    local: Boolean(local && !configPath),
    existed,
    config: { ...DEFAULT_CONFIG },
  };
}
