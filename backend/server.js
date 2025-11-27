const createApp = require('./app');
const logger = require('./logger');

const PORT = process.env.PORT || 4000;
const app = createApp();

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`Health check available at: http://localhost:${PORT}/health`);
    logger.info(`Metrics available at: http://localhost:${PORT}/metrics`);
  });
}

const gracefulShutdown = () => {
  if (server && server.listening) {
    logger.info('Received shutdown signal, closing server gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    logger.info('Shutdown signal received but no active server instance. Exiting.');
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
