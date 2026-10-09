import { normalizeArxivUrl } from './form-validate';

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
