export interface ActionConfig {
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
}
