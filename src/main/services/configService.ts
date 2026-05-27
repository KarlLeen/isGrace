import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { Config } from '../../types';

const WORKSPACE_DIR = path.join(os.homedir(), 'isgrace-workspace');
const CONFIG_PATH = path.join(WORKSPACE_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  onboardingComplete: false,
  userName: '',
  subjects: [],
  activeSubjectId: null,
  languagePreference: '',
  detectedLanguage: 'en',
};

export async function ensureWorkspace(): Promise<void> {
  await fs.ensureDir(WORKSPACE_DIR);
  await fs.ensureDir(path.join(WORKSPACE_DIR, 'materials'));
  await fs.ensureDir(path.join(WORKSPACE_DIR, 'chapters'));
  await fs.ensureDir(path.join(WORKSPACE_DIR, 'tests'));
}

export async function loadConfig(): Promise<Config> {
  await ensureWorkspace();
  if (await fs.pathExists(CONFIG_PATH)) {
    return await fs.readJson(CONFIG_PATH);
  }
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Partial<Config>): Promise<Config> {
  await ensureWorkspace();
  const existing = await loadConfig();
  const merged = { ...existing, ...config };
  await fs.writeJson(CONFIG_PATH, merged, { spaces: 2 });
  return merged;
}

export function getWorkspaceDir(): string {
  return WORKSPACE_DIR;
}

export function getMaterialsDir(): string {
  return path.join(WORKSPACE_DIR, 'materials');
}
