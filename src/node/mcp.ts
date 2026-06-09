/**
 * Model Context Protocol (MCP) server for pdgkit. Exposes tools to LLM-agent hosts:
 *
 *   - `pdg_validate` validate `.pdg`; returns diagnostics + inferred kind
 *   - `pdg_render`   render `.pdg` to svg / png / jpeg / pdf / pptx (incl. editable pptx)
 *   - `pdg_refs`     reference-sign table (Markdown or CSV)
 *
 * `buildServer()` is separate from the transport so it can be unit-tested.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validate } from './validate';
import { renderToSvg } from './svg';
import { renderToPng, renderToJpeg } from './raster';
import { renderToPdf } from './pdf';
import { renderToPptx } from './pptx';
import { refsToMarkdown, refsToCsv } from '../core/refs';
import { parse } from '../core/parser';

const langSchema = z.enum(['ja', 'en', 'both']).default('ja');

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function buildServer(version = '0.1.2'): McpServer {
  const server = new McpServer({ name: 'pdgkit', version });

  server.registerTool(
    'pdg_validate',
    {
      title: 'Validate PatentDSL',
      description:
        'Validate PatentDSL (.pdg) source. Returns the inferred diagram kind, any ' +
        'declared kind assertion, and all diagnostics (errors/warnings/hints). Run ' +
        'this on AI-generated .pdg and fix until there are no errors before rendering.',
      inputSchema: { source: z.string().describe('.pdg source text') },
    },
    async ({ source }) => textResult(JSON.stringify(validate(source), null, 2)),
  );

  server.registerTool(
    'pdg_render',
    {
      title: 'Render PatentDSL',
      description:
        'Render .pdg to a figure. format: svg | png | jpeg | pdf | pptx. ' +
        'svg returns the SVG text; png/jpeg return an inline image you can view; ' +
        'pdf/pptx are written to a file (pass outPath, otherwise figure.<ext> in the ' +
        'working directory is used). Set editable:true for an editable PowerPoint (pptx). ' +
        'If outPath is given, any format is written there instead of returned inline.',
      inputSchema: {
        source: z.string().describe('.pdg source text'),
        format: z.enum(['svg', 'png', 'jpeg', 'pdf', 'pptx']).default('svg'),
        lang: langSchema,
        editable: z.boolean().default(false).describe('pptx only: editable shapes instead of an image'),
        scale: z.number().min(1).max(16).default(4).describe('raster resolution multiplier (png/jpeg/pptx)'),
        outPath: z.string().optional().describe('absolute file path to write the result to'),
      },
    },
    async ({ source, format, lang, editable, scale, outPath }) => {
      if (format === 'svg') {
        const { svg } = renderToSvg(source, { lang });
        if (outPath) {
          writeFileSync(outPath, svg);
          return textResult(`wrote ${resolve(outPath)}`);
        }
        return textResult(svg);
      }

      if (format === 'png' || format === 'jpeg') {
        const bytes = format === 'png'
          ? await renderToPng(source, { lang, scale })
          : await renderToJpeg(source, { lang, scale });
        if (outPath) {
          writeFileSync(outPath, bytes);
          return textResult(`wrote ${resolve(outPath)} (${bytes.length} bytes)`);
        }
        return {
          content: [{
            type: 'image' as const,
            data: Buffer.from(bytes).toString('base64'),
            mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          }],
        };
      }

      // pdf / pptx — binary; write to a file
      const bytes = format === 'pdf'
        ? await renderToPdf(source, { lang })
        : await renderToPptx(source, { lang, editable, scale });
      const target = resolve(outPath ?? `figure.${format}`);
      writeFileSync(target, bytes);
      return textResult(`wrote ${target} (${bytes.length} bytes)`);
    },
  );

  server.registerTool(
    'pdg_refs',
    {
      title: 'PatentDSL reference-sign table',
      description: 'Produce the reference-sign (符号の説明) table from .pdg source.',
      inputSchema: {
        source: z.string().describe('.pdg source text'),
        format: z.enum(['md', 'csv']).default('md'),
      },
    },
    async ({ source, format }) => {
      const doc = parse(source);
      return textResult(format === 'csv' ? refsToCsv(doc) : refsToMarkdown(doc));
    },
  );

  return server;
}
