import { TriggerModel } from '@/features/triggers/triggers.model';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { createRun } from '@/features/runs/runs.service';
import { twitterService } from '@/shared/services/twitter.service';
import { logger } from '@/utils/logger';

const lastSeenTweetId = new Map<string, string>();
const lastPolledAt = new Map<string, number>();
const DEFAULT_INTERVAL_MS = 60_000; // Poll every 60 seconds for Twitter
const MIN_POLL_INTERVAL_MS = 30_000;

interface TwitterTriggerConfig {
  handle?: string;
  filter?: string;
  eventType?: 'posts' | 'mentions' | 'all';
  pollIntervalSec?: number;
}

const matchesFilter = (text: string, filter?: string): boolean => {
  if (!filter) return true;
  const lowerText = text.toLowerCase();
  const lowerFilter = filter.toLowerCase();

  const keywords = lowerFilter.split(/[,;|]/).map((k) => k.trim());
  return keywords.some((keyword) => lowerText.includes(keyword));
};

const pollTwitterTriggers = async (): Promise<void> => {
  const triggers = await TriggerModel.find({ type: 'twitter-post', status: 'active' }).lean();

  for (const trigger of triggers) {
    if (!trigger.connector) {
      logger.warn({ triggerId: trigger._id }, 'Twitter trigger missing connector');
      continue;
    }

    const connector = await ConnectorModel.findById(trigger.connector).lean();
    if (!connector) {
      continue;
    }

    const workflow = await WorkflowModel.findOne({ trigger: trigger._id, status: 'published' }).lean();
    if (!workflow) {
      continue;
    }

    const now = Date.now();
    const triggerConfig = trigger.config as TwitterTriggerConfig;
    const pollIntervalSec = triggerConfig.pollIntervalSec || 60;
    const interval = Math.max(pollIntervalSec * 1000, MIN_POLL_INTERVAL_MS);
    const last = lastPolledAt.get(trigger._id.toString()) ?? 0;

    if (now - last < interval) {
      continue;
    }

    const connectorConfig = decryptConnectorConfig(
      connector.type,
      connector.config as Record<string, unknown>,
    ) as { bearerToken?: string; handle?: string };

    const bearerToken = connectorConfig.bearerToken;
    if (!bearerToken) {
      logger.warn({ connectorId: connector._id }, 'Twitter connector missing bearerToken');
      continue;
    }

    const handleToMonitor = triggerConfig.handle || connectorConfig.handle;
    if (!handleToMonitor) {
      logger.warn({ triggerId: trigger._id }, 'Twitter trigger missing handle');
      continue;
    }

    const eventType = triggerConfig.eventType || 'all';
    const filter = triggerConfig.filter;
    const triggerId = trigger._id.toString();
    const lastSeenId = lastSeenTweetId.get(triggerId);

    try {
      let triggeredCount = 0;

      // Fetch posts (timeline)
      if (eventType === 'posts' || eventType === 'all') {
        const { posts, newestId } = await twitterService.getUserTimeline(handleToMonitor, bearerToken, {
          sinceId: lastSeenId,
          maxResults: 10,
        });

        for (const post of posts) {
          if (filter && !matchesFilter(post.text, filter)) {
            continue;
          }

          await createRun({
            workflowId: workflow._id.toString(),
            triggerId: trigger._id.toString(),
            payload: {
              eventType: 'post',
              post,
            },
          });

          triggeredCount++;
        }

        if (newestId) {
          lastSeenTweetId.set(triggerId, newestId);
        }
      }

      // Fetch mentions
      if (eventType === 'mentions' || eventType === 'all') {
        const { posts, newestId } = await twitterService.getUserMentions(handleToMonitor, bearerToken, {
          sinceId: lastSeenId,
          maxResults: 10,
        });

        for (const post of posts) {
          if (filter && !matchesFilter(post.text, filter)) {
            continue;
          }

          await createRun({
            workflowId: workflow._id.toString(),
            triggerId: trigger._id.toString(),
            payload: {
              eventType: 'mention',
              post,
            },
          });

          triggeredCount++;
        }

        if (newestId && eventType === 'mentions') {
          // Only update if we're ONLY fetching mentions (posts have priority when eventType is 'all')
          lastSeenTweetId.set(triggerId, newestId);
        }
      }

      lastPolledAt.set(triggerId, now);

      if (triggeredCount > 0) {
        logger.info(
          { triggerId: trigger._id, handle: handleToMonitor, count: triggeredCount },
          'Twitter trigger fired workflows',
        );
      }
    } catch (error: any) {
      logger.error({ err: error, triggerId: trigger._id, handle: handleToMonitor }, 'Twitter poll failed');
    }
  }
};

let intervalHandle: NodeJS.Timeout | null = null;

export const startTwitterPollRunner = (): void => {
  if (intervalHandle) {
    return;
  }
  intervalHandle = setInterval(() => {
    pollTwitterTriggers().catch((error) => logger.error({ err: error }, 'Twitter poll runner error'));
  }, DEFAULT_INTERVAL_MS);
  logger.info('Twitter poll runner started');
};

export const stopTwitterPollRunner = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
