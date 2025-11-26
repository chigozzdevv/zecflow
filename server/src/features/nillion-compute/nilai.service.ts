import axios from 'axios';
import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

const AVAILABLE_MODELS = [
  'google/gemma-3-27b-it',
  'openai/gpt-oss-20b',
  'meta-llama/Llama-3.1-8B-Instruct',
] as const;

type NilAIModel = (typeof AVAILABLE_MODELS)[number];
type NilaiModule = {
  NilaiOpenAIClient: new (...args: any[]) => any;
  NilAuthInstance: { SANDBOX: string; PRODUCTION: string };
};

interface NilAIResult {
  message: string;
  signature?: string;
  verifyingKey?: string;
  attestation?: Record<string, unknown>;
  raw: unknown;
  result: string;
}

class NilAIService {
  private client?: InstanceType<NilaiModule['NilaiOpenAIClient']>;
  private readonly defaultModel: NilAIModel = 'google/gemma-3-27b-it';
  private readonly configured: boolean;
  private attestationCache?: { value: Record<string, unknown>; expiresAt: number };
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private nilaiModulePromise?: Promise<NilaiModule>;

  constructor() {
    this.configured = Boolean(envConfig.NILAI_API_KEY && envConfig.NILAI_BASE_URL);
    if (!this.configured) {
      logger.warn('NilAI client not configured. Set NILAI_API_KEY and NILAI_BASE_URL to enable NilAI blocks.');
    }
  }

  private async loadNilaiModule(): Promise<NilaiModule> {
    if (!this.nilaiModulePromise) {
      this.nilaiModulePromise = import('@nillion/nilai-ts') as unknown as Promise<NilaiModule>;
    }
    return this.nilaiModulePromise;
  }

  private async ensureClient(): Promise<InstanceType<NilaiModule['NilaiOpenAIClient']>> {
    if (!this.configured || !envConfig.NILAI_API_KEY || !envConfig.NILAI_BASE_URL) {
      throw new Error('NilAI is not configured. Set NILAI_API_KEY and NILAI_BASE_URL in the environment.');
    }

    if (!this.client) {
      const baseURL = envConfig.NILAI_BASE_URL;
      const nilaiModule = await this.loadNilaiModule();
      const nilauthInstance =
        envConfig.NILAI_NILAUTH_INSTANCE === 'production'
          ? nilaiModule.NilAuthInstance.PRODUCTION
          : nilaiModule.NilAuthInstance.SANDBOX;
      this.client = new nilaiModule.NilaiOpenAIClient({
        baseURL,
        apiKey: envConfig.NILAI_API_KEY,
        nilauthInstance,
      });
      logger.info('NilAI client initialized');
    }

    return this.client;
  }

  private normalizeContent(content: any): string {
    if (!content) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry?.type === 'text') {
            return entry.text ?? '';
          }
          if (typeof entry?.text === 'string') {
            return entry.text;
          }
          return '';
        })
        .join(' ')
        .trim();
    }
    if (typeof content === 'object' && typeof content.text === 'string') {
      return content.text;
    }
    return '';
  }

  private async fetchAttestation(): Promise<Record<string, unknown> | undefined> {
    if (!envConfig.NILAI_BASE_URL || !envConfig.NILAI_API_KEY) {
      return undefined;
    }

    if (this.attestationCache && this.attestationCache.expiresAt > Date.now()) {
      return this.attestationCache.value;
    }

    let trimmedBase = envConfig.NILAI_BASE_URL.endsWith('/')
      ? envConfig.NILAI_BASE_URL.slice(0, -1)
      : envConfig.NILAI_BASE_URL;
    if (trimmedBase.endsWith('/v1')) {
      trimmedBase = trimmedBase.slice(0, -3);
    }
    const attestationUrl = `${trimmedBase}/v1/attestation/report`;

    try {
      const { data } = await axios.get(attestationUrl, {
        headers: { Authorization: `Bearer ${envConfig.NILAI_API_KEY}` },
        timeout: 10000,
      });
      this.attestationCache = {
        value: data,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
      return data;
    } catch (error) {
      logger.warn({ err: error }, 'Unable to retrieve NilAI attestation report');
      return undefined;
    }
  }

  async runInference(prompt: string, model?: NilAIModel): Promise<NilAIResult> {
    const selectedModel = model || this.defaultModel;
    if (!AVAILABLE_MODELS.includes(selectedModel as any)) {
      throw new Error(`Invalid model: ${selectedModel}. Available: ${AVAILABLE_MODELS.join(', ')}`);
    }

    try {
      const client = await this.ensureClient();
      const rawResponse: any = await client.chat.completions.create({
        model: selectedModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.7,
      });

      const content = this.normalizeContent(rawResponse?.choices?.[0]?.message?.content);
      if (!content) {
        throw new Error('No response content from NilAI');
      }

      const signature =
        rawResponse?.signature ??
        rawResponse?.signed_content ??
        rawResponse?.metadata?.signature;
      const verifyingKey =
        rawResponse?.verifying_key ?? rawResponse?.metadata?.verifying_key;
      const attestation = await this.fetchAttestation();

      return {
        message: content,
        signature,
        verifyingKey,
        attestation,
        raw: rawResponse,
        result: content,
      };
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('NilAI authentication failed. Check your API key.');
      }

      logger.error({ err: error, response: error.response?.data }, 'NilAI inference failed');
      throw new Error(`NilAI inference failed: ${error.message}`);
    }
  }

  async generateStructured(prompt: string, model?: NilAIModel): Promise<Record<string, any>> {
    const inference = await this.runInference(prompt, model);
    const response = inference.message;

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse structured response from NilAI');
    }

    return {
      response,
      generated: true,
      timestamp: new Date().toISOString(),
      attestation: inference.attestation,
      signature: inference.signature,
      verifyingKey: inference.verifyingKey,
    };
  }

  async listModels(): Promise<any> {
    try {
      const client = await this.ensureClient();
      const data = await client.models.list();
      return data;
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list NilAI models');
      throw error;
    }
  }
}

export const nilaiService = new NilAIService();
