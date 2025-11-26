import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface TwitterPost {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  conversationId?: string;
  inReplyToUserId?: string;
  referencedTweets?: Array<{ type: string; id: string }>;
  metrics?: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
  };
}

interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

interface TwitterApiResponse {
  data?: any[];
  includes?: { users?: TwitterUser[] };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

class TwitterService {
  private client: AxiosInstance;
  private userIdCache = new Map<string, string>();

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.x.com/2',
      timeout: 30000,
    });
  }

  private getAuthHeaders(bearerToken: string) {
    return {
      Authorization: `Bearer ${bearerToken}`,
      'User-Agent': 'ZecFlow-Automation',
    };
  }

  async lookupUserId(handle: string, bearerToken: string): Promise<string> {
    const normalizedHandle = handle.replace(/^@/, '');

    if (this.userIdCache.has(normalizedHandle)) {
      return this.userIdCache.get(normalizedHandle)!;
    }

    try {
      const { data } = await this.client.get(`/users/by/username/${normalizedHandle}`, {
        headers: this.getAuthHeaders(bearerToken),
      });

      if (!data.data?.id) {
        throw new Error(`User @${normalizedHandle} not found`);
      }

      const userId = data.data.id as string;
      this.userIdCache.set(normalizedHandle, userId);
      return userId;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Twitter user @${normalizedHandle} not found`);
      }
      throw new Error(`Failed to lookup Twitter user: ${error.message}`);
    }
  }

  async getUserTimeline(
    handle: string,
    bearerToken: string,
    options: {
      sinceId?: string;
      maxResults?: number;
    } = {},
  ): Promise<{ posts: TwitterPost[]; newestId?: string }> {
    const userId = await this.lookupUserId(handle, bearerToken);
    const params: Record<string, string> = {
      'tweet.fields': 'created_at,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics',
      'user.fields': 'username',
      expansions: 'author_id',
      max_results: String(Math.min(options.maxResults || 10, 100)),
    };

    if (options.sinceId) {
      params.since_id = options.sinceId;
    }

    try {
      const { data } = await this.client.get<TwitterApiResponse>(`/users/${userId}/tweets`, {
        headers: this.getAuthHeaders(bearerToken),
        params,
      });

      const posts = this.formatPosts(data);
      return {
        posts,
        newestId: data.meta?.newest_id,
      };
    } catch (error: any) {
      logger.error({ err: error, handle }, 'Failed to fetch Twitter timeline');
      throw new Error(`Failed to fetch timeline for @${handle}: ${error.message}`);
    }
  }

  async getUserMentions(
    handle: string,
    bearerToken: string,
    options: {
      sinceId?: string;
      maxResults?: number;
    } = {},
  ): Promise<{ posts: TwitterPost[]; newestId?: string }> {
    const userId = await this.lookupUserId(handle, bearerToken);
    const params: Record<string, string> = {
      'tweet.fields': 'created_at,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics',
      'user.fields': 'username',
      expansions: 'author_id',
      max_results: String(Math.min(options.maxResults || 10, 100)),
    };

    if (options.sinceId) {
      params.since_id = options.sinceId;
    }

    try {
      const { data } = await this.client.get<TwitterApiResponse>(`/users/${userId}/mentions`, {
        headers: this.getAuthHeaders(bearerToken),
        params,
      });

      const posts = this.formatPosts(data);
      return {
        posts,
        newestId: data.meta?.newest_id,
      };
    } catch (error: any) {
      logger.error({ err: error, handle }, 'Failed to fetch Twitter mentions');
      throw new Error(`Failed to fetch mentions for @${handle}: ${error.message}`);
    }
  }

  private formatPosts(response: TwitterApiResponse): TwitterPost[] {
    if (!response.data || response.data.length === 0) {
      return [];
    }

    const users = response.includes?.users || [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return response.data.map((tweet) => {
      const author = userMap.get(tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        authorUsername: author?.username || 'unknown',
        createdAt: tweet.created_at,
        conversationId: tweet.conversation_id,
        inReplyToUserId: tweet.in_reply_to_user_id,
        referencedTweets: tweet.referenced_tweets,
        metrics: tweet.public_metrics
          ? {
              retweetCount: tweet.public_metrics.retweet_count,
              replyCount: tweet.public_metrics.reply_count,
              likeCount: tweet.public_metrics.like_count,
              quoteCount: tweet.public_metrics.quote_count,
            }
          : undefined,
      };
    });
  }
}

export const twitterService = new TwitterService();
