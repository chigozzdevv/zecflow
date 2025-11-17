import axios from 'axios';
import crypto from 'crypto';
import { envConfig } from '@/config/env';
import { ConnectorDocument } from '@/features/connectors/connectors.model';
import { logger } from '@/utils/logger';

interface GithubConnectorConfig {
  token?: string;
  repository?: string;
  webhookSecret?: string;
  events?: string[];
}

export const registerGithubWebhook = async (
  triggerId: string,
  connector: ConnectorDocument,
): Promise<void> => {
  const config = connector.config as GithubConnectorConfig;
  const token = config.token;
  const repository = config.repository;
  const secret = config.webhookSecret;
  if (!token || !repository || !secret) {
    logger.warn({ connectorId: connector.id }, 'GitHub connector missing credentials');
    return;
  }

  const hookUrl = `${envConfig.PUBLIC_URL}/api/triggers/hooks/${triggerId}`;
  const events = config.events?.length ? config.events : ['push'];

  try {
    await axios.post(
      `https://api.github.com/repos/${repository}/hooks`,
      {
        name: 'web',
        active: true,
        events,
        config: {
          url: hookUrl,
          secret,
          content_type: 'json',
        },
      },
      {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'ZecFlow-Automation',
          Accept: 'application/vnd.github+json',
        },
      },
    );
    logger.info({ repository, triggerId }, 'GitHub webhook registered');
  } catch (error: any) {
    if (error.response?.status === 422) {
      logger.warn({ repository }, 'GitHub webhook already exists');
      return;
    }
    throw error;
  }
};

export const verifyGithubSignature = (
  payload: Buffer,
  signatureHeader: string | string[] | undefined,
  secret: string,
): boolean => {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }
  const signature = signatureHeader.replace('sha256=', '');
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest, 'hex'));
};
