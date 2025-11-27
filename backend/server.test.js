const request = require('supertest');
const app = require('./server');

describe('Backend API Tests', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('version');
    });
  });

  describe('GET /api', () => {
    it('should return API information', async () => {
      const res = await request(app).get('/api');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('endpoints');
    });
  });

  describe('GET /api/v1/status', () => {
    it('should return API v1 status', async () => {
      const res = await request(app).get('/api/v1/status');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('api_version', 'v1');
      expect(res.body).toHaveProperty('status', 'operational');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('# HELP');
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('IT Operations Endpoints', () => {
    describe('GET /api/v1/assistant/capabilities', () => {
      it('should return assistant capabilities', async () => {
        const res = await request(app).get('/api/v1/assistant/capabilities');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('capabilities');
        expect(res.body.capabilities).toHaveProperty('codeAssistance');
        expect(res.body.capabilities).toHaveProperty('operations');
        expect(res.body.capabilities).toHaveProperty('monitoring');
      });
    });

    describe('GET /api/v1/assistant/deployment-checklist', () => {
      it('should return deployment checklist', async () => {
        const res = await request(app).get('/api/v1/assistant/deployment-checklist');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('checklist');
        expect(res.body.checklist).toHaveProperty('preDeployment');
        expect(res.body.checklist).toHaveProperty('deployment');
        expect(res.body.checklist).toHaveProperty('postDeployment');
        expect(res.body.checklist).toHaveProperty('rollback');
        expect(Array.isArray(res.body.checklist.preDeployment)).toBe(true);
      });
    });

    describe('POST /api/v1/assistant/code-review', () => {
      it('should perform code review', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/code-review')
          .send({
            code: 'function add(a, b) { return a + b; }',
            language: 'javascript'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('review');
        expect(res.body).toHaveProperty('model');
        expect(res.body).toHaveProperty('language', 'javascript');
      });

      it('should return 400 when code is missing', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/code-review')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/assistant/troubleshoot', () => {
      it('should provide troubleshooting guidance', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/troubleshoot')
          .send({
            error_message: 'Connection refused on port 5432',
            context: 'PostgreSQL database connection'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('analysis');
        expect(res.body).toHaveProperty('model');
      });

      it('should return 400 when error_message is missing', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/troubleshoot')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/assistant/document', () => {
      it('should generate documentation', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/document')
          .send({
            type: 'api',
            content: 'GET /api/users - returns list of users'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('documentation');
        expect(res.body).toHaveProperty('type', 'api');
        expect(res.body).toHaveProperty('format', 'markdown');
      });

      it('should return 400 when type or content is missing', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/document')
          .send({ type: 'api' });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/assistant/security-check', () => {
      it('should perform security analysis on code', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/security-check')
          .send({
            code: 'const query = `SELECT * FROM users WHERE id = ${userId}`;',
            type: 'javascript'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('analysis');
        expect(res.body).toHaveProperty('type', 'javascript');
      });

      it('should return 400 when neither code nor dependencies provided', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/security-check')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/assistant/optimize', () => {
      it('should provide optimization suggestions', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/optimize')
          .send({
            code: 'for (let i = 0; i < arr.length; i++) { for (let j = 0; j < arr.length; j++) { } }'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('suggestions');
        expect(res.body).toHaveProperty('model');
      });

      it('should return 400 when neither code nor metrics provided', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/optimize')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/assistant/generate-tests', () => {
      it('should generate test cases', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/generate-tests')
          .send({
            code: 'function multiply(a, b) { return a * b; }',
            framework: 'jest',
            type: 'unit'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('tests');
        expect(res.body).toHaveProperty('framework', 'jest');
        expect(res.body).toHaveProperty('type', 'unit');
      });

      it('should return 400 when code is missing', async () => {
        const res = await request(app)
          .post('/api/v1/assistant/generate-tests')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });
  });

  describe('Intent Detection', () => {
    describe('GET /api/v1/intents', () => {
      it('should return available intents', async () => {
        const res = await request(app).get('/api/v1/intents');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('intents');
        expect(Array.isArray(res.body.intents)).toBe(true);
        expect(res.body.intents.length).toBeGreaterThan(5);
      });
    });

    describe('POST /api/v1/intent', () => {
      it('should detect intent from query', async () => {
        const res = await request(app)
          .post('/api/v1/intent')
          .send({ query: 'How do I deploy this application?' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('intent');
        expect(res.body).toHaveProperty('name');
        expect(res.body).toHaveProperty('confidence');
      });

      it('should return 400 when query is missing', async () => {
        const res = await request(app)
          .post('/api/v1/intent')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });
  });

  describe('NLP Endpoints', () => {
    describe('POST /api/v1/nlp/analyze', () => {
      it('should perform comprehensive NLP analysis', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/analyze')
          .send({ text: 'Microsoft announced a new AI product yesterday. This is exciting news!' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('valid', true);
        expect(res.body).toHaveProperty('entities');
        expect(res.body).toHaveProperty('sentiment');
        expect(res.body).toHaveProperty('keywords');
        expect(res.body).toHaveProperty('intent');
        expect(res.body).toHaveProperty('stats');
      });

      it('should return 400 when text is missing', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/analyze')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });

      it('should return 400 when text is not a string', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/analyze')
          .send({ text: 123 });
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/nlp/entities', () => {
      it('should extract named entities', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/entities')
          .send({ text: 'John Smith works at Microsoft in Seattle.' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('entities');
        expect(res.body.entities).toHaveProperty('people');
        expect(res.body.entities).toHaveProperty('organizations');
        expect(res.body.entities).toHaveProperty('places');
      });

      it('should return 400 when text is missing', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/entities')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/nlp/sentiment', () => {
      it('should analyze sentiment', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/sentiment')
          .send({ text: 'This is a great and wonderful day!' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('sentiment');
        expect(res.body.sentiment).toHaveProperty('score');
        expect(res.body.sentiment).toHaveProperty('positive');
        expect(res.body.sentiment).toHaveProperty('negative');
        expect(res.body.sentiment).toHaveProperty('isPositive');
        expect(res.body.sentiment).toHaveProperty('isNegative');
        expect(res.body.sentiment).toHaveProperty('isNeutral');
      });

      it('should return 400 when text is missing', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/sentiment')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('POST /api/v1/nlp/keywords', () => {
      it('should extract keywords', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/keywords')
          .send({ text: 'Machine learning and artificial intelligence are transforming the technology industry.' });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('keywords');
        expect(Array.isArray(res.body.keywords)).toBe(true);
      });

      it('should respect limit parameter', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/keywords')
          .send({ 
            text: 'This is a test with multiple words and phrases that should be extracted.',
            limit: 3
          });
        expect(res.statusCode).toBe(200);
        expect(res.body.keywords.length).toBeLessThanOrEqual(3);
      });

      it('should return 400 when text is missing', async () => {
        const res = await request(app)
          .post('/api/v1/nlp/keywords')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });
  });

  describe('Agent Review System', () => {
    let reviewId;

    describe('POST /api/v1/agent/review-task', () => {
      it('should review a task and provide feedback', async () => {
        const res = await request(app)
          .post('/api/v1/agent/review-task')
          .send({
            description: 'Implement a new user authentication feature',
            type: 'code',
            context: { project: 'AI-APP' }
          });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('reviewId');
        expect(res.body).toHaveProperty('analysis');
        expect(res.body).toHaveProperty('risks');
        expect(res.body).toHaveProperty('suggestions');
        expect(res.body).toHaveProperty('prerequisites');
        expect(res.body).toHaveProperty('recommendation');
        expect(res.body.analysis).toHaveProperty('approved');
        expect(Array.isArray(res.body.risks)).toBe(true);
        expect(Array.isArray(res.body.suggestions)).toBe(true);
        reviewId = res.body.reviewId;
      });

      it('should identify risks in production tasks', async () => {
        const res = await request(app)
          .post('/api/v1/agent/review-task')
          .send({
            description: 'Deploy breaking changes to production database',
            type: 'deployment'
          });
        expect(res.statusCode).toBe(200);
        expect(res.body.analysis.approved).toBe(false);
        expect(res.body.risks.length).toBeGreaterThan(0);
        const hasCriticalRisk = res.body.risks.some(r => r.severity === 'critical');
        expect(hasCriticalRisk).toBe(true);
      });

      it('should return 400 when description is missing', async () => {
        const res = await request(app)
          .post('/api/v1/agent/review-task')
          .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('GET /api/v1/agent/task-history', () => {
      it('should return task review history', async () => {
        const res = await request(app).get('/api/v1/agent/task-history');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('history');
        expect(res.body).toHaveProperty('total');
        expect(Array.isArray(res.body.history)).toBe(true);
        expect(res.body.history.length).toBeGreaterThan(0);
      });
    });

    describe('GET /api/v1/agent/review/:reviewId', () => {
      it('should return specific review by ID', async () => {
        // First create a review
        const createRes = await request(app)
          .post('/api/v1/agent/review-task')
          .send({
            description: 'Write unit tests for authentication service',
            type: 'testing'
          });
        const reviewId = createRes.body.reviewId;

        // Then retrieve it
        const res = await request(app).get(`/api/v1/agent/review/${reviewId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('reviewId', reviewId);
        expect(res.body.task.description).toBe('Write unit tests for authentication service');
      });

      it('should return 404 for non-existent review', async () => {
        const res = await request(app).get('/api/v1/agent/review/nonexistent_id');
        expect(res.statusCode).toBe(404);
        expect(res.body).toHaveProperty('error');
      });
    });

    describe('GET /api/v1/agent/statistics', () => {
      it('should return review statistics', async () => {
        const res = await request(app).get('/api/v1/agent/statistics');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('approved');
        expect(res.body).toHaveProperty('approvalRate');
        expect(res.body).toHaveProperty('byComplexity');
        expect(res.body).toHaveProperty('recentReviews');
      });
    });
  });
});
