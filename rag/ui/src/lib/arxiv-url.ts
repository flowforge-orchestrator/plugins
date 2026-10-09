/** abs / html / pdf arxiv → abs page URL the process can fetch. */
export function normalizeArxivUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return u;
  try {
    const url = new URL(u);
    if (!/arxiv\.org$/i.test(url.hostname) && !/\.arxiv\.org$/i.test(url.hostname)) {
      return u;
    }
    const pdf = url.pathname.match(/\/pdf\/([^/]+?)(?:\.pdf)?\/?$/i);
    if (pdf) {
      url.pathname = `/abs/${pdf[1]}`;
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    const html = url.pathname.match(/\/html\/([^/]+)/i);
    if (html) {
      url.pathname = `/abs/${html[1]}`;
      url.search = '';
      url.hash = '';
      return url.toString();
    }
    return u;
  } catch {
    return u;
  }
}

/** Absolute PDF download URL for the same paper id as an abs/html/pdf link. */
export function arxivPdfUrl(raw: string): string | null {
  const abs = normalizeArxivUrl(raw);
  try {
    const url = new URL(abs);
    if (!/arxiv\.org$/i.test(url.hostname) && !/\.arxiv\.org$/i.test(url.hostname)) {
      return null;
    }
    const m = url.pathname.match(/\/(?:abs|html|pdf)\/([^/]+?)(?:\.pdf)?\/?$/i);
    if (!m) return null;
    return `https://arxiv.org/pdf/${m[1]}`;
  } catch {
    return null;
  }
}
