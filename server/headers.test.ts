import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const all: { key: string; value: string }[] = vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers;
const header = (k: string) => all.find(h => h.key === k)?.value ?? '';

describe('headers sent with every page', () => {
  it('forbid framing, scripts from elsewhere, plugins, and any outside connection', () => {
    const csp = header('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('no-referrer');
  });
  it('still route the API to the function', () => {
    expect(vercel.rewrites).toEqual([{ source: '/api/(.*)', destination: '/api' }]);
  });
});
