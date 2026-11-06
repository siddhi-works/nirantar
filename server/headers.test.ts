import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const all: { key: string; value: string }[] = vercel.headers.find((h: { source: string }) => h.source === '/((?!api/).*)').headers;
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
  it('does not put the page policy on API responses, so the browser can show a PDF', () => {
    const api: { key: string; value: string }[] = vercel.headers.find((h: { source: string }) => h.source === '/api/(.*)').headers;
    const csp = api.find(h => h.key === 'Content-Security-Policy')!.value;
    expect(csp).toBe("frame-ancestors 'none'");
    expect(csp).not.toContain('object-src');
    expect(csp).not.toContain('sandbox');
    expect(header('X-Robots-Tag')).toContain('noindex');
  });
  it('gives the function a time limit long enough for a slow scan to be read', () => {
    expect(vercel.functions['api/**/*.ts'].maxDuration).toBe(60);
  });
  it('runs the API as one catch-all function in Mumbai, with the folders it reads at run time', () => {
    expect(vercel.rewrites).toBeUndefined();
    const fn = vercel.functions['api/**/*.ts'];
    expect(fn.regions).toEqual(['bom1']);
    expect(fn.includeFiles).toContain('db/migrations');
    expect(fn.includeFiles).toContain('assets');
  });
});
