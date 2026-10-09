import { arxivPdfUrl, normalizeArxivUrl } from './arxiv-url';

describe('normalizeArxivUrl', () => {
  it('maps pdf and html paths to abs', () => {
    expect(normalizeArxivUrl('https://arxiv.org/pdf/2510.14133')).toBe(
      'https://arxiv.org/abs/2510.14133',
    );
    expect(normalizeArxivUrl('https://arxiv.org/html/2510.14133')).toBe(
      'https://arxiv.org/abs/2510.14133',
    );
  });

  it('keeps abs and non-arxiv urls', () => {
    expect(normalizeArxivUrl('https://arxiv.org/abs/2510.14133')).toBe(
      'https://arxiv.org/abs/2510.14133',
    );
    expect(normalizeArxivUrl('https://example.com/a.pdf')).toBe(
      'https://example.com/a.pdf',
    );
  });
});

describe('arxivPdfUrl', () => {
  it('builds absolute pdf url from abs/html/pdf links', () => {
    expect(arxivPdfUrl('https://arxiv.org/abs/2510.14133')).toBe(
      'https://arxiv.org/pdf/2510.14133',
    );
    expect(arxivPdfUrl('https://arxiv.org/html/2510.14133v1')).toBe(
      'https://arxiv.org/pdf/2510.14133v1',
    );
  });
});
