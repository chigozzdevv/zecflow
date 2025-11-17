import mongoose from 'mongoose';
import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

export const connectMongo = async (): Promise<void> => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(envConfig.MONGO_URI);
  logger.info('Mongo connected');
};
