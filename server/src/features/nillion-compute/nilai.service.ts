import axios, { AxiosInstance } from 'axios';
import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

type NilAIModel = 'google/gemma-3-27b-it' | 'openai/gpt-oss-20b' | 'meta-llama/Llama-3.1-8B-Instruct';

class NilAIService {
  private client: AxiosInstance;
  private defaultModel: NilAIModel = 'google/gemma-3-27b-it';

  constructor() {
    if (!envConfig.NILAI_API_KEY || !envConfig.NILAI_BASE_URL) {
      throw new Error('NilAI credentials not configured. Set NILAI_API_KEY and NILAI_BASE_URL in .env');
    }

    this.client = axios.create({
      baseURL: envConfig.NILAI_BASE_URL,
      headers: {
        Authorization: `Bearer ${envConfig.NILAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });

    logger.info('NilAI client initialized');
  }

  async runInference(prompt: string, model?: NilAIModel): Promise<string> {
    try {
      const { data } = await this.client.post('/chat/completions', {
        model: model || this.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.7,
      });

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from NilAI');
      }

      return content;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('NilAI authentication failed. Check your API key.');
      }

      logger.error({ err: error, response: error.response?.data }, 'NilAI inference failed');
      throw new Error(`NilAI inference failed: ${error.message}`);
    }
  }

  async generateStructured(prompt: string, model?: NilAIModel): Promise<Record<string, any>> {
    const response = await this.runInference(prompt, model);

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
    };
  }

  async listModels(): Promise<any> {
    try {
      const { data } = await this.client.get('/models');
      return data;
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list NilAI models');
      throw error;
    }
  }
}

export const nilaiService = new NilAIService();
