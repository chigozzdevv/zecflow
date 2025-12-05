import axios from 'axios';
import { createHash } from 'crypto';
import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

type NilAIModel = string;
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
  private readonly maxInferenceAttempts = 3;

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
      const client = await this.ensureClient();
      let invocationToken: string | undefined;
      const tokenFactory = (client as Record<string, any>)._getInvocationToken;

      if (typeof tokenFactory === 'function') {
        try {
          invocationToken = await tokenFactory.call(client);
        } catch (tokenErr) {
          logger.warn({ err: tokenErr }, 'NilAI attestation token generation failed, falling back to API key');
        }
      }

      const bearer = invocationToken ?? envConfig.NILAI_API_KEY;
      if (!bearer) {
        return undefined;
      }

      const { data } = await axios.get(attestationUrl, {
        headers: { Authorization: `Bearer ${bearer}` },
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
    let attempt = 0;
    let lastError: any;

    while (attempt < this.maxInferenceAttempts) {
      attempt += 1;
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
        const sanitizedAttestation = attestation ? this.summarizeAttestation(attestation) : undefined;
        const sanitizedRaw = this.summarizeRawResponse(rawResponse);

        return {
          message: content,
          signature,
          verifyingKey,
          attestation: sanitizedAttestation,
          raw: sanitizedRaw,
          result: content,
        };
      } catch (error: any) {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          throw new Error('NilAI authentication failed. Check your API key.');
        }

        lastError = error;
        if (this.isTransientNilaiError(error) && attempt < this.maxInferenceAttempts) {
          logger.warn({ err: error, attempt }, 'NilAI inference transient failure, retrying');
          this.resetNilaiClient();
          await this.delay(attempt * 500);
          continue;
        }

        logger.error({ err: error, response: error?.response?.data }, 'NilAI inference failed');
        throw new Error(`NilAI inference failed: ${error?.message ?? 'unknown error'}`);
      }
    }

    logger.error({ err: lastError }, 'NilAI inference exhausted retries');
    throw new Error(`NilAI inference failed: ${lastError?.message ?? 'unknown error'}`);
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

  private resetNilaiClient(): void {
    this.client = undefined;
  }

  private isTransientNilaiError(error: any): boolean {
    if (!error) {
      return false;
    }
    if (error._tag === 'NilauthUnreachable' || error.name === 'NilauthUnreachable') {
      return true;
    }
    const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
    if (code === 'etimedout' || code === 'econntimedout') {
      return true;
    }
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
    return message.includes('fetch failed') || message.includes('timeout') || message.includes('network');
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private summarizeAttestation(attestation: Record<string, unknown>): Record<string, unknown> {
    const cpu = typeof attestation.cpu_attestation === 'string' ? attestation.cpu_attestation : undefined;
    const gpu = typeof attestation.gpu_attestation === 'string' ? attestation.gpu_attestation : undefined;
    const hash = (value: string | undefined) => (value ? createHash('sha256').update(value).digest('hex') : undefined);

    let reportOrigin: string | undefined;
    if (envConfig.NILAI_BASE_URL) {
      const trimmed = envConfig.NILAI_BASE_URL.replace(/\/+$/, '');
      if (/\/v1$/i.test(trimmed)) {
        reportOrigin = `${trimmed}/attestation/report`;
      } else {
        reportOrigin = `${trimmed}/v1/attestation/report`;
      }
    }

    return {
      nonce: typeof attestation.nonce === 'string' ? attestation.nonce : undefined,
      verifying_key: typeof attestation.verifying_key === 'string' ? attestation.verifying_key : undefined,
      cpu_attestation_hash: hash(cpu),
      cpu_attestation_preview: cpu?.slice(0, 96),
      gpu_attestation_hash: hash(gpu),
      gpu_attestation_preview: gpu?.slice(0, 96),
      has_full_report: Boolean(cpu || gpu),
      report_source: '/api/demo/medical-attestation',
      report_origin: reportOrigin,
    };
  }

  private summarizeRawResponse(raw: any): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }

    const firstChoice = Array.isArray(raw.choices) ? raw.choices[0] : undefined;
    return {
      id: raw.id,
      model: raw.model,
      created: raw.created,
      usage: raw.usage,
      finish_reason: firstChoice?.finish_reason,
      service_tier: raw.service_tier,
      signed: Boolean(raw.signature ?? raw.signed_content ?? raw.metadata?.signature),
    };
  }

  public async getAttestationReport(): Promise<Record<string, unknown> | undefined> {
    return this.fetchAttestation();
  }

  public async getAttestationSummary(): Promise<Record<string, unknown> | undefined> {
    const report = await this.fetchAttestation();
    if (!report) {
      return undefined;
    }
    return this.summarizeAttestation(report);
  }
}

export const nilaiService = new NilAIService();
