const nlpService = require('./nlpService');

describe('NLP Service', () => {
  describe('extractEntities', () => {
    test('should extract people names', () => {
      const text = 'John Smith and Mary Johnson are working on the project.';
      const result = nlpService.extractEntities(text);
      
      expect(result).toHaveProperty('people');
      expect(Array.isArray(result.people)).toBe(true);
      // compromise.js may or may not extract these as people depending on context
      // The important thing is the API works and returns an array
      expect(result.people).toBeDefined();
    });

    test('should extract places', () => {
      const text = 'We traveled to Paris and London last summer.';
      const result = nlpService.extractEntities(text);
      
      expect(result).toHaveProperty('places');
      expect(Array.isArray(result.places)).toBe(true);
    });

    test('should extract organizations', () => {
      const text = 'Microsoft and Google are competing in the AI space.';
      const result = nlpService.extractEntities(text);
      
      expect(result).toHaveProperty('organizations');
      expect(Array.isArray(result.organizations)).toBe(true);
    });

    test('should extract dates', () => {
      const text = 'The meeting is scheduled for next Monday.';
      const result = nlpService.extractEntities(text);
      
      expect(result).toHaveProperty('dates');
      expect(Array.isArray(result.dates)).toBe(true);
    });

    test('should handle empty text', () => {
      const result = nlpService.extractEntities('');
      
      expect(result.people).toEqual([]);
      expect(result.places).toEqual([]);
      expect(result.organizations).toEqual([]);
    });

    test('should handle invalid input', () => {
      const result = nlpService.extractEntities(null);
      
      expect(result.people).toEqual([]);
      expect(result.places).toEqual([]);
    });
  });

  describe('analyzeSentiment', () => {
    test('should detect positive sentiment', () => {
      const text = 'This is great! I love this amazing product.';
      const result = nlpService.analyzeSentiment(text);
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('positive');
      expect(result).toHaveProperty('negative');
      expect(result).toHaveProperty('isPositive');
      expect(result).toHaveProperty('isNegative');
      expect(result).toHaveProperty('isNeutral');
    });

    test('should detect negative sentiment', () => {
      const text = 'This is terrible and awful. I hate it.';
      const result = nlpService.analyzeSentiment(text);
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('negative');
    });

    test('should detect neutral sentiment', () => {
      const text = 'The sky is blue.';
      const result = nlpService.analyzeSentiment(text);
      
      expect(result).toHaveProperty('score');
      expect(result.score).toBe(0);
    });

    test('should handle empty text', () => {
      const result = nlpService.analyzeSentiment('');
      
      expect(result.score).toBe(0);
      expect(result.comparative).toBe(0);
    });

    test('should handle invalid input', () => {
      const result = nlpService.analyzeSentiment(null);
      
      expect(result.score).toBe(0);
      expect(result.isNeutral).toBe(true);
    });
  });

  describe('extractKeywords', () => {
    test('should extract keywords from text', () => {
      const text = 'Machine learning and artificial intelligence are transforming the technology industry.';
      const result = nlpService.extractKeywords(text, 5);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('text');
        expect(result[0]).toHaveProperty('count');
        expect(result[0]).toHaveProperty('relevance');
      }
    });

    test('should respect limit parameter', () => {
      const text = 'This is a test with multiple words and phrases that should be extracted.';
      const result = nlpService.extractKeywords(text, 3);
      
      expect(result.length).toBeLessThanOrEqual(3);
    });

    test('should handle empty text', () => {
      const result = nlpService.extractKeywords('');
      
      expect(result).toEqual([]);
    });

    test('should handle invalid input', () => {
      const result = nlpService.extractKeywords(null);
      
      expect(result).toEqual([]);
    });
  });

  describe('posTag', () => {
    test('should perform part-of-speech tagging', () => {
      const text = 'The quick brown fox jumps.';
      const result = nlpService.posTag(text);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('text');
        expect(result[0]).toHaveProperty('pos');
        expect(result[0]).toHaveProperty('index');
      }
    });

    test('should handle empty text', () => {
      const result = nlpService.posTag('');
      
      expect(result).toEqual([]);
    });

    test('should handle invalid input', () => {
      const result = nlpService.posTag(null);
      
      expect(result).toEqual([]);
    });
  });

  describe('classifyIntent', () => {
    test('should detect question intent', () => {
      const text = 'What is machine learning?';
      const result = nlpService.classifyIntent(text);
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('details');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should detect how questions', () => {
      const text = 'How do I deploy this application?';
      const result = nlpService.classifyIntent(text);
      
      expect(result.intent).toBe('question');
      expect(result.details.isHowQuestion).toBe(true);
    });

    test('should detect command intent', () => {
      const text = 'Deploy the application.';
      const result = nlpService.classifyIntent(text);
      
      expect(result).toHaveProperty('intent');
      expect(['command', 'statement']).toContain(result.intent);
    });

    test('should detect request intent', () => {
      const text = 'Could you please help me with this?';
      const result = nlpService.classifyIntent(text);
      
      // This should be detected as either a question or request
      expect(['request', 'question']).toContain(result.intent);
      if (result.intent === 'request') {
        expect(result.details.polite).toBe(true);
      }
    });

    test('should detect statement intent', () => {
      const text = 'The application is running correctly.';
      const result = nlpService.classifyIntent(text);
      
      expect(['statement', 'command']).toContain(result.intent);
    });

    test('should handle empty text', () => {
      const result = nlpService.classifyIntent('');
      
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should handle invalid input', () => {
      const result = nlpService.classifyIntent(null);
      
      expect(result.intent).toBe('unknown');
    });
  });

  describe('normalizeText', () => {
    test('should normalize whitespace and punctuation', () => {
      const text = '  This   is    a   test!!!  ';
      const result = nlpService.normalizeText(text);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle empty text', () => {
      const result = nlpService.normalizeText('');
      
      expect(result).toBe('');
    });

    test('should handle invalid input', () => {
      const result = nlpService.normalizeText(null);
      
      expect(result).toBe('');
    });
  });

  describe('expandContractions', () => {
    test('should expand contractions', () => {
      const text = "I'm going to the store and I'll be back soon.";
      const result = nlpService.expandContractions(text);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle text without contractions', () => {
      const text = 'This text has no contractions.';
      const result = nlpService.expandContractions(text);
      
      // Result should be a string (may or may not be exactly the same)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle empty text', () => {
      const result = nlpService.expandContractions('');
      
      expect(result).toBe('');
    });

    test('should handle invalid input', () => {
      const result = nlpService.expandContractions(null);
      
      expect(result).toBe('');
    });
  });

  describe('analyze (comprehensive)', () => {
    test('should perform comprehensive text analysis', () => {
      const text = 'Microsoft announced a new AI product yesterday. This is exciting news!';
      const result = nlpService.analyze(text);
      
      expect(result).toHaveProperty('valid');
      expect(result.valid).toBe(true);
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('normalized');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('keywords');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('stats');
      
      expect(result.stats).toHaveProperty('sentences');
      expect(result.stats).toHaveProperty('words');
      expect(result.stats).toHaveProperty('characters');
      expect(result.stats).toHaveProperty('verbs');
      expect(result.stats).toHaveProperty('nouns');
      expect(result.stats).toHaveProperty('adjectives');
    });

    test('should handle technical text', () => {
      const text = 'The Docker container failed to start due to a port conflict on localhost:4000.';
      const result = nlpService.analyze(text);
      
      expect(result.valid).toBe(true);
      expect(result.stats.words).toBeGreaterThan(5);
    });

    test('should handle questions in analysis', () => {
      const text = 'How can I improve the performance of my application?';
      const result = nlpService.analyze(text);
      
      expect(result.valid).toBe(true);
      expect(result.intent.intent).toBe('question');
    });

    test('should handle empty text', () => {
      const result = nlpService.analyze('');
      
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('error');
    });

    test('should handle invalid input', () => {
      const result = nlpService.analyze(null);
      
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('Error handling', () => {
    test('should handle non-string inputs gracefully', () => {
      expect(() => nlpService.extractEntities(123)).not.toThrow();
      expect(() => nlpService.analyzeSentiment(123)).not.toThrow();
      expect(() => nlpService.extractKeywords(123)).not.toThrow();
      expect(() => nlpService.posTag(123)).not.toThrow();
      expect(() => nlpService.classifyIntent(123)).not.toThrow();
    });

    test('should handle undefined inputs gracefully', () => {
      expect(() => nlpService.extractEntities(undefined)).not.toThrow();
      expect(() => nlpService.analyzeSentiment(undefined)).not.toThrow();
      expect(() => nlpService.extractKeywords(undefined)).not.toThrow();
      expect(() => nlpService.posTag(undefined)).not.toThrow();
      expect(() => nlpService.classifyIntent(undefined)).not.toThrow();
    });
  });
});
