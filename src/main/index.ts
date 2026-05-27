import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadConfig, saveConfig } from './services/configService';
import { uploadMaterial, deleteMaterial, uploadFromUrl } from './services/fileService';
import { buildSmartContext, loadMaterialContents } from './services/contextManager';
import { loadLLMSettings, saveLLMSettings } from './services/settingsService';
import { streamChat, testConnection, completeChat } from './services/llmService';
import { saveCheatsheet } from './services/cheatsheetService';
import type { LLMMessage } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');

  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.icns');

  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FEFEFE',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());
  return win;
}

app.whenReady().then(() => {
  // Set dock icon on macOS (visible in dev mode)
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(__dirname, '..', '..', 'build', 'icon.icns');
    app.dock?.setIcon(dockIconPath);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Config ────────────────────────────────────────────────────────────────────

ipcMain.handle('config:load', () => loadConfig());
ipcMain.handle('config:save', (_e, config) => saveConfig(config));

// ── Files ─────────────────────────────────────────────────────────────────────

ipcMain.handle('file:select-materials', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Learning Materials', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('file:upload-material', (_e, src: string, name: string) => uploadMaterial(src, name));
ipcMain.handle('file:upload-url', (_e, url: string) => uploadFromUrl(url));
ipcMain.handle('file:delete-material', (_e, id: string) => deleteMaterial(id));

// ── Context ───────────────────────────────────────────────────────────────────

ipcMain.handle('llm:build-smart-context', async (_e, opts) => {
  const mats = await loadMaterialContents(opts.uploadedMaterials ?? []);
  return buildSmartContext({ ...opts, uploadedMaterials: mats });
});

// ── LLM Settings ──────────────────────────────────────────────────────────────

ipcMain.handle('settings:load', () => loadLLMSettings());
ipcMain.handle('settings:save', async (_e, s) => {
  try {
    return await saveLLMSettings(s);
  } catch (err) {
    console.error('[IPC settings:save] failed:', err);
    throw err;
  }
});
ipcMain.handle('settings:test-connection', (_e, settings) => testConnection(settings));

// ── LLM Chat (streaming) ──────────────────────────────────────────────────────
//
// Pattern:
//   1. Renderer calls invoke('llm:chat', { messages }) → gets back { streamId }
//   2. Main streams chunks via webContents.send('llm:chunk', { id, delta, done })
//   3. Renderer correlates by streamId and builds the response in real-time

ipcMain.handle('llm:chat', async (event, payload: { messages: LLMMessage[] }) => {
  const settings = await loadLLMSettings();
  const streamId = crypto.randomUUID();

  // Fire-and-forget — handler returns streamId immediately
  streamChat(payload.messages, settings, streamId, (chunk) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('llm:chunk', chunk);
    }
  }).catch((err) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('llm:chunk', { id: streamId, delta: '', done: true, error: String(err) });
    }
  });

  return { streamId };
});

// ── LLM grading (non-streaming, used for essay/code test feedback) ────────────

interface GradePayload {
  questionId: string;
  type: 'essay' | 'code';
  question: string;
  rubric: string;
  answer: string;
  points: number;
}

interface GradeResult {
  questionId: string;
  correct: boolean;
  score: number;
  maxScore: number;
  explanation: string;
}

ipcMain.handle('llm:grade', async (_e, payload: GradePayload): Promise<GradeResult> => {
  const settings = await loadLLMSettings();
  const systemPrompt = `You are a strict but fair academic grader. Grade the student's answer against the rubric provided. Return ONLY valid JSON with no extra text and no code fences.`;
  const userPrompt = `Question: ${payload.question}

Rubric and model answer:
${payload.rubric}

Student's answer:
${payload.answer || '(no answer provided)'}

Grade this answer strictly against the rubric. Return JSON in exactly this format:
{"correct":true,"score":3,"maxScore":${payload.points},"explanation":"..."}

Rules:
- "correct" = true if score >= 60% of maxScore
- "explanation" must be specific and useful: mention what the student got right, what was missing, and the key points from the rubric they should have covered. 2-4 sentences.
- Do not be lenient — grade strictly`;

  const raw = await completeChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    settings,
  );

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned) as { correct: boolean; score: number; maxScore: number; explanation: string };
    return {
      questionId: payload.questionId,
      correct: data.correct ?? data.score >= data.maxScore * 0.6,
      score: data.score ?? 0,
      maxScore: data.maxScore ?? payload.points,
      explanation: data.explanation ?? raw,
    };
  } catch {
    return {
      questionId: payload.questionId,
      correct: false,
      score: 0,
      maxScore: payload.points,
      explanation: raw || 'Grading failed — please try again.',
    };
  }
});

// ── Progress ──────────────────────────────────────────────────────────────────

ipcMain.handle('progress:update', (_e, data) => {
  console.log('[Progress]', data);
  return { ok: true };
});

// ── Cheatsheet ────────────────────────────────────────────────────────────────

ipcMain.handle('cheatsheet:save', (_e, content: string) => saveCheatsheet(content));

// ── App locale ────────────────────────────────────────────────────────────────

ipcMain.handle('app:locale', () => app.getLocale());
