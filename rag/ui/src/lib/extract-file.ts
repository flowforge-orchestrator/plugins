/** Client-side file → plain text for RAG index form. */

const TEXT_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'xml',
  'html',
  'htm',
  'rtf',
  'log',
]);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

async function readAsText(file: File): Promise<string> {
  return await file.text();
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import(
    /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/+esm'
  );
  const data = new Uint8Array(await file.arrayBuffer());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjs as any;
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  }
  const doc = await lib.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = (content.items as Array<{ str?: string }>)
      .map((it) => it.str ?? '')
      .join(' ');
    if (line.trim()) parts.push(line);
  }
  return parts.join('\n\n').trim();
}

async function extractDocx(file: File): Promise<string> {
  const JSZip = (
    await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
  ).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('DOCX без word/document.xml');
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractZip(
  file: File,
  onPart?: (name: string) => void,
): Promise<{ text: string; parts: string[] }> {
  const JSZip = (
    await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
  ).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parts: string[] = [];
  const names: string[] = [];
  const entries = Object.keys(zip.files).sort();
  for (const name of entries) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const base = name.split('/').pop() || name;
    if (base.startsWith('.')) continue;
    const fake = new File([await entry.async('blob')], base, {
      type: 'application/octet-stream',
    });
    try {
      const text = await extractOne(fake);
      if (text.trim().length < 40) continue;
      onPart?.(base);
      names.push(base);
      parts.push(`# ${base}\n\n${text}`);
    } catch {
      // skip unsupported members
    }
  }
  if (!parts.length) throw new Error('В ZIP нет извлекаемых документов');
  return { text: parts.join('\n\n---\n\n'), parts: names };
}

function imageStub(file: File, caption: string): string {
  const cap = caption.trim();
  return [
    `[image] ${file.name}`,
    `mime: ${file.type || 'unknown'}`,
    `size: ${file.size}`,
    cap ? `caption: ${cap}` : 'caption: (нет)',
  ].join('\n');
}

export type ExtractResult = {
  text: string;
  label: string;
  members?: string[];
};

export async function extractFileToText(
  file: File,
  opts?: { imageCaption?: string },
): Promise<ExtractResult> {
  const ext = extOf(file.name);
  const mime = (file.type || '').toLowerCase();

  if (TEXT_EXT.has(ext) || mime.startsWith('text/')) {
    return { text: await readAsText(file), label: file.name };
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    const text = await extractPdf(file);
    if (!text) throw new Error('PDF без текстового слоя');
    return { text, label: file.name };
  }
  if (
    ext === 'docx' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { text: await extractDocx(file), label: file.name };
  }
  if (ext === 'doc') {
    throw new Error('Формат .doc не поддерживается — сохраните как .docx или PDF');
  }
  if (ext === 'zip' || mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    const { text, parts } = await extractZip(file);
    return { text, label: file.name, members: parts };
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return {
      text: imageStub(file, opts?.imageCaption ?? ''),
      label: file.name,
    };
  }
  throw new Error(`Неподдерживаемый тип: ${file.name}`);
}

export const ACCEPT_ATTR =
  '.txt,.md,.markdown,.pdf,.doc,.docx,.rtf,.zip,.png,.jpg,.jpeg,.webp,.gif,text/plain,application/pdf,application/zip,image/*';
