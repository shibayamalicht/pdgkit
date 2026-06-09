/**
 * pdgkit core — the pure pipeline. Zero runtime dependencies.
 *
 * `parse()` (source -> Doc) -> `layout()` (Doc -> geometry) -> `render()`
 * (geometry -> SVG element). `render()` is the only DOM touch point, via the
 * ambient `document.createElementNS`.
 */

export { parse, splitBilingual, stripComment, OP_TABLE } from './parser';
export { layout } from './layout';
export { render, chooseLabelPlacement, estimateTextWidth } from './render';
export { refsToMarkdown, refsToCsv } from './refs';
export { SAMPLES, SAMPLE_ORDER } from './samples';
export type { SampleId } from './samples';
export { PATTERN_SOURCE, PATTERN_LABEL } from './patterns';
export type { PatternId } from './patterns';

export type {
  Lang,
  Bilingual,
  EdgeOp,
  Diagnostic,
  Node,
  Containment,
  Edge,
  DiagramKind,
  Doc,
} from './types';

export type {
  Box,
  Shape,
  LaidOutNode,
  LaidOutEdge,
  LaidOut,
} from './layout';

export type { RenderOptions, LabelPlacement } from './render';
