const logger = require('./logger');
const { httpRequestDuration, httpRequestTotal } = require('./metrics');

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    logger.info({
      message: 'HTTP Request',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}s`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Record metrics
    httpRequestDuration.labels(req.method, req.route?.path || req.url, res.statusCode).observe(duration);
    httpRequestTotal.labels(req.method, req.route?.path || req.url, res.statusCode).inc();
  });

  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error({
    message: 'Error occurred',
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      status: err.status || 500
    }
  });
};

module.exports = {
  requestLogger,
  errorHandler
};
