import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './utils/config';
import { logger } from './utils/logger';
import routes from './routes';
import { notFound, errorHandler } from './middlewares/validate.middleware';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, error: { message: 'Too many requests' } },
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Ceylon CRM API', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Ceylon CRM API running on port ${config.port}`);
});

export default app;
