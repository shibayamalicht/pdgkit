/**
 * PowerPoint (PPTX / Open XML) packaging: a minimal stored-ZIP writer plus OOXML
 * templates. `buildPptxPackage` embeds the figure as an image;
 * `buildEditablePptxPackage` converts each SVG primitive into an editable shape.
 */

import type { SvgNode } from './dom';
import { computeContentBox, type ViewBox } from './content-box';

export interface PdfFitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SvgViewBox = ViewBox;

interface PptxTransform {
  minX: number;
  minY: number;
  scaleX: number;
  scaleY: number;
  fitX: number;
  fitY: number;
}

interface PptxShapeContext {
  nextId: number;
  tx: PptxTransform;
}

interface PptxLineStyle {
  color: string;
  width: number;
  dash: boolean;
}

const PPTX_SLIDE_W = 12_192_000;
const PPTX_SLIDE_H = 6_858_000;
const PPTX_MARGIN = 457_200;

export function fitRectIntoPage(
  sourceW: number,
  sourceH: number,
  pageW: number,
  pageH: number,
  margin = 10,
): PdfFitRect {
  const usableW = Math.max(1, pageW - margin * 2);
  const usableH = Math.max(1, pageH - margin * 2);
  const scale = Math.min(usableW / sourceW, usableH / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  return { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
}

export function fitRectIntoSlide(
  sourceW: number,
  sourceH: number,
  slideW = PPTX_SLIDE_W,
  slideH = PPTX_SLIDE_H,
  margin = PPTX_MARGIN,
): PdfFitRect {
  return fitRectIntoPage(sourceW, sourceH, slideW, slideH, margin);
}

/** Build an image-based PPTX: one 16:9 slide with the figure PNG centered. */
export function buildPptxPackage(imagePng: Uint8Array, imageW: number, imageH: number): Uint8Array {
  const fit = fitRectIntoSlide(imageW, imageH);
  const iso = new Date().toISOString();
  return createStoredZip([
    ['[Content_Types].xml', contentTypesXml()],
    ['_rels/.rels', rootRelsXml()],
    ['docProps/app.xml', appPropsXml()],
    ['docProps/core.xml', corePropsXml(iso)],
    ['ppt/presentation.xml', presentationXml()],
    ['ppt/_rels/presentation.xml.rels', presentationRelsXml()],
    ['ppt/slides/slide1.xml', slideXml(fit)],
    ['ppt/slides/_rels/slide1.xml.rels', slideRelsXml()],
    ['ppt/slideMasters/slideMaster1.xml', slideMasterXml()],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRelsXml()],
    ['ppt/slideLayouts/slideLayout1.xml', slideLayoutXml()],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRelsXml()],
    ['ppt/theme/theme1.xml', themeXml()],
    ['ppt/media/image1.png', imagePng],
  ]);
}

/** Build an editable PPTX: each SVG primitive becomes a PowerPoint shape. */
export function buildEditablePptxPackage(svgEl: SvgNode): Uint8Array {
  const viewBox = computeContentBox(svgEl);
  const fit = fitRectIntoSlide(viewBox.width, viewBox.height);
  const shapes = editablePptxShapes(svgEl, viewBox, fit);
  const iso = new Date().toISOString();
  return createStoredZip([
    ['[Content_Types].xml', contentTypesXmlEditable()],
    ['_rels/.rels', rootRelsXml()],
    ['docProps/app.xml', appPropsXml()],
    ['docProps/core.xml', corePropsXml(iso)],
    ['ppt/presentation.xml', presentationXml()],
    ['ppt/_rels/presentation.xml.rels', presentationRelsXml()],
    ['ppt/slides/slide1.xml', editableSlideXml(shapes)],
    ['ppt/slides/_rels/slide1.xml.rels', editableSlideRelsXml()],
    ['ppt/slideMasters/slideMaster1.xml', slideMasterXml()],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRelsXml()],
    ['ppt/slideLayouts/slideLayout1.xml', slideLayoutXml()],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRelsXml()],
    ['ppt/theme/theme1.xml', themeXml()],
  ]);
}

/** Recursively collect descendant elements whose tagName is in `tags`. */
function collectElements(root: SvgNode, tags: Set<string>): SvgNode[] {
  const out: SvgNode[] = [];
  const walk = (node: SvgNode): void => {
    if (tags.has(node.tagName.toLowerCase())) out.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

function editablePptxShapes(svgEl: SvgNode, viewBox: SvgViewBox, fit: PdfFitRect): string {
  const ctx: PptxShapeContext = {
    nextId: 2,
    tx: {
      minX: viewBox.minX,
      minY: viewBox.minY,
      scaleX: fit.width / viewBox.width,
      scaleY: fit.height / viewBox.height,
      fitX: fit.x,
      fitY: fit.y,
    },
  };
  const out: string[] = [];
  const elements = collectElements(svgEl, new Set(['rect', 'circle', 'polygon', 'path', 'text', 'line', 'polyline']));
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'rect') out.push(...pptxRect(el, ctx));
    else if (tag === 'circle') out.push(...pptxCircle(el, ctx));
    else if (tag === 'polygon') out.push(...pptxPolygon(el, ctx));
    else if (tag === 'path') out.push(...pptxPath(el, ctx));
    else if (tag === 'line') out.push(...pptxLine(el, ctx));
    else if (tag === 'polyline') out.push(...pptxPolyline(el, ctx));
    else if (tag === 'text') out.push(...pptxText(el, ctx));
  }
  return out.filter(Boolean).join('\n');
}

function pptxRect(el: SvgNode, ctx: PptxShapeContext): string[] {
  const x = numAttr(el, 'x');
  const y = numAttr(el, 'y');
  const w = numAttr(el, 'width');
  const h = numAttr(el, 'height');
  if (w <= 0 || h <= 0) return [];
  const p = mapBox(ctx.tx, x, y, w, h);
  const rx = Math.max(numAttr(el, 'rx'), numAttr(el, 'ry'));
  return [shapeXml(
    ctx.nextId++, 'rect', p.x, p.y, p.w, p.h,
    rx > 0 ? 'roundRect' : 'rect',
    fillXml(colorAttr(el, 'fill', 'none')),
    lineXml(lineStyleFromElement(el, ctx.tx)),
  )];
}

function pptxCircle(el: SvgNode, ctx: PptxShapeContext): string[] {
  const cx = numAttr(el, 'cx');
  const cy = numAttr(el, 'cy');
  const r = numAttr(el, 'r');
  if (r <= 0) return [];
  const p = mapBox(ctx.tx, cx - r, cy - r, r * 2, r * 2);
  return [shapeXml(
    ctx.nextId++, 'circle', p.x, p.y, p.w, p.h, 'ellipse',
    fillXml(colorAttr(el, 'fill', '#000')),
    lineXml(lineStyleFromElement(el, ctx.tx)),
  )];
}

function pptxPolygon(el: SvgNode, ctx: PptxShapeContext): string[] {
  const points = parsePoints(el.getAttribute('points'));
  if (points.length < 3) return [];
  return [freeformXml(
    ctx.nextId++, 'polygon',
    points.map((point) => mapPoint(ctx.tx, point[0], point[1])),
    fillXml(colorAttr(el, 'fill', 'none')),
    lineXml(lineStyleFromElement(el, ctx.tx)),
  )];
}

function pptxPath(el: SvgNode, ctx: PptxShapeContext): string[] {
  const points = parsePathPoints(el.getAttribute('d'));
  if (points.length < 2) return [];
  const line = lineStyleFromElement(el, ctx.tx);
  const out: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = mapPoint(ctx.tx, points[i][0], points[i][1]);
    const b = mapPoint(ctx.tx, points[i + 1][0], points[i + 1][1]);
    out.push(connectorXml(ctx.nextId++, 'line', a.x, a.y, b.x, b.y, line));
  }
  return out;
}

function pptxLine(el: SvgNode, ctx: PptxShapeContext): string[] {
  const a = mapPoint(ctx.tx, numAttr(el, 'x1'), numAttr(el, 'y1'));
  const b = mapPoint(ctx.tx, numAttr(el, 'x2'), numAttr(el, 'y2'));
  return [connectorXml(ctx.nextId++, 'line', a.x, a.y, b.x, b.y, lineStyleFromElement(el, ctx.tx))];
}

function pptxPolyline(el: SvgNode, ctx: PptxShapeContext): string[] {
  const points = parsePoints(el.getAttribute('points'));
  if (points.length < 2) return [];
  const line = lineStyleFromElement(el, ctx.tx);
  const out: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = mapPoint(ctx.tx, points[i][0], points[i][1]);
    const b = mapPoint(ctx.tx, points[i + 1][0], points[i + 1][1]);
    out.push(connectorXml(ctx.nextId++, 'line', a.x, a.y, b.x, b.y, line));
  }
  return out;
}

function pptxText(el: SvgNode, ctx: PptxShapeContext): string[] {
  const text = (el.textContent ?? '').trim();
  if (!text) return [];
  const x = numAttr(el, 'x');
  const y = numAttr(el, 'y');
  const fontSize = numAttr(el, 'font-size', 2.8);
  const widthSvg = estimateSvgTextWidth(text, fontSize);
  const heightSvg = fontSize * 1.35;
  const anchor = el.getAttribute('text-anchor') ?? 'start';
  const baseline = el.getAttribute('dominant-baseline') ?? 'alphabetic';
  let left = x;
  if (anchor === 'middle') left -= widthSvg / 2;
  else if (anchor === 'end') left -= widthSvg;
  let top = y - fontSize * 0.95;
  if (baseline === 'middle' || baseline === 'central') top = y - heightSvg / 2;
  const p = mapBox(ctx.tx, left, top, widthSvg, heightSvg);
  const fontPt = Math.max(1, Math.round((fontSize * ctx.tx.scaleY / 12700) * 100) / 100);
  const align = anchor === 'middle' ? 'ctr' : (anchor === 'end' ? 'r' : 'l');
  return [textBoxXml(ctx.nextId++, p.x, p.y, p.w, p.h, text, fontPt, align, colorAttr(el, 'fill', '#000'))];
}

function mapPoint(tx: PptxTransform, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(tx.fitX + (x - tx.minX) * tx.scaleX),
    y: Math.round(tx.fitY + (y - tx.minY) * tx.scaleY),
  };
}

function mapBox(tx: PptxTransform, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const a = mapPoint(tx, x, y);
  return { x: a.x, y: a.y, w: Math.max(1, Math.round(w * tx.scaleX)), h: Math.max(1, Math.round(h * tx.scaleY)) };
}

function numAttr(el: SvgNode, name: string, fallback = 0): number {
  const n = Number.parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function colorAttr(el: SvgNode, name: string, fallback: string): string {
  const value = (el.getAttribute(name) ?? fallback).trim();
  if (!value || value === 'none' || value === 'transparent') return 'none';
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (/^[0-9a-f]{3}$/i.test(hex)) return hex.split('').map((c) => c + c).join('').toUpperCase();
    if (/^[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  }
  if (value.toLowerCase() === 'white') return 'FFFFFF';
  if (value.toLowerCase() === 'black') return '000000';
  return fallback === 'none' ? 'none' : '000000';
}

function lineStyleFromElement(el: SvgNode, tx: PptxTransform): PptxLineStyle | null {
  const stroke = colorAttr(el, 'stroke', 'none');
  if (stroke === 'none') return null;
  const svgWidth = numAttr(el, 'stroke-width', 0.4);
  const width = Math.max(1270, Math.round(svgWidth * (tx.scaleX + tx.scaleY) / 2));
  return { color: stroke, width, dash: !!el.getAttribute('stroke-dasharray') };
}

function parsePoints(raw: string | null): [number, number][] {
  if (!raw) return [];
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function parsePathPoints(raw: string | null): [number, number][] {
  if (!raw) return [];
  const nums = raw.replace(/[MLZ]/gi, ' ').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function estimateSvgTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') width += fontSize * 0.35;
    else if (char.charCodeAt(0) <= 0x7f) width += fontSize * 0.58;
    else width += fontSize;
  }
  return Math.max(fontSize * 2.2, width + fontSize * 0.8);
}

function shapeXml(id: number, name: string, x: number, y: number, w: number, h: number, preset: string, fill: string, line: string): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="${xmlAttr(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>
</p:sp>`;
}

function connectorXml(id: number, name: string, x1: number, y1: number, x2: number, y2: number, line: PptxLineStyle | null): string {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));
  const flipH = x2 < x1 ? ' flipH="1"' : '';
  const flipV = y2 < y1 ? ' flipV="1"' : '';
  return `<p:cxnSp>
<p:nvCxnSpPr><p:cNvPr id="${id}" name="${xmlAttr(name)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
<p:spPr><a:xfrm${flipH}${flipV}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom>${lineXml(line)}</p:spPr>
</p:cxnSp>`;
}

function freeformXml(id: number, name: string, points: { x: number; y: number }[], fill: string, line: string): string {
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const right = Math.max(...points.map((p) => p.x));
  const bottom = Math.max(...points.map((p) => p.y));
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);
  const local = points.map((p) => ({ x: p.x - left, y: p.y - top }));
  const first = local[0];
  const rest = local.slice(1).map((p) => `<a:lnTo><a:pt x="${p.x}" y="${p.y}"/></a:lnTo>`).join('');
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="${xmlAttr(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${left}" y="${top}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}"><a:moveTo><a:pt x="${first.x}" y="${first.y}"/></a:moveTo>${rest}<a:close/></a:path></a:pathLst></a:custGeom>${fill}${line}</p:spPr>
</p:sp>`;
}

function textBoxXml(id: number, x: number, y: number, w: number, h: number, text: string, fontPt: number, align: string, color: string): string {
  const sz = Math.max(100, Math.round(fontPt * 100));
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${id}" name="text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr wrap="none" anchor="ctr" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="ja-JP" sz="${sz}" dirty="0">${fillXml(color)}</a:rPr><a:t>${xmlText(text)}</a:t></a:r></a:p></p:txBody>
</p:sp>`;
}

function fillXml(color: string): string {
  return color === 'none' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${xmlAttr(color)}"/></a:solidFill>`;
}

function lineXml(line: PptxLineStyle | null): string {
  if (!line) return '<a:ln><a:noFill/></a:ln>';
  const dash = line.dash ? '<a:prstDash val="dash"/>' : '<a:prstDash val="solid"/>';
  return `<a:ln w="${line.width}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${xmlAttr(line.color)}"/></a:solidFill>${dash}</a:ln>`;
}

function xmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlAttr(text: string): string {
  return xmlText(text).replace(/"/g, '&quot;');
}

// Minimal stored (uncompressed) ZIP writer.

function createStoredZip(entries: [string, string | Uint8Array][]): Uint8Array {
  const encoder = new TextEncoder();
  const files = entries.map(([name, data]) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    return { name, nameBytes: encoder.encode(name), bytes, crc: crc32(bytes) };
  });
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const local = zipLocalHeader(file.nameBytes, file.bytes, file.crc);
    chunks.push(local, file.nameBytes, file.bytes);
    central.push(zipCentralHeader(file.nameBytes, file.bytes, file.crc, offset), file.nameBytes);
    offset += local.length + file.nameBytes.length + file.bytes.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  return concatBytes([...chunks, ...central, zipEndRecord(files.length, centralSize, centralOffset)]);
}

function zipLocalHeader(name: Uint8Array, data: Uint8Array, crc: number): Uint8Array {
  const out = new Uint8Array(30);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  return out;
}

function zipCentralHeader(name: Uint8Array, data: Uint8Array, crc: number, offset: number): Uint8Array {
  const out = new Uint8Array(46);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return out;
}

function zipEndRecord(entries: number, centralSize: number, centralOffset: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entries, true);
  view.setUint16(10, entries, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// OOXML templates.

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
}

/** Content types for the editable variant (no embedded PNG part). */
function contentTypesXmlEditable(): string {
  return contentTypesXml().replace('<Default Extension="png" ContentType="image/png"/>\n', '');
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function appPropsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>pdgkit</Application>
<PresentationFormat>Widescreen</PresentationFormat>
<Slides>1</Slides>
<Notes>0</Notes>
<HiddenSlides>0</HiddenSlides>
</Properties>`;
}

function corePropsXml(iso: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>pdgkit figure</dc:title>
<dc:creator>pdgkit</dc:creator>
<cp:lastModifiedBy>pdgkit</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

function presentationXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
<p:defaultTextStyle/>
</p:presentation>`;
}

function presentationRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;
}

function slideXml(fit: PdfFitRect): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="pdgkit">
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/><a:chOff x="0" y="0"/><a:chExt cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/></a:xfrm></p:grpSpPr>
<p:pic>
<p:nvPicPr><p:cNvPr id="2" name="figure.png"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="${Math.round(fit.x)}" y="${Math.round(fit.y)}"/><a:ext cx="${Math.round(fit.width)}" cy="${Math.round(fit.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function slideRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
}

function editableSlideXml(shapes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="pdgkit">
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/><a:chOff x="0" y="0"/><a:chExt cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/></a:xfrm></p:grpSpPr>
${shapes}
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function editableSlideRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/><a:chOff x="0" y="0"/><a:chExt cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`;
}

function slideMasterRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function slideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/><a:chOff x="0" y="0"/><a:chExt cx="${PPTX_SLIDE_W}" cy="${PPTX_SLIDE_H}"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

function slideLayoutRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="pdgkit">
<a:themeElements>
<a:clrScheme name="pdgkit"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="000000"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="0B5FFF"/></a:accent1><a:accent2><a:srgbClr val="666666"/></a:accent2><a:accent3><a:srgbClr val="999999"/></a:accent3><a:accent4><a:srgbClr val="CCCCCC"/></a:accent4><a:accent5><a:srgbClr val="333333"/></a:accent5><a:accent6><a:srgbClr val="111111"/></a:accent6><a:hlink><a:srgbClr val="0B5FFF"/></a:hlink><a:folHlink><a:srgbClr val="0B5FFF"/></a:folHlink></a:clrScheme>
<a:fontScheme name="pdgkit"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="pdgkit"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements>
<a:objectDefaults/>
<a:extraClrSchemeLst/>
</a:theme>`;
}
