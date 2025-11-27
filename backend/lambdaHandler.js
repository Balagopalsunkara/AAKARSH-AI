const serverless = require('serverless-http');
const createApp = require('./app');

const app = createApp();
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return handler(event, context);
};
