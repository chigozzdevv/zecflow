import axios, { AxiosInstance } from 'axios';
import { envConfig } from '@/config/env';

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
    const { data } = await this.client.post('', {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    });
    return data.result;
  }

  private encodeMemo(memo: string): string {
    const buf = Buffer.from(memo, 'utf8');
    const truncated = buf.length > 512 ? buf.subarray(0, 512) : buf;
    return truncated.toString('hex');
  }

  async sendShieldedTransaction(address: string, amount: number, memo?: string): Promise<string> {
    const recipient: Record<string, unknown> = { address, amount };
    if (memo && memo.length > 0) {
      recipient.memo = this.encodeMemo(memo);
    }
    return this.call('z_sendmany', ['', [recipient]]);
  }
}

export const zcashService = new ZcashService();
