export type Lang = 'ja' | 'en' | 'both';

export type Bilingual = { ja?: string; en?: string };

export type EdgeOp =
  | 'line'
  | 'arrow'
  | 'bidir'
  | 'dashed'
  | 'dashed-arrow'
  | 'thick';

export type Diagnostic = {
  severity: 'error' | 'warning' | 'info';
  line: number;
  col: number;
  message: string;
};

export type Node = {
  id: string;
  label: Bilingual;
  implicit: boolean;
};

export type Containment = {
  parent: string;
  children: string[];
  line: number;
};

export type Edge = {
  from: string;
  to: string;
  op: EdgeOp;
  label?: Bilingual;
  line: number;
};

export type DiagramKind = 'block' | 'flow' | 'state' | 'seq';

export type Doc = {
  nodes: Map<string, Node>;
  containments: Containment[];
  edges: Edge[];
  diagnostics: Diagnostic[];
  kind: DiagramKind;
};
