export const DEFAULT_DOCUMENT_FILENAME = 'document.txt';

export type ProcessedDocument = {
  filename: string;
  bytes: Buffer;
};

/**
 * Fixed document rules, in order:
 * 1. Drop a leading UTF-8 BOM.
 * 2. Normalize CR LF and CR to LF.
 * 3. Trim trailing spaces and tabs on each line.
 * 4. Collapse consecutive blank lines to one blank line.
 * 5. Trim blank lines at the start and the end.
 * 6. If the text is non-empty, end it with one LF.
 * The result is a new UTF-8 text file. The download name keeps the source
 * stem and uses .txt. A blank source name becomes document.txt. Directory
 * prefixes are removed.
 */
export function applyDocumentRules(
  input: Buffer,
  sourceName?: string,
): ProcessedDocument {
  let text = input.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  const collapsed: string[] = [];
  let previousBlank = false;
  for (const line of lines) {
    const blank = line.length === 0;
    if (blank && previousBlank) continue;
    collapsed.push(line);
    previousBlank = blank;
  }
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift();
  while (
    collapsed.length > 0 &&
    collapsed[collapsed.length - 1] === ''
  ) {
    collapsed.pop();
  }
  const body = collapsed.join('\n');
  const normalized = body.length === 0 ? '' : `${body}\n`;
  return {
    filename: outputFilename(sourceName),
    bytes: Buffer.from(normalized, 'utf8'),
  };
}

function outputFilename(sourceName?: string): string {
  const stem = sourceStem(sourceName);
  return `${stem}.txt`;
}

function sourceStem(sourceName?: string): string {
  const raw = (sourceName ?? '').trim();
  if (!raw) return 'document';
  const base = raw.split(/[/\\]/).pop()?.trim() ?? '';
  const cleaned = base.replace(/^\.+/, '');
  if (!cleaned) return 'document';
  const dot = cleaned.lastIndexOf('.');
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return stem.length > 0 ? stem : 'document';
}
