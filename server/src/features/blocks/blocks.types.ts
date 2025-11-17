export type BlockHandlerType = 'logic' | 'nillion' | 'nilai' | 'zcash' | 'connector' | 'notification' | 'storage';

export interface BlockExecutionContext {
  payload: Record<string, unknown>;
  memory: Record<string, unknown>;
}

export type NillionBlockCategory = 'math' | 'comparison' | 'logical' | 'statistical' | 'use_case' | 'control_flow';

export interface NillionBlockInput {
  name: string;
  type: 'u8' | 'u16' | 'u32' | 'u64' | 'bool' | 'array' | 'struct';
  description: string;
  required: boolean;
  default?: any;
  min?: number;
  max?: number;
  arrayLength?: number;
}

export interface NillionBlockOutput {
  name: string;
  type: 'u8' | 'u16' | 'u32' | 'u64' | 'bool' | 'struct';
  description: string;
}

export interface NillionComputeBlock {
  id: string;
  name: string;
  category: NillionBlockCategory;
  description: string;
  inputs: NillionBlockInput[];
  outputs: NillionBlockOutput[];
  icon?: string;
  color?: string;
  examples?: Array<{ name: string; inputs: any; expected: any }>;
  tags?: string[];
}
