export type WorkflowStatus = 'draft' | 'published' | 'paused';

export interface WorkflowNode {
  id: string;
  blockId: string;
  type: 'input' | 'compute' | 'action' | 'output' | 'condition' | 'transform';
  position?: { x: number; y: number };
  data: Record<string, any>;
  alias?: string;
  connector?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
  };
}

export interface ExecutionContext {
  values: Map<string, any>;
  encryptedData?: {
    ciphertexts: Array<Uint8Array | number[]>;
    clientPublicKey: Buffer;
    nonce: Buffer;
  };
}

export interface ExecutionStep {
  nodeId: string;
  blockId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  duration: number;
  status: 'success' | 'failed';
  error?: string;
  nillionJobId?: string;
}

export interface ExecutionResult {
  outputs: Record<string, any>;
  steps: ExecutionStep[];
  duration: number;
  status: 'success' | 'failed';
  error?: string;
}
