import fs from 'fs-extra';
import { createRequire } from 'module';
import mammoth from 'mammoth';

// pdf-parse is CJS-only; its ESM wrapper has no default export — load via createRequire
const _require = createRequire(import.meta.url);
type PdfData = { text: string; numpages: number };
const pdfParse = _require('pdf-parse') as (data: Buffer) => Promise<PdfData>;

const MAX_CHARS = 80_000; // ~20k tokens; smart context trims further per tier

function truncate(text: string, label: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + `\n\n[… ${label} content truncated at ${MAX_CHARS.toLocaleString()} characters]`;
}

export async function parsePDF(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  const text = data.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return truncate(text, 'PDF');
}

export async function parseDOCX(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value.replace(/\n{3,}/g, '\n\n').trim();
  return truncate(text, 'DOCX');
}

export async function parseTXT(filePath: string): Promise<string> {
  const text = (await fs.readFile(filePath, 'utf-8')).trim();
  return truncate(text, 'text');
}
