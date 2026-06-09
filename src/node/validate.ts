/**
 * Validation for AI authoring: runs the core parser, checks the optional
 * `#! kind: block|flow|state|seq` directive against the kind inferred from
 * structure (mismatch = error), and adds lints for chained connections and
 * unspaced operators. Feed the diagnostics back to the author until no errors remain.
 */

import { parse } from '../core/parser';
import type { Diagnostic, DiagramKind } from '../core/types';

const KINDS: readonly DiagramKind[] = ['block', 'flow', 'state', 'seq'];

const KIND_LABEL_JA: Record<DiagramKind, string> = {
  block: 'ブロック図',
  flow: 'フローチャート',
  state: '状態遷移図',
  seq: 'シーケンス図',
};

export interface ValidateResult {
  /** True when there are no error-severity diagnostics. */
  ok: boolean;
  /** The diagram kind inferred from the source structure. */
  kind: DiagramKind;
  /** The diagram kind the author declared via directive, or null if none. */
  declaredKind: DiagramKind | null;
  /** Whether the declared kind matches the inferred kind (null if not declared). */
  kindMatches: boolean | null;
  /** All diagnostics (parser + pdgkit lints), sorted by line then column. */
  diagnostics: Diagnostic[];
  counts: { errors: number; warnings: number; infos: number };
}

/** Return the comment text after the first unquoted `#`, or null if none. */
function commentOf(line: string): string | null {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === '#') return line.slice(i + 1);
  }
  return null;
}

/** Return the source text with comments stripped (quote-aware), for line lints. */
function uncommented(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === '#') return line.slice(0, i);
  }
  return line;
}

const KIND_DIRECTIVE_RE =
  /^\s*!?\s*(?:pdgkit\s*:)?\s*kind\s*[:=]?\s*(block|flow|state|seq)\b/i;

/** Find the first `kind:` directive in the source, with its line number. */
function findKindDirective(
  lines: string[],
): { kind: DiagramKind; line: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const comment = commentOf(lines[i]);
    if (comment == null) continue;
    const m = comment.match(KIND_DIRECTIVE_RE);
    if (m) return { kind: m[1].toLowerCase() as DiagramKind, line: i + 1 };
  }
  return null;
}

// A connection operator surrounded by whitespace (the only legal form).
const SPACED_OP_RE = /(?:^|\s)(?:<->|=>|->|<-|\.>|\.\.|-)(?:\s|$)/g;
// An operator glued directly to an ID character on either side (illegal).
const GLUED_OP_RE = /[A-Za-z0-9_*](?:<->|<-|->|=>|\.>|\.\.|-)[A-Za-z0-9_*]/;

function countSpacedOps(text: string): number {
  const matches = text.match(SPACED_OP_RE);
  return matches ? matches.length : 0;
}

/**
 * Validate a `.pdg` source string. Pure and synchronous — safe to call in any
 * environment, including a hot AI authoring loop.
 */
export function validate(source: string): ValidateResult {
  const doc = parse(source);
  const diagnostics: Diagnostic[] = [...doc.diagnostics];
  const lines = source.split(/\r?\n/);

  // Kind assertion: check any declared kind against the inferred kind.
  const directive = findKindDirective(lines);
  const declaredKind = directive ? directive.kind : null;
  let kindMatches: boolean | null = null;
  if (directive) {
    kindMatches = directive.kind === doc.kind;
    if (!kindMatches) {
      diagnostics.push({
        severity: 'error',
        line: directive.line,
        col: 1,
        message:
          `図種アサーション不一致: 宣言=${KIND_LABEL_JA[directive.kind]}(${directive.kind})` +
          ` だが推論=${KIND_LABEL_JA[doc.kind]}(${doc.kind})。` +
          `構造(包含「:」/ 末尾「?」/ 符号「*」/ 往復・「<->」)を見直すか、宣言を修正してください。`,
      });
    }
  }

  // Friendly lints: when the parser flags a line as 構文不明, add a specific hint
  // for known anti-patterns (chained connections, unspaced operators).
  const unknownLines = new Set(
    doc.diagnostics
      .filter((d) => d.severity === 'error' && d.message.startsWith('構文不明'))
      .map((d) => d.line),
  );
  for (const lineNum of unknownLines) {
    const code = uncommented(lines[lineNum - 1] ?? '').trim();
    if (!code) continue;
    if (countSpacedOps(code) >= 2) {
      diagnostics.push({
        severity: 'info',
        line: lineNum,
        col: 1,
        message:
          '連鎖記法(A -> B -> C)は未対応です。1行に1接続で分割してください(例: A -> B / B -> C)。',
      });
    } else if (GLUED_OP_RE.test(code)) {
      diagnostics.push({
        severity: 'info',
        line: lineNum,
        col: 1,
        message:
          '接続演算子の前後には半角スペースが必要です(例: "11-12" ではなく "11 - 12")。',
      });
    }
  }

  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);

  const counts = {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
  };

  return {
    ok: counts.errors === 0,
    kind: doc.kind,
    declaredKind,
    kindMatches,
    diagnostics,
    counts,
  };
}

export { KINDS };
