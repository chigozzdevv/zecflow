export type CreditOperation =
  | 'workflow-run'
  | 'nillion-compute'
  | 'nillion-block-graph'
  | 'nilai-llm'
  | 'state-store'
  | 'state-read'
  | 'zcash-send'
  | 'connector-request'
  | 'custom-http-action';

export type TransactionType = 'debit' | 'credit';

export interface CreditTransaction {
  organization: string;
  type: TransactionType;
  amount: number;
  operation?: CreditOperation;
  reason?: string;
  balanceAfter: number;
}