/** pdgkit — headless engine for the PatentDSL (.pdg) patent-figure language. Re-exports the pure core pipeline and the browser-free Node renderers; for the dependency-free subset, import from `pdgkit/core`. */

export * from './core';

export {
  renderToSvg,
  validate,
  computeContentBox,
  svgDisplayDimensions,
  installDomShim,
  serializeSvg,
  renderToPng,
  renderToJpeg,
  renderToPdf,
  renderToPptx,
  toSvgString,
  loadAuthoringGuide,
  VERSION,
} from './node';

export type {
  RenderToSvgOptions,
  RenderToSvgResult,
  ValidateResult,
  ViewBox,
  SvgNode,
  RasterOptions,
  PdfOptions,
  PptxOptions,
} from './node';
