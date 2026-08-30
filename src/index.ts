import { registerGlobalErrorHandlers } from './logging/errorHandler.js';
import { logger } from './logging/logger.js';

registerGlobalErrorHandlers(logger);

logger.info('AutoFinance — esqueleto em construção (Fase 1)');
