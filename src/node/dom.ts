/** Minimal, zero-dependency SVG DOM shim: the element operations render() needs, plus XML serialization. */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A serializable SVG node. */
export interface SvgNode {
  readonly nodeType: 'element';
  tagName: string;
  namespaceURI: string;
  /** Attributes, in insertion order. */
  attrs: Map<string, string>;
  children: SvgNode[];
  /** Text content, or null when the node has element children. */
  text: string | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  appendChild(child: SvgNode): SvgNode;
  set textContent(value: string);
  get textContent(): string;
}

class ShimElement implements SvgNode {
  readonly nodeType = 'element' as const;
  attrs = new Map<string, string>();
  children: SvgNode[] = [];
  text: string | null = null;

  constructor(public namespaceURI: string, public tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? this.attrs.get(name)! : null;
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  appendChild(child: SvgNode): SvgNode {
    this.text = null;
    this.children.push(child);
    return child;
  }
  set textContent(value: string) {
    this.text = value == null ? '' : String(value);
    this.children = [];
  }
  get textContent(): string {
    if (this.text != null) return this.text;
    return this.children.map((c) => c.textContent).join('');
  }
}

const shimDocument = {
  createElementNS(ns: string, qualifiedName: string): SvgNode {
    return new ShimElement(ns, qualifiedName);
  },
  createElement(tagName: string): SvgNode {
    return new ShimElement(SVG_NS, tagName);
  },
};

let installed = false;

/** Install the shim as `globalThis.document`, unless a real DOM is already present. Idempotent. */
export function installDomShim(): void {
  if (installed) return;
  const existing = (globalThis as { document?: { createElementNS?: unknown } }).document;
  if (!existing || typeof existing.createElementNS !== 'function') {
    (globalThis as { document?: unknown }).document = shimDocument;
  }
  installed = true;
}

/** Run `fn` with the shim installed as `globalThis.document`, restoring the previous value afterward (a real browser's document is left intact). */
export function withShimDocument<T>(fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = shimDocument;
  try {
    return fn();
  } finally {
    g.document = prev;
  }
}

/** Escape a string for use inside an XML attribute value (double-quoted). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape a string for use as XML text content. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Serialize a shim element tree to an XML string (self-closing empty tags, escaped values). */
export function serializeSvg(node: SvgNode): string {
  const attrs = [...node.attrs]
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
  if (node.text != null) {
    return `<${node.tagName}${attrs}>${escapeText(node.text)}</${node.tagName}>`;
  }
  if (node.children.length === 0) {
    return `<${node.tagName}${attrs}/>`;
  }
  const inner = node.children.map(serializeSvg).join('');
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
}
