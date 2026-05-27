import type { Config, Material, SmartContext, ChatMessage, LLMSettings, StreamChunk } from '../../types';

// ── Window type declaration ────────────────────────────────────────────────────

declare global {
  interface Window {
    isgrace: {
      config: {
        load: () => Promise<Config>;
        save: (config: Partial<Config>) => Promise<Config>;
      };
      file: {
        selectMaterials: () => Promise<string[]>;
        uploadMaterial: (src: string, name: string) => Promise<Material>;
        uploadUrl: (url: string) => Promise<Material>;
        deleteMaterial: (id: string) => Promise<void>;
      };
      llm: {
        buildSmartContext: (opts: {
          userMessage: string;
          chatHistory: ChatMessage[];
          uploadedMaterials: Material[];
          generatedContent?: { studyGuide?: string; cheatsheet?: string; teachingNotes?: string[] };
        }) => Promise<SmartContext>;
        chat: (payload: { messages: Array<{ role: string; content: string }> }) => Promise<{ streamId: string }>;
        onChunk: (cb: (chunk: StreamChunk) => void) => () => void;
        grade: (payload: {
          questionId: string; type: 'essay' | 'code';
          question: string; rubric: string; answer: string; points: number;
        }) => Promise<{ questionId: string; correct: boolean; score: number; maxScore: number; explanation: string }>;
      };
      settings: {
        load: () => Promise<LLMSettings>;
        save: (s: Partial<LLMSettings>) => Promise<LLMSettings>;
        testConnection: (s: LLMSettings) => Promise<{ ok: boolean; error?: string }>;
      };
      progress: {
        update: (data: Record<string, unknown>) => Promise<{ ok: boolean }>;
      };
      cheatsheet: {
        save: (content: string) => Promise<string>;
      };
      app: {
        locale: () => Promise<string>;
      };
    };
  }
}

// ── Bridge guard ──────────────────────────────────────────────────────────────

function bridge(): Window['isgrace'] {
  if (typeof window === 'undefined' || !window.isgrace) {
    throw new Error('[isGrace] window.isgrace not available — preload not loaded?');
  }
  return window.isgrace;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  config: {
    load: (): Promise<Config> => bridge().config.load(),
    save: (config: Partial<Config>): Promise<Config> => bridge().config.save(config),
  },

  file: {
    selectMaterials: (): Promise<string[]> => bridge().file.selectMaterials().catch(() => []),
    uploadMaterial: (src: string, name: string): Promise<Material> => bridge().file.uploadMaterial(src, name),
    uploadUrl: (url: string): Promise<Material> => bridge().file.uploadUrl(url),
    deleteMaterial: (id: string): Promise<void> => bridge().file.deleteMaterial(id),
  },

  llm: {
    buildSmartContext: (
      opts: Parameters<Window['isgrace']['llm']['buildSmartContext']>[0]
    ): Promise<SmartContext> => bridge().llm.buildSmartContext(opts),

    /** Returns a streamId; chunks arrive via onChunk subscription. */
    chat: (payload: { messages: Array<{ role: string; content: string }> }): Promise<{ streamId: string }> =>
      bridge().llm.chat(payload),

    /** Subscribe to stream chunks. Returns unsubscribe fn. */
    onChunk: (cb: (chunk: StreamChunk) => void): (() => void) =>
      bridge().llm.onChunk(cb),

    /** Grade an essay or code answer via LLM. */
    grade: (payload: Parameters<Window['isgrace']['llm']['grade']>[0]) =>
      bridge().llm.grade(payload),
  },

  settings: {
    load: (): Promise<LLMSettings> => bridge().settings.load(),
    save: (s: Partial<LLMSettings>): Promise<LLMSettings> => bridge().settings.save(s),
    testConnection: (s: LLMSettings): Promise<{ ok: boolean; error?: string }> =>
      bridge().settings.testConnection(s),
  },

  progress: {
    update: (data: Record<string, unknown>): Promise<{ ok: boolean }> =>
      bridge().progress.update(data).catch(() => ({ ok: false })),
  },

  cheatsheet: {
    save: (content: string): Promise<string> => bridge().cheatsheet.save(content),
  },

  app: {
    locale: (): Promise<string> => bridge().app.locale().catch(() => 'en-US'),
  },
};
