import https from 'https';
import http from 'http';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
type PdfData = { text: string };
const pdfParse = _require('pdf-parse') as (buf: Buffer) => Promise<PdfData>;
const TurndownService = _require('turndown') as new () => { turndown(html: string): string };

const MAX_CHARS = 120_000; // generous — we explicitly don't want per-material compression

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + '\n\n[… content truncated — file is very large]';
}

// Follow redirects up to 5 hops
function httpGet(urlStr: string, hops = 0): Promise<{ buf: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (hops > 5) { reject(new Error('Too many redirects')); return; }
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; isGrace/1.0)' },
    };
    mod.get(options, (res) => {
      const loc = res.headers['location'];
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
        const next = loc.startsWith('http') ? loc : `${url.protocol}//${url.host}${loc}`;
        httpGet(next, hops + 1).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), contentType: res.headers['content-type'] ?? '' }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() ?? '';
}

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

export interface FetchResult {
  title: string;
  content: string;
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  const { buf, contentType } = await httpGet(url);

  // PDF at URL — pipe through pdf-parse
  if (contentType.includes('application/pdf')) {
    const data = await pdfParse(buf);
    const text = data.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const title = new URL(url).pathname.split('/').pop()?.replace(/\.pdf$/i, '') || url;
    return { title, content: truncate(text) };
  }

  // HTML page
  const html = buf.toString('utf-8');
  const title = extractTitle(html) || new URL(url).hostname;
  const cleaned = stripNoise(html);

  const td = new TurndownService();
  const markdown = td.turndown(cleaned).replace(/\n{3,}/g, '\n\n').trim();

  return { title, content: truncate(markdown) };
}
