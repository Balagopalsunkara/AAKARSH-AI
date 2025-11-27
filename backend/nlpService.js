const nlp = require('compromise');
const logger = require('./logger');

/**
 * NLP Service providing deterministic natural language processing capabilities
 * Uses compromise.js - a rule-based NLP library that doesn't hallucinate
 */
class NLPService {
  constructor() {
    logger.info('NLP Service initialized with compromise.js');
  }

  /**
   * Extract named entities from text (people, places, organizations, dates, etc.)
   * @param {string} text - Input text to analyze
   * @returns {object} Named entities organized by type
   */
  extractEntities(text) {
    if (!text || typeof text !== 'string') {
      return {
        people: [],
        places: [],
        organizations: [],
        dates: [],
        values: [],
        topics: []
      };
    }

    try {
      const doc = nlp(text);
      
      return {
        people: doc.people().out('array'),
        places: doc.places().out('array'),
        organizations: doc.organizations().out('array'),
        dates: doc.match('#Date').out('array'),
        values: doc.values().out('array'),
        topics: doc.topics().out('array')
      };
    } catch (error) {
      logger.error('Entity extraction failed', { error: error.message });
      return {
        people: [],
        places: [],
        organizations: [],
        dates: [],
        values: [],
        topics: []
      };
    }
  }

  /**
   * Analyze sentiment of the text
   * @param {string} text - Input text to analyze
   * @returns {object} Sentiment analysis results
   */
  analyzeSentiment(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return {
        score: 0,
        comparative: 0,
        positive: [],
        negative: [],
        isPositive: false,
        isNegative: false,
        isNeutral: true
      };
    }

    try {
      const doc = nlp(text);
      
      // Get positive and negative terms
      const positive = doc.match('#Positive').out('array');
      const negative = doc.match('#Negative').out('array');
      
      // Calculate basic sentiment score
      const score = positive.length - negative.length;
      const totalWords = doc.terms().out('array').length;
      const comparative = totalWords > 0 ? score / totalWords : 0;
      
      return {
        score,
        comparative,
        positive,
        negative,
        isPositive: score > 0,
        isNegative: score < 0,
        isNeutral: score === 0
      };
    } catch (error) {
      logger.error('Sentiment analysis failed', { error: error.message });
      return {
        score: 0,
        comparative: 0,
        positive: [],
        negative: [],
        isPositive: false,
        isNegative: false,
        isNeutral: true
      };
    }
  }

  /**
   * Extract keywords and important phrases from text
   * @param {string} text - Input text to analyze
   * @param {number} limit - Maximum number of keywords to return
   * @returns {array} Array of keyword objects with text and relevance
   */
  extractKeywords(text, limit = 10) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    try {
      const doc = nlp(text);
      
      // Extract nouns and noun phrases as keywords
      const nouns = doc.nouns().out('array');
      const topics = doc.topics().out('array');
      const values = doc.values().out('array');
      
      // Combine and deduplicate
      const keywords = [...new Set([...topics, ...nouns, ...values])];
      
      // Calculate simple frequency-based relevance
      const keywordStats = keywords.map(keyword => {
        const count = text.toLowerCase().split(keyword.toLowerCase()).length - 1;
        return {
          text: keyword,
          count,
          relevance: count / keywords.length
        };
      });
      
      // Sort by relevance and limit
      return keywordStats
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      logger.error('Keyword extraction failed', { error: error.message });
      return [];
    }
  }

  /**
   * Perform part-of-speech tagging
   * @param {string} text - Input text to analyze
   * @returns {array} Array of tokens with POS tags
   */
  posTag(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    try {
      const doc = nlp(text);
      const terms = doc.terms();
      
      return terms.out('array').map((term, index) => {
        const termDoc = doc.match(term);
        return {
          text: term,
          pos: this._getPartOfSpeech(termDoc),
          index
        };
      });
    } catch (error) {
      logger.error('POS tagging failed', { error: error.message });
      return [];
    }
  }

  /**
   * Classify text intent based on linguistic patterns
   * @param {string} text - Input text to analyze
   * @returns {object} Classification results with confidence scores
   */
  classifyIntent(text) {
    if (!text || typeof text !== 'string') {
      return {
        intent: 'unknown',
        confidence: 0,
        details: {}
      };
    }

    try {
      const doc = nlp(text);
      const lower = text.toLowerCase();
      
      // Question detection
      if (doc.questions().found || lower.includes('?')) {
        const questionType = this._detectQuestionType(doc, lower);
        return {
          intent: 'question',
          confidence: 0.95,
          details: {
            type: questionType,
            isWhatQuestion: lower.startsWith('what'),
            isHowQuestion: lower.startsWith('how'),
            isWhyQuestion: lower.startsWith('why'),
            isWhenQuestion: lower.startsWith('when'),
            isWhereQuestion: lower.startsWith('where')
          }
        };
      }
      
      // Command detection
      const verbs = doc.verbs().out('array');
      if (verbs.length > 0 && doc.sentences().length === 1) {
        const firstWord = doc.terms().first().out('text').toLowerCase();
        if (verbs.some(v => v.toLowerCase() === firstWord)) {
          return {
            intent: 'command',
            confidence: 0.9,
            details: {
              verb: firstWord,
              isImperative: true
            }
          };
        }
      }
      
      // Request detection
      if (lower.includes('please') || lower.includes('could you') || lower.includes('can you')) {
        return {
          intent: 'request',
          confidence: 0.85,
          details: {
            polite: true
          }
        };
      }
      
      // Statement detection
      return {
        intent: 'statement',
        confidence: 0.7,
        details: {
          hasVerbs: verbs.length > 0
        }
      };
    } catch (error) {
      logger.error('Intent classification failed', { error: error.message });
      return {
        intent: 'unknown',
        confidence: 0,
        details: {}
      };
    }
  }

  /**
   * Normalize and clean text
   * @param {string} text - Input text to normalize
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    try {
      const doc = nlp(text);
      return doc.normalize({
        whitespace: true,
        punctuation: true,
        case: false,
        numbers: false,
        plurals: false,
        verbs: false
      }).out('text');
    } catch (error) {
      logger.error('Text normalization failed', { error: error.message });
      return text;
    }
  }

  /**
   * Expand contractions in text
   * @param {string} text - Input text with contractions
   * @returns {string} Text with expanded contractions
   */
  expandContractions(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    try {
      const doc = nlp(text);
      const expanded = doc.contractions().expand().out('text');
      // If no contractions were found, return the original text
      return expanded || text;
    } catch (error) {
      logger.error('Contraction expansion failed', { error: error.message });
      return text;
    }
  }

  /**
   * Comprehensive text analysis combining multiple NLP features
   * @param {string} text - Input text to analyze
   * @returns {object} Complete analysis results
   */
  analyze(text) {
    if (!text || typeof text !== 'string') {
      return {
        valid: false,
        error: 'Invalid input text'
      };
    }

    try {
      const doc = nlp(text);
      
      return {
        valid: true,
        text,
        normalized: this.normalizeText(text),
        entities: this.extractEntities(text),
        sentiment: this.analyzeSentiment(text),
        keywords: this.extractKeywords(text, 5),
        intent: this.classifyIntent(text),
        stats: {
          sentences: doc.sentences().length,
          words: doc.terms().out('array').length,
          characters: text.length,
          verbs: doc.verbs().out('array').length,
          nouns: doc.nouns().out('array').length,
          adjectives: doc.adjectives().out('array').length
        }
      };
    } catch (error) {
      logger.error('Text analysis failed', { error: error.message });
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Helper method to determine part of speech
   * @private
   */
  _getPartOfSpeech(termDoc) {
    if (termDoc.nouns().found) return 'noun';
    if (termDoc.verbs().found) return 'verb';
    if (termDoc.adjectives().found) return 'adjective';
    if (termDoc.adverbs().found) return 'adverb';
    if (termDoc.match('#Preposition').found) return 'preposition';
    if (termDoc.match('#Conjunction').found) return 'conjunction';
    if (termDoc.match('#Pronoun').found) return 'pronoun';
    if (termDoc.match('#Determiner').found) return 'determiner';
    return 'other';
  }

  /**
   * Helper method to detect question type
   * @private
   */
  _detectQuestionType(doc, lower) {
    if (lower.startsWith('what')) return 'what';
    if (lower.startsWith('how')) return 'how';
    if (lower.startsWith('why')) return 'why';
    if (lower.startsWith('when')) return 'when';
    if (lower.startsWith('where')) return 'where';
    if (lower.startsWith('who')) return 'who';
    if (lower.startsWith('which')) return 'which';
    if (lower.startsWith('can') || lower.startsWith('could') || 
        lower.startsWith('would') || lower.startsWith('should')) return 'modal';
    if (lower.startsWith('is') || lower.startsWith('are') || 
        lower.startsWith('was') || lower.startsWith('were')) return 'yes-no';
    return 'general';
  }
}

module.exports = new NLPService();
