import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from '@/routes';
import { envConfig } from '@/config/env';
import { errorHandler } from '@/shared/middlewares/error.middleware';

const app = express();

app.use(helmet());

const corsOrigins = envConfig.CORS_ORIGINS
  ? envConfig.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : undefined;

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  }),
);
const rawBodySaver = (req: Request, _res: express.Response, buf: Buffer): void => {
  (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
};

app.use(
  express.json({
    limit: '1mb',
    verify: rawBodySaver,
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', routes);

app.use((_req, res, next) => {
  if (!res.headersSent) {
    res.status(404).json({ message: 'Route not found' });
  }
  next();
});

app.use(errorHandler);

export default app;
