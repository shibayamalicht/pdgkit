#!/usr/bin/env node
/**
 * pdgkit command-line interface — the language-agnostic integration surface: any
 * host can drive pdgkit by spawning it as a subprocess. JS/TS hosts can also import
 * the library directly (see `src/index.ts`). Run `pdgkit help` for usage.
 */

import fs from 'node:fs';
import {
  renderToSvg,
  validate,
  refsToMarkdown,
  refsToCsv,
  parse,
  SAMPLES,
  SAMPLE_ORDER,
  VERSION,
  renderToPng,
  renderToJpeg,
  renderToPdf,
  renderToPptx,
  loadAuthoringGuide,
} from '../src/index';
import type { Lang, Diagnostic, SampleId } from '../src/index';

interface ParsedArgs {
  positionals: string[];
  opts: Map<string, string | true>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const opts = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--out') {
      opts.set('out', args[++i] ?? '');
    } else if (a.startsWith('--no-')) {
      // `--no-crop` sets key `crop` to the string 'false'.
      opts.set(a.slice(5), 'false');
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        opts.set(a.slice(2, eq), a.slice(eq + 1));
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          opts.set(a.slice(2), next);
          i++;
        } else {
          opts.set(a.slice(2), true);
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, opts };
}

function fail(message: string, code = 1): never {
  process.stderr.write(`pdgkit: ${message}\n`);
  process.exit(code);
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function resolveSource(positional: string | undefined, opts: Map<string, string | true>): string {
  const sample = opts.get('sample');
  if (typeof sample === 'string') {
    if (!(SAMPLE_ORDER as readonly string[]).includes(sample)) {
      fail(`unknown sample "${sample}". Run "pdgkit samples" to list them.`, 2);
    }
    return SAMPLES[sample as SampleId].source;
  }
  if (positional && positional !== '-') {
    try {
      return fs.readFileSync(positional, 'utf8');
    } catch {
      fail(`cannot read file: ${positional}`, 2);
    }
  }
  return readStdin();
}

function getLang(opts: Map<string, string | true>): Lang {
  const lang = opts.get('lang');
  if (lang === 'ja' || lang === 'en' || lang === 'both') return lang;
  if (lang === undefined || lang === true) return 'ja';
  fail(`invalid --lang "${String(lang)}" (expected ja, en, or both)`, 2);
}

function writeOut(opts: Map<string, string | true>, text: string): void {
  const out = opts.get('out');
  if (typeof out === 'string' && out) {
    fs.writeFileSync(out, text, 'utf8');
    process.stderr.write(`pdgkit: wrote ${out}\n`);
  } else {
    process.stdout.write(text.endsWith('\n') ? text : text + '\n');
  }
}

function writeBinary(opts: Map<string, string | true>, bytes: Uint8Array): void {
  const out = opts.get('out');
  if (typeof out !== 'string' || !out) {
    fail('binary output requires -o <file>', 2);
  }
  fs.writeFileSync(out, bytes);
  process.stderr.write(`pdgkit: wrote ${out} (${bytes.length} bytes)\n`);
}

function formatDiagnostic(d: Diagnostic): string {
  const tag =
    d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARN ' : 'INFO ';
  return `  ${tag} line ${d.line}:${d.col}  ${d.message}`;
}

async function cmdRender(args: ParsedArgs): Promise<void> {
  const source = resolveSource(args.positionals[0], args.opts);
  const lang = getLang(args.opts);
  const to = (args.opts.get('to') as string) ?? 'svg';
  const crop = args.opts.get('crop') !== 'false';

  switch (to) {
    case 'svg': {
      const { svg } = renderToSvg(source, { lang, crop });
      writeOut(args.opts, svg);
      return;
    }
    case 'png':
      writeBinary(args.opts, await renderToPng(source, { lang }));
      return;
    case 'jpeg':
    case 'jpg':
      writeBinary(args.opts, await renderToJpeg(source, { lang }));
      return;
    case 'pdf':
      writeBinary(args.opts, await renderToPdf(source, { lang }));
      return;
    case 'pptx':
      writeBinary(args.opts, await renderToPptx(source, { lang, editable: args.opts.get('editable') === true }));
      return;
    default:
      fail(`unknown --to "${to}" (expected svg, png, jpeg, pdf, or pptx)`, 2);
  }
}

function cmdValidate(args: ParsedArgs): void {
  const source = resolveSource(args.positionals[0], args.opts);
  const result = validate(source);

  const lines: string[] = [];
  lines.push(`kind: ${result.kind}${result.declaredKind ? ` (declared: ${result.declaredKind})` : ''}`);
  if (result.diagnostics.length === 0) {
    lines.push('no diagnostics');
  } else {
    for (const d of result.diagnostics) lines.push(formatDiagnostic(d));
  }
  lines.push(
    `summary: ${result.counts.errors} error(s), ${result.counts.warnings} warning(s), ${result.counts.infos} info`,
  );
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(result.ok ? 0 : 1);
}

function cmdRefs(args: ParsedArgs): void {
  const source = resolveSource(args.positionals[0], args.opts);
  const doc = parse(source);
  const format = (args.opts.get('format') as string) ?? 'md';
  if (format === 'md' || format === 'markdown') {
    writeOut(args.opts, refsToMarkdown(doc));
  } else if (format === 'csv') {
    writeOut(args.opts, refsToCsv(doc));
  } else {
    fail(`unknown --format "${format}" (expected md or csv)`, 2);
  }
}

function cmdGuide(): void {
  process.stdout.write(loadAuthoringGuide().replace(/\n*$/, '\n'));
}

function cmdSamples(): void {
  const rows = SAMPLE_ORDER.map((id) => `  ${id.padEnd(16)} ${SAMPLES[id].label} — ${SAMPLES[id].hint}`);
  process.stdout.write(`built-in samples:\n${rows.join('\n')}\n`);
}

const HELP = `pdgkit ${VERSION} — headless engine for the PatentDSL (.pdg) language

usage:
  pdgkit render   <input> [--to svg|png|jpeg|pdf|pptx] [--lang ja|en|both] [-o file] [--no-crop]
  pdgkit validate <input> [--lang ja|en|both]
  pdgkit refs     <input> [--format md|csv] [-o file]
  pdgkit guide
  pdgkit samples
  pdgkit version

<input> is a file path, "-" for stdin, or omitted with --sample <id>.
"pdgkit guide" prints the .pdg authoring guide, so an AI can read it instead of
having it pasted in.

examples:
  pdgkit render fig1.pdg -o fig1.svg
  pdgkit render --sample block --lang both -o block.svg
  cat fig1.pdg | pdgkit validate -
  pdgkit refs fig1.pdg --format csv -o signs.csv
  pdgkit render fig1.pdg --to pdf -o fig1.pdf
  pdgkit render fig1.pdg --to pptx --editable -o fig1.pptx

formats: svg, png, jpeg, pdf, pptx (add --editable for editable PowerPoint shapes).
an MCP server is also available: run \`pdgkit-mcp\`.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = parseArgs(argv.slice(1));

  switch (cmd) {
    case 'render':
      await cmdRender(rest);
      break;
    case 'validate':
      cmdValidate(rest);
      break;
    case 'refs':
      cmdRefs(rest);
      break;
    case 'samples':
      cmdSamples();
      break;
    case 'guide':
      cmdGuide();
      break;
    case 'version':
    case '--version':
    case '-v':
      process.stdout.write(`${VERSION}\n`);
      break;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP + '\n');
      break;
    default:
      fail(`unknown command "${cmd}". Run "pdgkit help".`, 2);
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err), 1);
});
