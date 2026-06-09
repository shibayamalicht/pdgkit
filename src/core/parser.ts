import type { Bilingual, Doc, Edge, EdgeOp, Node } from './types';

const ID_PATTERN = /[A-Za-z0-9_*]+/.source;

const OP_TABLE: { lit: string; kind: EdgeOp; reverse?: boolean }[] = [
  { lit: '<->', kind: 'bidir' },
  { lit: '=>',  kind: 'thick' },
  { lit: '->',  kind: 'arrow' },
  { lit: '<-',  kind: 'arrow', reverse: true },
  { lit: '.>',  kind: 'dashed-arrow' },
  { lit: '..',  kind: 'dashed' },
  { lit: '-',   kind: 'line' },
];

const DEF_RE = new RegExp(`^(${ID_PATTERN})\\s*=(?!>)\\s*(.*)$`);
const CONN_RE = new RegExp(
  `^(${ID_PATTERN})\\s+(<->|=>|->|<-|\\.>|\\.\\.|-)\\s+(${ID_PATTERN})\\s*(?::\\s*(.*))?$`,
);
const CONT_RE = new RegExp(`^(${ID_PATTERN})\\s*:\\s*(.+)$`);

export function parse(source: string): Doc {
  const doc: Doc = {
    nodes: new Map(),
    containments: [],
    edges: [],
    diagnostics: [],
    kind: 'block',
  };

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i]);
    const line = raw.trim();
    if (!line) continue;

    if (handleDef(line, i + 1, doc)) continue;
    if (handleConn(line, i + 1, doc)) continue;
    if (handleCont(line, i + 1, doc)) continue;

    doc.diagnostics.push({
      severity: 'error',
      line: i + 1,
      col: 1,
      message: `構文不明: "${line}"`,
    });
  }

  doc.kind = inferKind(doc);
  return doc;
}

function handleDef(line: string, lineNum: number, doc: Doc): boolean {
  const m = line.match(DEF_RE);
  if (!m) return false;
  const id = m[1];
  const tail = m[2];
  const label = splitBilingual(tail);
  const existing = doc.nodes.get(id);
  if (existing) {
    doc.diagnostics.push({
      severity: 'warning',
      line: lineNum, col: 1,
      message: `符号 "${id}" は再定義されました`,
    });
  }
  doc.nodes.set(id, {
    id,
    label,
    implicit: false,
  });
  return true;
}

function handleConn(line: string, lineNum: number, doc: Doc): boolean {
  const m = line.match(CONN_RE);
  if (!m) return false;
  const opLit = m[2];
  const entry = OP_TABLE.find(o => o.lit === opLit)!;
  const from = entry.reverse ? m[3] : m[1];
  const to   = entry.reverse ? m[1] : m[3];
  const labelText = m[4] ?? '';
  const edge: Edge = {
    from, to, op: entry.kind,
    label: labelText.trim() ? splitBilingual(labelText) : undefined,
    line: lineNum,
  };
  doc.edges.push(edge);
  ensureNode(doc, from);
  ensureNode(doc, to);
  return true;
}

function handleCont(line: string, lineNum: number, doc: Doc): boolean {
  const m = line.match(CONT_RE);
  if (!m) return false;
  const parent = m[1];
  const rest = m[2].trim();
  const children = rest.split(/\s+/).filter(Boolean);
  const idRe = new RegExp(`^${ID_PATTERN}$`);
  for (const c of children) {
    if (!idRe.test(c)) {
      doc.diagnostics.push({
        severity: 'error',
        line: lineNum, col: 1,
        message: `包含の子として不正なトークン: "${c}"`,
      });
      return true;
    }
  }
  doc.containments.push({ parent, children, line: lineNum });
  ensureNode(doc, parent);
  for (const c of children) ensureNode(doc, c);
  return true;
}

function ensureNode(doc: Doc, id: string): Node {
  let n = doc.nodes.get(id);
  if (n) return n;
  n = { id, label: {}, implicit: true };
  doc.nodes.set(id, n);
  return n;
}

export function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === '#') return line.slice(0, i);
  }
  return line;
}

export function splitBilingual(text: string): Bilingual {
  const s = text.trim();
  if (!s) return {};
  const slashIdx = findBilingualSeparator(s);
  if (slashIdx === -1) {
    return { ja: stripQuotes(s) };
  }
  return {
    ja: stripQuotes(s.slice(0, slashIdx).trim()),
    en: stripQuotes(s.slice(slashIdx + 1).trim()),
  };
}

function findBilingualSeparator(s: string): number {
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && s[i] === '/' && isSpace(s[i - 1]) && isSpace(s[i + 1])) return i;
  }
  return -1;
}

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t';
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

function inferKind(doc: Doc): Doc['kind'] {
  if (doc.containments.length > 0) return 'block';
  for (const n of doc.nodes.values()) {
    const ja = n.label.ja ?? '';
    const en = n.label.en ?? '';
    if (ja.endsWith('?') || en.endsWith('?')) return 'flow';
  }
  if (doc.nodes.has('*')) return 'state';
  const pairs = new Set<string>();
  for (const e of doc.edges) {
    if (e.op === 'bidir') return 'seq';
    const fwd = `${e.from}|${e.to}`;
    const rev = `${e.to}|${e.from}`;
    if (pairs.has(rev)) return 'seq';
    pairs.add(fwd);
  }
  return 'flow';
}

export { OP_TABLE };
