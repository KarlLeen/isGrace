import https from 'https';
import http from 'http';
import type { LLMMessage, LLMSettings, LLMProviderConfig, StreamChunk } from '../../types';
import { PROVIDER_CONFIGS } from '../../types';

export type ChunkCallback = (chunk: StreamChunk) => void;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getProviderConfig(settings: LLMSettings): LLMProviderConfig {
  return PROVIDER_CONFIGS.find(p => p.id === settings.provider) ?? PROVIDER_CONFIGS[0];
}

function httpError(status: number, body: string): string {
  if (status === 401) return 'INVALID_API_KEY';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 429) return 'RATE_LIMITED';
  return `HTTP_${status}: ${body.slice(0, 200)}`;
}

// ── Core streaming helper (Node.js https/http, no fetch) ──────────────────────

function streamViaNode(
  urlStr: string,
  headers: Record<string, string>,
  bodyStr: string,
  streamId: string,
  onChunk: ChunkCallback,
  parseLine: (data: string) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const url = new URL(urlStr);
    const isSecure = url.protocol === 'https:';
    const mod = isSecure ? https : http;
    const bodyBuf = Buffer.from(bodyStr, 'utf8');

    const options = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : (isSecure ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': bodyBuf.length,
      },
    };

    const req = mod.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', (c: Buffer) => { errBody += c.toString(); });
        res.on('end', () => {
          onChunk({ id: streamId, delta: '', done: true, error: httpError(res.statusCode ?? 0, errBody) });
          resolve();
        });
        return;
      }

      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            onChunk({ id: streamId, delta: '', done: true });
            return;
          }
          if (data) parseLine(data);
        }
      });

      res.on('end', () => {
        onChunk({ id: streamId, delta: '', done: true });
        resolve();
      });

      res.on('error', (err: Error) => {
        onChunk({ id: streamId, delta: '', done: true, error: `NETWORK: ${err.message}` });
        resolve();
      });
    });

    req.on('error', (err: Error) => {
      onChunk({ id: streamId, delta: '', done: true, error: `NETWORK: ${err.message}` });
      resolve();
    });

    req.write(bodyBuf);
    req.end();
  });
}

// ── OpenAI-compatible streaming ────────────────────────────────────────────────

async function streamOpenAICompat(
  messages: LLMMessage[],
  settings: LLMSettings,
  streamId: string,
  onChunk: ChunkCallback,
  cfg: LLMProviderConfig,
): Promise<void> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${settings.apiKey}`,
    ...(cfg.id === 'openrouter'
      ? { 'HTTP-Referer': 'https://isgrace.app', 'X-Title': 'isGrace' }
      : {}),
  };

  const body = JSON.stringify({
    model: settings.model,
    messages,
    stream: true,
    temperature: settings.temperature,
    max_tokens: 4096,
  });

  await streamViaNode(cfg.chatURL, headers, body, streamId, onChunk, (data) => {
    try {
      const parsed = JSON.parse(data) as {
        choices: Array<{ delta: { content?: string }; finish_reason?: string }>;
      };
      const delta = parsed.choices[0]?.delta?.content ?? '';
      if (delta) onChunk({ id: streamId, delta, done: false });
      if (parsed.choices[0]?.finish_reason === 'stop') {
        onChunk({ id: streamId, delta: '', done: true });
      }
    } catch { /* skip malformed chunk */ }
  });
}

// ── Anthropic native streaming ─────────────────────────────────────────────────

async function streamAnthropicNative(
  messages: LLMMessage[],
  settings: LLMSettings,
  streamId: string,
  onChunk: ChunkCallback,
  cfg: LLMProviderConfig,
): Promise<void> {
  const systemContent = messages.find(m => m.role === 'system')?.content;
  const convoMessages = messages.filter(m => m.role !== 'system');

  const headers: Record<string, string> = {
    'x-api-key': settings.apiKey,
    'anthropic-version': '2023-06-01',
  };

  const body = JSON.stringify({
    model: settings.model,
    max_tokens: 4096,
    stream: true,
    temperature: settings.temperature,
    ...(systemContent ? { system: systemContent } : {}),
    messages: convoMessages,
  });

  await streamViaNode(cfg.chatURL, headers, body, streamId, onChunk, (data) => {
    try {
      const parsed = JSON.parse(data) as {
        type: string;
        delta?: { type: string; text?: string };
      };
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        const text = parsed.delta.text ?? '';
        if (text) onChunk({ id: streamId, delta: text, done: false });
      }
      if (parsed.type === 'message_stop') {
        onChunk({ id: streamId, delta: '', done: true });
      }
    } catch { /* skip malformed chunk */ }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function streamChat(
  messages: LLMMessage[],
  settings: LLMSettings,
  streamId: string,
  onChunk: ChunkCallback,
): Promise<void> {
  if (!settings.apiKey) {
    onChunk({ id: streamId, delta: '', done: true, error: 'NO_API_KEY' });
    return;
  }

  const cfg = getProviderConfig(settings);

  if (cfg.apiFormat === 'anthropic') {
    return streamAnthropicNative(messages, settings, streamId, onChunk, cfg);
  }
  return streamOpenAICompat(messages, settings, streamId, onChunk, cfg);
}

/** Non-streaming call — collects all chunks and returns the full text. */
export async function completeChat(
  messages: LLMMessage[],
  settings: LLMSettings,
): Promise<string> {
  return new Promise((resolve) => {
    let fullText = '';
    const id = `complete_${Date.now()}`;
    streamChat(messages, settings, id, (chunk) => {
      if (chunk.error) { resolve(''); return; }
      if (!chunk.done) { fullText += chunk.delta; }
      else { resolve(fullText); }
    });
  });
}

/**
 * Quick connectivity test — uses lightweight auth/models endpoints.
 * Uses Node.js https.get so it works reliably in Electron's main process.
 */
export async function testConnection(settings: LLMSettings): Promise<{ ok: boolean; error?: string }> {
  const cfg = getProviderConfig(settings);

  try {
    let response: Response;

    if (cfg.id === 'openrouter') {
      response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${settings.apiKey}` },
      });
    } else if (cfg.apiFormat === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
      });
    } else if (cfg.id === 'openai') {
      response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${settings.apiKey}` },
      });
    } else {
      response = await fetch(cfg.chatURL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
      });
    }

    if (response.ok) return { ok: true };
    if (response.status === 401) return { ok: false, error: 'Invalid API key' };
    if (response.status === 402) return { ok: false, error: 'Insufficient credits' };
    if (response.status === 403) return { ok: false, error: 'Access denied — check your API key permissions' };
    if (response.status === 429) return { ok: false, error: 'Rate limited — please wait a moment' };
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    return { ok: false, error: `HTTP ${response.status}${body ? ': ' + body.slice(0, 120) : ''}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg };
  }
}
