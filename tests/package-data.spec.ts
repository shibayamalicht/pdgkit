import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadAuthoringGuide, resolvePackageFile, VERSION } from '../src/node/index';

const pkgVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

describe('bundled package data', () => {
  it('loadAuthoringGuide returns the bundled authoring guide', () => {
    const guide = loadAuthoringGuide();
    expect(guide.length).toBeGreaterThan(1000);
    expect(guide).toContain('PatentDSL');
    expect(guide).toContain('#! kind:');
  });

  it('resolvePackageFile locates bundled files', () => {
    expect(existsSync(resolvePackageFile('assets', 'ipaexg.ttf'))).toBe(true);
    expect(existsSync(resolvePackageFile('docs', 'ai-authoring-guide.md'))).toBe(true);
  });

  it('VERSION matches package.json', () => {
    expect(VERSION).toBe(pkgVersion);
  });
});
