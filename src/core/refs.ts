import type { Doc } from './types';

export function refsToMarkdown(doc: Doc): string {
  const ids = sortedIds(doc);
  const lines: string[] = [];
  lines.push('## 符号の説明 / Reference Signs');
  lines.push('');
  lines.push('| 符号 | 名称(日本語) | Name (English) |');
  lines.push('|------|---------------|----------------|');
  for (const id of ids) {
    const n = doc.nodes.get(id)!;
    lines.push(`| ${id} | ${n.label.ja ?? ''} | ${n.label.en ?? ''} |`);
  }
  return lines.join('\n');
}

export function refsToCsv(doc: Doc): string {
  const ids = sortedIds(doc);
  const lines = ['id,ja,en'];
  for (const id of ids) {
    const n = doc.nodes.get(id)!;
    lines.push(`${csv(id)},${csv(n.label.ja ?? '')},${csv(n.label.en ?? '')}`);
  }
  return lines.join('\n');
}

function csv(s: string): string {
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function sortedIds(doc: Doc): string[] {
  const ids = [...doc.nodes.keys()].filter(id => id !== '*');
  return ids.sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}
