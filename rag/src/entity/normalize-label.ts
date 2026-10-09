/** Collapse surface variants so new docs attach to the same node. */
export function normalizeEntityLabel(raw: string): string {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ');
  s = s
    .replace(/\bretrieval augmented generation\b/g, 'rag')
    .replace(/\brag based\b/g, 'rag')
    .replace(/\brag system(s)?\b/g, 'rag')
    .replace(/\brag pipeline\b/g, 'rag')
    .replace(/\brag(\s+rag)+\b/g, 'rag')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}
