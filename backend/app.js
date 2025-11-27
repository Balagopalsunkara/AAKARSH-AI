require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { requestLogger, errorHandler } = require('./middleware');
const { register, activeConnections } = require('./metrics');
const llmService = require('./llmService');
const intentDetector = require('./intentDetector');
const ragService = require('./ragService');
const agentReviewService = require('./agentReviewService');
const apiOrchestrationService = require('./apiOrchestrationService');
const imageGenerationService = require('./imageGenerationService');

const createApp = () => {
  const app = express();

  app.use(helmet());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);

  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.use((req, res, next) => {
    activeConnections.inc();
    res.on('finish', () => activeConnections.dec());
    next();
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    });
  });

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });

  app.get('/api', (req, res) => {
    res.json({
      message: 'AI-APP Backend API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        api: '/api'
      }
    });
  });

  app.get('/api/v1/status', (req, res) => {
    res.json({
      api_version: 'v1',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/v1/models', (req, res) => {
    try {
      const models = llmService.getAvailableModels();
      res.json({
        models,
        configured: llmService.isConfigured(),
        default: llmService.defaultModel
      });
    } catch (error) {
      logger.error('Failed to get models', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve models' });
    }
  });

  app.get('/api/v1/apis', (req, res) => {
    try {
      const apis = apiOrchestrationService.listApis();
      res.json(apis);
    } catch (error) {
      logger.error('Failed to list APIs', { error: error.message });
      res.status(500).json({ error: 'Failed to list APIs' });
    }
  });

  app.put('/api/v1/apis/:id', (req, res) => {
    try {
      const { id } = req.params;
      const config = req.body;
      const updatedApis = apiOrchestrationService.updateApiConfig(id, config);
      res.json(updatedApis);
    } catch (error) {
      logger.error('Failed to update API config', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/v1/tools/search', async (req, res) => {
    try {
      const { query, apiId } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const results = await apiOrchestrationService.executeSearch(query, apiId);
      res.json({ results });
    } catch (error) {
      logger.error('Search tool failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/v1/generate-image', async (req, res) => {
    try {
      const { prompt, provider } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const imageUrl = await imageGenerationService.generateImage(prompt, provider);
      res.json({ imageUrl });
    } catch (error) {
      logger.error('Image generation failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/v1/chat', async (req, res) => {
    try {
      const { messages, model, options } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: 'Invalid request: messages array is required'
        });
      }

      // Inject API context if APIs are configured
      const apis = apiOrchestrationService.listApis();
      if (apis.length > 0) {
        const apiContext = `\n\n[System Note: You have access to the following external APIs. If the user asks for data from these sources, you can help them construct a query using the API Orchestrator.\n${apis.map(a => `- ${a.name}: ${a.description} (${a.baseUrl})`).join('\n')}\n]`;

        const systemMsgIndex = messages.findIndex(m => m.role === 'system');
        if (systemMsgIndex >= 0) {
          messages[systemMsgIndex].content += apiContext;
        } else {
          messages.unshift({ role: 'system', content: `You are a helpful AI assistant.${apiContext}` });
        }
      }

      const result = await llmService.chat(messages, model, options);

      res.json({
        message: result.message,
        model: result.model,
        modelInfo: result.modelInfo,
        loading: result.loading || false,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Chat completion failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to generate response'
      });
    }
  });

  app.post('/api/v1/chat/stream', async (req, res) => {
    try {
      const { messages, model, options } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: 'Invalid request: messages array is required'
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const lastMessage = messages[messages.length - 1].content;

      // Auto-detect intent
      const intent = intentDetector.detectIntent(lastMessage);
      const searchMode = options?.searchMode || 'auto';

      // Handle Image Generation
      if (intent.intent === 'IMAGE_GENERATION') {
        try {
          res.write(`data: ${JSON.stringify({ content: `*Generating image...*\n\n` })}\n\n`);
          const imageUrl = await imageGenerationService.generateImage(lastMessage);

          res.write(`data: ${JSON.stringify({ content: `![Generated Image](${imageUrl})\n\n` })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } catch (e) {
          logger.error('Auto-image-generation failed', { error: e.message });
          res.write(`data: ${JSON.stringify({ content: `*Image generation failed: ${e.message}*\n\n` })}\n\n`);
          // Continue to LLM if image generation fails, maybe it can explain why
        }
      }

      // Handle Web Search
      let shouldSearch = false;
      if (searchMode === 'on') {
        shouldSearch = true;
      } else if (searchMode === 'auto') {
        shouldSearch = intent.intent === 'WEB_SEARCH';
      }

      if (shouldSearch) {
        const apis = apiOrchestrationService.listApis();
        const searchApi = apis.find(a => a.enabled && (a.id === 'google_search' || a.id === 'bing_search'));

        if (searchApi) {
          try {
            res.write(`data: ${JSON.stringify({ content: `*Searching ${searchApi.name}...*\n\n` })}\n\n`);

            const results = await apiOrchestrationService.executeSearch(lastMessage, searchApi.id);

            if (results.length > 0) {
              const searchContext = `\n\n[Web Search Results (${searchApi.name}):\n${results.map(r => `- [${r.title}](${r.link}): ${r.snippet}`).join('\n')}\n]\n[Instruction: Use the above search results to answer the user's question. Cite your sources using [Title](Link) format.]`;

              // Inject into system message
              const systemMsgIndex = messages.findIndex(m => m.role === 'system');
              if (systemMsgIndex >= 0) {
                messages[systemMsgIndex].content += searchContext;
              } else {
                messages.unshift({ role: 'system', content: `You are a helpful AI assistant.${searchContext}` });
              }
            }
          } catch (e) {
            logger.error('Auto-search failed', { error: e.message });
            res.write(`data: ${JSON.stringify({ content: `*Search failed: ${e.message}*\n\n` })}\n\n`);
          }
        }
      }

      // Inject API context if APIs are configured (general context)
      const apis = apiOrchestrationService.listApis();
      if (apis.length > 0) {
        const apiContext = `\n\n[System Note: You have access to the following external APIs. If the user asks for data from these sources, you can help them construct a query using the API Orchestrator.\n${apis.map(a => `- ${a.name}: ${a.description} (${a.baseUrl})`).join('\n')}\n]`;

        // Find system message or add one
        const systemMsgIndex = messages.findIndex(m => m.role === 'system');
        if (systemMsgIndex >= 0) {
          if (!messages[systemMsgIndex].content.includes('System Note: You have access to the following external APIs')) {
            messages[systemMsgIndex].content += apiContext;
          }
        } else {
          messages.unshift({ role: 'system', content: `You are a helpful AI assistant.${apiContext}` });
        }
      }

      try {
        const stream = llmService.generateStream(lastMessage, model, options);

        for await (const chunk of stream) {
          if (chunk.content) {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        logger.error('Streaming failed', { error: error.message });
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    } catch (error) {
      logger.error('Chat stream setup failed', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  app.post('/api/v1/generate', async (req, res) => {
    try {
      const { prompt, model, options } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: 'Invalid request: prompt is required'
        });
      }

      const result = await llmService.generateText(prompt, model, options);

      res.json({
        text: result.text,
        model: result.model,
        modelInfo: result.modelInfo,
        loading: result.loading || false,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Text generation failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to generate text'
      });
    }
  });

  app.post('/api/v1/intent', async (req, res) => {
    try {
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Invalid request: query is required'
        });
      }

      const intent = intentDetector.detectIntent(query);

      res.json(intent);
    } catch (error) {
      logger.error('Intent detection failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to detect intent'
      });
    }
  });

  app.get('/api/v1/intents', (req, res) => {
    try {
      const intents = intentDetector.getAvailableIntents();
      res.json({ intents });
    } catch (error) {
      logger.error('Failed to get intents', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve intents' });
    }
  });

  app.post('/api/v1/nlp/analyze', (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Invalid request: text is required and must be a string'
        });
      }

      const nlpService = require('./nlpService');
      const analysis = nlpService.analyze(text);

      res.json(analysis);
    } catch (error) {
      logger.error('NLP analysis failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to perform NLP analysis'
      });
    }
  });

  app.post('/api/v1/nlp/entities', (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Invalid request: text is required and must be a string'
        });
      }

      const nlpService = require('./nlpService');
      const entities = nlpService.extractEntities(text);

      res.json({ entities });
    } catch (error) {
      logger.error('Entity extraction failed', { error: error.message });
      res.status(500).json({ error: 'Failed to extract entities' });
    }
  });

  app.post('/api/v1/nlp/sentiment', (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Invalid request: text is required and must be a string'
        });
      }

      const nlpService = require('./nlpService');
      const sentiment = nlpService.analyzeSentiment(text);

      res.json({ sentiment });
    } catch (error) {
      logger.error('Sentiment analysis failed', { error: error.message });
      res.status(500).json({ error: 'Failed to analyze sentiment' });
    }
  });

  app.post('/api/v1/nlp/keywords', (req, res) => {
    try {
      const { text, limit } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          error: 'Invalid request: text is required and must be a string'
        });
      }

      const nlpService = require('./nlpService');
      const keywords = nlpService.extractKeywords(text, limit || 10);

      res.json({ keywords });
    } catch (error) {
      logger.error('Keyword extraction failed', { error: error.message });
      res.status(500).json({ error: 'Failed to extract keywords' });
    }
  });

  app.post('/api/v1/rag/query', async (req, res) => {
    try {
      const { query, source, model, options } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Invalid request: query is required'
        });
      }

      const ragResult = await ragService.query(query, { source, ...options });
      const llmResult = await llmService.generateText(
        ragResult.augmentedPrompt,
        model,
        options
      );

      res.json({
        answer: llmResult.text,
        sources: ragResult.sources,
        context: ragResult.context.map(ctx => ({
          source: ctx.source,
          path: ctx.path,
          excerpt: ctx.content.substring(0, 200) + '...',
          score: ctx.score
        })),
        model: llmResult.model,
        notices: llmResult.notices || []
      });
    } catch (error) {
      logger.error('RAG query failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to process RAG query'
      });
    }
  });

  app.post('/api/v1/rag/upload', async (req, res) => {
    try {
      const { filename, content } = req.body;

      if (!filename || !content) {
        return res.status(400).json({
          error: 'Invalid request: filename and content are required'
        });
      }

      const result = await ragService.uploadDocument(filename, content);
      res.json(result);
    } catch (error) {
      logger.error('Document upload failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: error.message || 'Failed to upload document'
      });
    }
  });

  app.get('/api/v1/rag/documents', async (req, res) => {
    try {
      const documents = await ragService.listDocuments();
      res.json({ documents });
    } catch (error) {
      logger.error('Failed to list documents', { error: error.message });
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  app.delete('/api/v1/rag/documents/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const result = await ragService.deleteDocument(filename);
      res.json(result);
    } catch (error) {
      logger.error('Document deletion failed', { error: error.message });
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  app.get('/api/v1/rag/status', (req, res) => {
    try {
      const status = ragService.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Failed to get RAG status', { error: error.message });
      res.status(500).json({ error: 'Failed to get RAG status' });
    }
  });

  app.post('/api/v1/assistant/code-review', async (req, res) => {
    try {
      const { code, language, context } = req.body;

      if (!code) {
        return res.status(400).json({
          error: 'Invalid request: code is required'
        });
      }

      const prompt = `Perform a code review for the following ${language || 'code'}:

${context ? `Context: ${context}\n\n` : ''}Code:
\`\`\`
${code}
\`\`\`

Please analyze:
1. Code quality and readability
2. Potential bugs or issues
3. Security vulnerabilities
4. Performance concerns
5. Best practices and improvements
6. Test coverage recommendations`;

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        review: result.text,
        model: result.model,
        language: language || 'unknown',
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Code review failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to perform code review'
      });
    }
  });

  app.post('/api/v1/assistant/troubleshoot', async (req, res) => {
    try {
      const { error_message, stack_trace, context, logs } = req.body;

      if (!error_message) {
        return res.status(400).json({
          error: 'Invalid request: error_message is required'
        });
      }

      const prompt = `Help troubleshoot this issue:

Error Message: ${error_message}

${stack_trace ? `Stack Trace:\n${stack_trace}\n\n` : ''}${context ? `Context: ${context}\n\n` : ''}${logs ? `Recent Logs:\n${logs}\n\n` : ''}Please provide:
1. Likely root cause
2. Step-by-step debugging approach
3. Potential fixes
4. Prevention strategies for the future`;

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        analysis: result.text,
        model: result.model,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Troubleshooting failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to analyze issue'
      });
    }
  });

  app.post('/api/v1/assistant/document', async (req, res) => {
    try {
      const { type, content, format } = req.body;

      if (!type || !content) {
        return res.status(400).json({
          error: 'Invalid request: type and content are required'
        });
      }

      let prompt = '';
      if (type === 'api') {
        prompt = `Generate API documentation for the following endpoint/function:\n\n${content}\n\nInclude: description, parameters, return values, examples, and error handling.`;
      } else if (type === 'readme') {
        prompt = `Generate a comprehensive README.md for:\n\n${content}\n\nInclude: overview, features, installation, usage, configuration, and contributing guidelines.`;
      } else if (type === 'runbook') {
        prompt = `Create a runbook for:\n\n${content}\n\nInclude: step-by-step procedures, prerequisites, troubleshooting steps, and rollback procedures.`;
      } else if (type === 'comment') {
        prompt = `Generate clear, concise code comments/documentation for:\n\n${content}\n\nFollow best practices for ${format || 'JSDoc'} format.`;
      } else {
        prompt = `Generate documentation for:\n\n${content}\n\nFormat: ${format || 'markdown'}`;
      }

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        documentation: result.text,
        type,
        format: format || 'markdown',
        model: result.model,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Documentation generation failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to generate documentation'
      });
    }
  });

  app.post('/api/v1/assistant/security-check', async (req, res) => {
    try {
      const { code, type, dependencies } = req.body;

      if (!code && !dependencies) {
        return res.status(400).json({
          error: 'Invalid request: code or dependencies required'
        });
      }

      let prompt = '';
      if (dependencies) {
        prompt = `Analyze these dependencies for security vulnerabilities:\n\n${dependencies}\n\nCheck for: known CVEs, outdated packages, license issues, and provide recommendations.`;
      } else {
        prompt = `Perform a security analysis on this ${type || 'code'}:\n\n${code}\n\nCheck for: SQL injection, XSS, authentication issues, exposed secrets, insecure configurations, and provide remediation steps.`;
      }

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        analysis: result.text,
        type: type || 'code',
        model: result.model,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Security check failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to perform security check'
      });
    }
  });

  app.post('/api/v1/assistant/optimize', async (req, res) => {
    try {
      const { code, metrics, bottleneck } = req.body;

      if (!code && !metrics) {
        return res.status(400).json({
          error: 'Invalid request: code or metrics required'
        });
      }

      let prompt = '';
      if (metrics) {
        prompt = `Analyze these performance metrics and suggest optimizations:\n\n${metrics}\n\n${bottleneck ? `Known bottleneck: ${bottleneck}\n\n` : ''}Provide specific optimization strategies, caching recommendations, and scalability improvements.`;
      } else {
        prompt = `Suggest performance optimizations for this code:\n\n${code}\n\nFocus on: algorithmic efficiency, memory usage, database queries, caching opportunities, and asynchronous operations.`;
      }

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        suggestions: result.text,
        model: result.model,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Optimization analysis failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to analyze performance'
      });
    }
  });

  app.post('/api/v1/assistant/generate-tests', async (req, res) => {
    try {
      const { code, framework, type } = req.body;

      if (!code) {
        return res.status(400).json({
          error: 'Invalid request: code is required'
        });
      }

      const testFramework = framework || 'jest';
      const testType = type || 'unit';

      const prompt = `Generate ${testType} tests using ${testFramework} for the following code:\n\n${code}\n\nInclude: edge cases, error scenarios, mocks if needed, and assertions for expected behavior. Follow ${testFramework} best practices.`;

      const result = await llmService.generateText(prompt, req.body.model);

      res.json({
        tests: result.text,
        framework: testFramework,
        type: testType,
        model: result.model,
        notices: result.notices || []
      });
    } catch (error) {
      logger.error('Test generation failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to generate tests'
      });
    }
  });

  app.get('/api/v1/assistant/deployment-checklist', (req, res) => {
    try {
      const checklist = {
        preDeployment: [
          'All tests passing (run `npm test`)',
          'Code reviewed and approved',
          'Dependencies updated and audited (`npm audit`)',
          'Environment variables configured',
          'Database migrations tested',
          'Secrets rotated if necessary',
          'Backup taken before deployment',
          'Rollback plan documented'
        ],
        deployment: [
          'Use blue-green or canary deployment',
          'Monitor health checks during deployment',
          'Verify /health endpoint responds correctly',
          'Check logs for errors',
          'Test critical user flows',
          'Monitor metrics at /metrics endpoint'
        ],
        postDeployment: [
          'Monitor error rates for 15-30 minutes',
          'Check application performance metrics',
          'Verify all services are healthy',
          'Update documentation if needed',
          'Notify team of successful deployment',
          'Document any issues encountered'
        ],
        rollback: [
          'Stop current deployment',
          'Deploy previous stable version',
          'Verify services are healthy',
          'Investigate root cause',
          'Document incident for postmortem'
        ]
      };

      res.json({
        checklist,
        recommendation: 'Follow these steps for safe, reliable deployments. Customize based on your specific infrastructure and requirements.'
      });
    } catch (error) {
      logger.error('Failed to get deployment checklist', { error: error.message });
      res.status(500).json({ error: 'Failed to get deployment checklist' });
    }
  });

  app.get('/api/v1/assistant/capabilities', (req, res) => {
    try {
      const capabilities = {
        codeAssistance: {
          codeReview: '/api/v1/assistant/code-review',
          testGeneration: '/api/v1/assistant/generate-tests',
          securityCheck: '/api/v1/assistant/security-check',
          optimization: '/api/v1/assistant/optimize'
        },
        operations: {
          troubleshooting: '/api/v1/assistant/troubleshoot',
          deploymentChecklist: '/api/v1/assistant/deployment-checklist',
          documentation: '/api/v1/assistant/document'
        },
        monitoring: {
          healthCheck: '/health',
          metrics: '/metrics',
          logs: 'backend/logs/combined.log'
        },
        models: '/api/v1/models',
        chat: '/api/v1/chat',
        rag: {
          query: '/api/v1/rag/query',
          upload: '/api/v1/rag/upload',
          documents: '/api/v1/rag/documents',
          status: '/api/v1/rag/status'
        },
        agent: {
          reviewTask: '/api/v1/agent/review-task',
          taskHistory: '/api/v1/agent/task-history',
          getReview: '/api/v1/agent/review/:reviewId',
          statistics: '/api/v1/agent/statistics'
        }
      };

      res.json({
        message: 'AI-APP Built-in Assistant - IT Operations Capabilities',
        version: '2.1.0',
        capabilities,
        description: 'Enhanced local assistant with comprehensive IT workplace operations support including DevOps, security, monitoring, incident response, code review, testing, documentation, and agent-based task review system (MyGPT-like) for validating tasks before execution.'
      });
    } catch (error) {
      logger.error('Failed to get capabilities', { error: error.message });
      res.status(500).json({ error: 'Failed to get capabilities' });
    }
  });

  app.post('/api/v1/agent/review-task', async (req, res) => {
    try {
      const { description, type, context } = req.body;

      if (!description) {
        return res.status(400).json({
          error: 'Invalid request: description is required'
        });
      }

      const review = agentReviewService.reviewTask({
        description,
        type,
        context
      });

      res.json(review);
    } catch (error) {
      logger.error('Task review failed', { error: error.message });
      res.status(500).json({
        error: error.message || 'Failed to review task'
      });
    }
  });

  app.get('/api/v1/agent/task-history', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const history = agentReviewService.getHistory(limit);

      res.json({
        history,
        total: history.length
      });
    } catch (error) {
      logger.error('Failed to get task history', { error: error.message });
      res.status(500).json({
        error: 'Failed to retrieve task history'
      });
    }
  });

  app.get('/api/v1/agent/review/:reviewId', (req, res) => {
    try {
      const { reviewId } = req.params;
      const review = agentReviewService.getReviewById(reviewId);

      if (!review) {
        return res.status(404).json({
          error: 'Review not found'
        });
      }

      res.json(review);
    } catch (error) {
      logger.error('Failed to get review', { error: error.message });
      res.status(500).json({
        error: 'Failed to retrieve review'
      });
    }
  });

  app.get('/api/v1/agent/statistics', (req, res) => {
    try {
      const statistics = agentReviewService.getStatistics();
      res.json(statistics);
    } catch (error) {
      logger.error('Failed to get statistics', { error: error.message });
      res.status(500).json({
        error: 'Failed to retrieve statistics'
      });
    }
  });

  // External API Orchestration Endpoints
  app.post('/api/v1/external-api/discover', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      const result = await apiOrchestrationService.discoverApi(url);
      res.json(result);
    } catch (error) {
      logger.error('API discovery failed', { error: error.message });
      res.status(500).json({ error: 'Failed to discover API' });
    }
  });

  app.post('/api/v1/external-api/configure', async (req, res) => {
    try {
      const config = req.body;
      if (!config.baseUrl || !config.name) {
        return res.status(400).json({ error: 'Base URL and Name are required' });
      }
      const result = await apiOrchestrationService.configureApi(config);
      res.json(result);
    } catch (error) {
      logger.error('API configuration failed', { error: error.message });
      res.status(500).json({ error: 'Failed to configure API' });
    }
  });

  app.get('/api/v1/external-api/list', (req, res) => {
    try {
      const apis = apiOrchestrationService.listApis();
      res.json({ apis });
    } catch (error) {
      logger.error('Failed to list APIs', { error: error.message });
      res.status(500).json({ error: 'Failed to list APIs' });
    }
  });

  app.get('/api/v1/external-api/:apiId', (req, res) => {
    try {
      const api = apiOrchestrationService.getApi(req.params.apiId);
      if (!api) {
        return res.status(404).json({ error: 'API not found' });
      }
      // Remove credentials before sending back
      const { credentials, ...safeApi } = api;
      res.json(safeApi);
    } catch (error) {
      logger.error('Failed to get API', { error: error.message });
      res.status(500).json({ error: 'Failed to get API details' });
    }
  });

  app.delete('/api/v1/external-api/:apiId', async (req, res) => {
    try {
      const success = await apiOrchestrationService.deleteApi(req.params.apiId);
      if (!success) {
        return res.status(404).json({ error: 'API not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete API', { error: error.message });
      res.status(500).json({ error: 'Failed to delete API' });
    }
  });

  app.post('/api/v1/external-api/query', async (req, res) => {
    try {
      const { query, apiId, model } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      // If apiId is provided, use that specific API
      // If not, we might need to infer it or ask the user (for now assume apiId is passed or we pick the first one matching)
      // For this implementation, we'll require apiId or try to find a matching one from the query if possible (advanced)

      let targetApiId = apiId;
      if (!targetApiId) {
        // Simple heuristic: check if query contains any API name
        const apis = apiOrchestrationService.listApis();
        const foundApi = apis.find(api => query.toLowerCase().includes(api.name.toLowerCase()));
        if (foundApi) {
          targetApiId = foundApi.id;
        } else {
          return res.status(400).json({ error: 'Please specify which API to query or include the API name in your request.' });
        }
      }

      const apiConfig = apiOrchestrationService.getApi(targetApiId);
      if (!apiConfig) {
        return res.status(404).json({ error: 'API not found' });
      }

      // 1. Analyze query with LLM to determine endpoint and parameters
      const analysisPrompt = `
You are an API Orchestrator. Your goal is to map a natural language query to a specific API endpoint.

API: ${apiConfig.name}
Base URL: ${apiConfig.baseUrl}
Description: ${apiConfig.description}

Available Endpoints:
${JSON.stringify(apiConfig.endpoints.map(e => ({
        method: e.method,
        path: e.path,
        description: e.description,
        parameters: e.parameters
      })), null, 2)}

User Query: "${query}"

Return a JSON object with:
1. "endpoint": The path of the endpoint to call (e.g., "/users/{id}")
2. "method": The HTTP method (GET, POST, etc.)
3. "params": Object containing path and query parameters
4. "body": Object containing the request body (if applicable)
5. "confidence": A number between 0 and 1 indicating confidence in this mapping

If no suitable endpoint is found, set "endpoint" to null.
Only return the JSON object, no other text.
`;

      const analysisResult = await llmService.generateText(analysisPrompt, model, { temperature: 0 });
      let plan;
      try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
        plan = JSON.parse(jsonMatch ? jsonMatch[0] : analysisResult.text);
      } catch (e) {
        logger.error('Failed to parse LLM API plan', { text: analysisResult.text, error: e.message });
        return res.status(500).json({ error: 'Failed to understand query for this API' });
      }

      if (!plan.endpoint || plan.confidence < 0.6) {
        return res.json({
          message: "I couldn't find a matching endpoint for your request.",
          analysis: plan
        });
      }

      // 2. Execute the request
      const apiResponse = await apiOrchestrationService.executeRequest(
        targetApiId,
        plan.endpoint,
        plan.method,
        plan.params,
        plan.body
      );

      // 3. Format the response with LLM
      const formatPrompt = `
User Query: "${query}"
API Response:
${JSON.stringify(apiResponse.data, null, 2).substring(0, 3000)}... (truncated if too long)

Please summarize this data to answer the user's query naturally. Highlight key information.
`;
      const formattedResponse = await llmService.generateText(formatPrompt, model);

      res.json({
        answer: formattedResponse.text,
        data: apiResponse.data,
        plan: plan,
        status: apiResponse.status
      });

    } catch (error) {
      logger.error('API query execution failed', { error: error.message });
      res.status(500).json({ error: error.message || 'Failed to execute API query' });
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Endpoint not found',
        status: 404
      }
    });
  });

  app.use(errorHandler);

  return app;
};

module.exports = createApp;
