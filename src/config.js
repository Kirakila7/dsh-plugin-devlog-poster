import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_CONFIG_PATH = join(homedir(), '.dsh-devlog-poster', 'config.json');

export const DEFAULT_CONFIG = {
  defaultStyle: 'big_fat_fish',
  outputDir: 'out',
  imageProvider: 'openai',
  imageModel: '',
  imageEndpoint: '',
  defaultReportChannel: 'feishu',
  reportEndpoint: '',
  qqGroupId: '',
  qqUserId: '',
};

function safeReadJson(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
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
  const localCfg = safeReadJson(resolve(repoPath, '.devlog-poster.json'));
  return {
    ...DEFAULT_CONFIG,
    ...globalCfg,
    ...localCfg,
  };
}

/**
 * Persist key-value configuration updates to disk.
 */
export function saveConfig(patch = {}, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  const current = safeReadJson(configPath);
  const next = { ...DEFAULT_CONFIG, ...current, ...patch };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { configPath, config: next };
}
