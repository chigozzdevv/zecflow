export interface ConnectorConfig {
  name: string;
  type: string;
  config: Record<string, unknown>;
}
