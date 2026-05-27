import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { LLMSettings } from '../../types';
import { DEFAULT_LLM_SETTINGS } from '../../types';

const SETTINGS_PATH = path.join(os.homedir(), 'isgrace-workspace', 'settings.json');

export async function loadLLMSettings(): Promise<LLMSettings> {
  try {
    if (await fs.pathExists(SETTINGS_PATH)) {
      const raw = await fs.readJson(SETTINGS_PATH);
      return { ...DEFAULT_LLM_SETTINGS, ...raw };
    }
  } catch (e) {
    console.error('[settingsService] load failed:', e);
  }
  return { ...DEFAULT_LLM_SETTINGS };
}

export async function saveLLMSettings(settings: Partial<LLMSettings>): Promise<LLMSettings> {
  const existing = await loadLLMSettings();
  const merged = { ...existing, ...settings };
  await fs.ensureDir(path.dirname(SETTINGS_PATH));
  await fs.writeJson(SETTINGS_PATH, merged, { spaces: 2 });
  return merged;
}
