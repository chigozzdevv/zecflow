import axios, { AxiosInstance } from 'axios';
import { envConfig } from '@/config/env';

export type ZcashPrivacyPolicy =
  | 'FullPrivacy'
  | 'LegacyCompat'
  | 'AllowRevealedAmounts'
  | 'AllowRevealedRecipients'
  | 'AllowRevealedSenders'
  | 'AllowFullyTransparent'
  | 'AllowLinkingAccountAddresses'
  | 'NoPrivacy';

export type ViewingKeyRescanMode = 'yes' | 'no' | 'whenkeyisnew';

interface SendShieldedTransactionOptions {
  fromAddress?: string;
  memo?: string;
  minConfirmations?: number;
  fee?: number | null;
  privacyPolicy?: ZcashPrivacyPolicy;
  timeoutMs?: number;
}

class ZcashService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: envConfig.ZCASH_RPC_URL,
      auth: envConfig.ZCASH_RPC_USER
        ? { username: envConfig.ZCASH_RPC_USER, password: envConfig.ZCASH_RPC_PASSWORD ?? '' }
        : undefined,
    });
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    try {
      const { data } = await this.client.post('', {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      });

      if (data.error) {
        throw new Error(data.error?.message ?? 'Unknown RPC error');
      }
      return data.result as T;
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Zcash RPC ${method} failed: ${error.message}`;
        throw error;
      }
      throw new Error(`Zcash RPC ${method} failed`);
    }
  }

  private encodeMemo(memo: string): string {
    const memoBuffer = Buffer.from(memo, 'utf8');
    const target = Buffer.alloc(512);
    memoBuffer.copy(target, 0, 0, Math.min(memoBuffer.length, 512));
    return target.toString('hex');
  }

  private normalizeAmount(amount: number | string): number {
    const raw =
      typeof amount === 'number'
        ? Number.isFinite(amount)
          ? amount.toString()
          : (() => {
              throw new Error('Amount must be a finite number');
            })()
        : amount.trim();

    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      throw new Error('Amount must be a numeric string or number');
    }

    const negative = raw.startsWith('-');
    const sanitized = negative ? raw.slice(1) : raw;
    const [whole, fraction = ''] = sanitized.split('.');
    const fracPadded = (fraction + '00000000').slice(0, 8);
    const multiplier = 10n ** 8n;
    const wholeValue = whole.length ? BigInt(whole) * multiplier : 0n;
    const fractionalValue = fracPadded.length ? BigInt(fracPadded) : 0n;
    const total = negative ? -(wholeValue + fractionalValue) : wholeValue + fractionalValue;
    return Number(total) / 1e8;
  }

  async sendShieldedTransaction(
    address: string,
    amount: number | string,
    { memo, fromAddress, minConfirmations, fee, privacyPolicy, timeoutMs }: SendShieldedTransactionOptions = {},
  ): Promise<{ txId: string; operationId: string }> {
    const sourceAddress = fromAddress ?? envConfig.ZCASH_DEFAULT_FROM_ADDRESS;
    if (!sourceAddress) {
      throw new Error('Zcash source address is not configured');
    }

    const recipient: Record<string, unknown> = {
      address,
      amount: this.normalizeAmount(amount),
    };

    if (memo && memo.length > 0) {
      recipient.memo = this.encodeMemo(memo);
    }

    const params: unknown[] = [
      sourceAddress,
      [recipient],
      minConfirmations ?? 10,
      fee ?? null,
      privacyPolicy ?? envConfig.ZCASH_DEFAULT_PRIVACY_POLICY ?? 'LegacyCompat',
    ];

    const operationId = await this.call<string>('z_sendmany', params);
    const txId = await this.waitForOperation(operationId, timeoutMs ?? envConfig.ZCASH_OPERATION_TIMEOUT_MS);
    return { txId, operationId };
  }

  private async waitForOperation(operationId: string, timeoutMs: number, pollIntervalMs = 5_000): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const [status] = await this.call<Array<{ id: string; status: string; result?: { txid?: string }; error?: { message?: string } }>>(
        'z_getoperationstatus',
        [[operationId]],
      );

      if (status) {
        if (status.status === 'success') {
          const [result] = await this.call<Array<{ result: { txid: string } }>>('z_getoperationresult', [[operationId]]);
          const txId = result?.result?.txid ?? status.result?.txid;
          if (!txId) {
            throw new Error('Zcash operation succeeded without txid');
          }
          return txId;
        }
        if (status.status === 'failed') {
          await this.call('z_getoperationresult', [[operationId]]);
          throw new Error(status.error?.message ?? `Zcash operation ${operationId} failed`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Timed out waiting for Zcash operation ${operationId}`);
  }

  async importViewingKey(viewingKey: string, rescanMode: ViewingKeyRescanMode = 'whenkeyisnew', startHeight?: number) {
    const params: unknown[] = [viewingKey, rescanMode];
    if (typeof startHeight === 'number') {
      params.push(startHeight);
    }
    return this.call('z_importviewingkey', params);
  }
}

export const zcashService = new ZcashService();
