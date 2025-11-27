const logger = require('./logger');

/**
 * Agent Review Service
 * Reviews tasks submitted by users before execution, similar to MyGPT's review mechanism
 * Provides feedback, suggestions, and validation for task feasibility
 */

class AgentReviewService {
  constructor() {
    // Store task review history in memory (in production, this should be in a database)
    this.taskHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Review a task and provide feedback
   * @param {Object} task - The task to review
   * @param {string} task.description - Description of the task
   * @param {string} task.type - Type of task (code, deployment, security, etc.)
   * @param {Object} task.context - Additional context about the task
   * @returns {Object} Review result with feedback, suggestions, and risk assessment
   */
  reviewTask(task) {
    const { description, type, context = {} } = task;

    if (!description || !description.trim()) {
      return {
        status: 'error',
        message: 'Task description is required',
        approved: false
      };
    }

    const reviewId = this.generateReviewId();
    const timestamp = new Date().toISOString();
    const lowerDesc = description.toLowerCase();

    // Analyze task complexity and risk
    const complexity = this.analyzeComplexity(description, type);
    const risks = this.identifyRisks(description, type);
    const suggestions = this.generateSuggestions(description, type, context);
    const prerequisites = this.identifyPrerequisites(description, type);
    const estimatedEffort = this.estimateEffort(description, type);

    // Determine if task should be approved
    const criticalRisks = risks.filter(r => r.severity === 'critical');
    const approved = criticalRisks.length === 0;

    const review = {
      reviewId,
      timestamp,
      task: {
        description,
        type: type || 'general',
        context
      },
      analysis: {
        complexity,
        estimatedEffort,
        approved,
        confidence: this.calculateConfidence(description, type)
      },
      risks,
      suggestions,
      prerequisites,
      recommendation: this.generateRecommendation(approved, risks, complexity),
      nextSteps: this.suggestNextSteps(description, type, approved)
    };

    // Store in history
    this.addToHistory(review);

    logger.info('Task reviewed', {
      reviewId,
      type: type || 'general',
      complexity,
      approved,
      riskCount: risks.length
    });

    return review;
  }

  /**
   * Analyze task complexity
   */
  analyzeComplexity(description, type) {
    const lowerDesc = description.toLowerCase();
    let score = 1; // Default: low

    // Keywords indicating higher complexity
    const complexKeywords = [
      'refactor', 'migrate', 'infrastructure', 'distributed', 'microservice',
      'scale', 'multiple', 'integrate', 'complex', 'architecture'
    ];

    const criticalKeywords = [
      'production', 'database migration', 'authentication', 'security',
      'payment', 'data loss', 'breaking change'
    ];

    // Count complexity indicators
    complexKeywords.forEach(keyword => {
      if (lowerDesc.includes(keyword)) score += 0.5;
    });

    criticalKeywords.forEach(keyword => {
      if (lowerDesc.includes(keyword)) score += 1;
    });

    // Adjust by type
    if (['deployment', 'security', 'database'].includes(type)) {
      score += 0.5;
    }

    // Determine complexity level
    if (score >= 4) return 'critical';
    if (score >= 2.5) return 'high';
    if (score >= 1.5) return 'medium';
    return 'low';
  }

  /**
   * Identify potential risks
   */
  identifyRisks(description, type) {
    const risks = [];
    const lowerDesc = description.toLowerCase();

    // Production risks
    if (lowerDesc.includes('production') || lowerDesc.includes('prod')) {
      risks.push({
        category: 'environment',
        severity: 'high',
        description: 'Production environment detected',
        mitigation: 'Test thoroughly in staging first, have rollback plan ready'
      });
    }

    // Data risks
    if (lowerDesc.includes('database') || lowerDesc.includes('migration') || lowerDesc.includes('data')) {
      risks.push({
        category: 'data',
        severity: 'high',
        description: 'Data operations detected',
        mitigation: 'Backup data before proceeding, test migration on copy first'
      });
    }

    // Security risks
    if (lowerDesc.includes('security') || lowerDesc.includes('auth') || lowerDesc.includes('password') || lowerDesc.includes('token')) {
      risks.push({
        category: 'security',
        severity: 'high',
        description: 'Security-related operations detected',
        mitigation: 'Follow security best practices, audit changes, rotate secrets if needed'
      });
    }

    // Breaking change risks
    if (lowerDesc.includes('breaking') || lowerDesc.includes('remove') || lowerDesc.includes('delete')) {
      risks.push({
        category: 'breaking_change',
        severity: 'critical',
        description: 'Potential breaking change detected',
        mitigation: 'Version API appropriately, communicate changes to all stakeholders'
      });
    }

    // Deployment risks
    if (lowerDesc.includes('deploy') || lowerDesc.includes('release')) {
      risks.push({
        category: 'deployment',
        severity: 'medium',
        description: 'Deployment operation detected',
        mitigation: 'Use blue-green or canary deployment, monitor metrics closely'
      });
    }

    // Performance risks
    if (lowerDesc.includes('performance') || lowerDesc.includes('optimize') || lowerDesc.includes('slow')) {
      risks.push({
        category: 'performance',
        severity: 'low',
        description: 'Performance changes may affect user experience',
        mitigation: 'Benchmark before and after, monitor latency and throughput'
      });
    }

    return risks;
  }

  /**
   * Generate suggestions for the task
   */
  generateSuggestions(description, type, context) {
    const suggestions = [];
    const lowerDesc = description.toLowerCase();

    // General suggestions
    suggestions.push({
      category: 'planning',
      priority: 'high',
      text: 'Break down the task into smaller, manageable steps'
    });

    // Testing suggestions
    if (!lowerDesc.includes('test')) {
      suggestions.push({
        category: 'testing',
        priority: 'high',
        text: 'Add comprehensive tests for the changes'
      });
    }

    // Documentation suggestions
    if (!lowerDesc.includes('document') && !lowerDesc.includes('readme')) {
      suggestions.push({
        category: 'documentation',
        priority: 'medium',
        text: 'Update relevant documentation after completing the task'
      });
    }

    // Code review suggestions
    if (type === 'code' || lowerDesc.includes('code')) {
      suggestions.push({
        category: 'review',
        priority: 'high',
        text: 'Have code reviewed by another team member before deployment'
      });
    }

    // Monitoring suggestions
    if (type === 'deployment' || lowerDesc.includes('deploy')) {
      suggestions.push({
        category: 'monitoring',
        priority: 'high',
        text: 'Set up monitoring and alerts for the new deployment'
      });
    }

    // Security suggestions
    if (type === 'security' || lowerDesc.includes('security')) {
      suggestions.push({
        category: 'security',
        priority: 'critical',
        text: 'Run security scans and vulnerability assessments'
      });
    }

    return suggestions;
  }

  /**
   * Identify prerequisites for the task
   */
  identifyPrerequisites(description, type) {
    const prerequisites = [];
    const lowerDesc = description.toLowerCase();

    // Database prerequisites
    if (lowerDesc.includes('database') || lowerDesc.includes('migration')) {
      prerequisites.push('Database backup completed');
      prerequisites.push('Migration scripts tested on staging');
      prerequisites.push('Rollback procedure documented');
    }

    // Deployment prerequisites
    if (lowerDesc.includes('deploy')) {
      prerequisites.push('All tests passing');
      prerequisites.push('Code reviewed and approved');
      prerequisites.push('Environment variables configured');
    }

    // Security prerequisites
    if (lowerDesc.includes('security') || lowerDesc.includes('auth')) {
      prerequisites.push('Security audit completed');
      prerequisites.push('Compliance requirements verified');
    }

    // Testing prerequisites
    if (lowerDesc.includes('test')) {
      prerequisites.push('Test environment available');
      prerequisites.push('Test data prepared');
    }

    // Always include these general prerequisites
    if (type !== 'documentation') {
      prerequisites.push('Local development environment set up');
      prerequisites.push('Dependencies installed and up to date');
    }

    return prerequisites;
  }

  /**
   * Estimate effort required
   */
  estimateEffort(description, type) {
    const complexity = this.analyzeComplexity(description, type);
    const lowerDesc = description.toLowerCase();

    let hours = 2; // Base estimate

    // Adjust by complexity
    if (complexity === 'critical') hours *= 4;
    else if (complexity === 'high') hours *= 2.5;
    else if (complexity === 'medium') hours *= 1.5;

    // Adjust by type
    const effortMultipliers = {
      'refactor': 2,
      'security': 1.5,
      'deployment': 1.3,
      'testing': 0.8,
      'documentation': 0.7
    };

    Object.entries(effortMultipliers).forEach(([keyword, multiplier]) => {
      if (lowerDesc.includes(keyword)) {
        hours *= multiplier;
      }
    });

    // Round to reasonable increments
    if (hours <= 4) return `${Math.ceil(hours)} hours`;
    if (hours <= 16) return `${Math.ceil(hours / 4) * 4} hours`;
    return `${Math.ceil(hours / 8)} days`;
  }

  /**
   * Calculate confidence in the review
   */
  calculateConfidence(description, type) {
    let confidence = 0.8; // Base confidence

    // More specific descriptions increase confidence
    if (description.length > 100) confidence += 0.1;
    if (description.length < 20) confidence -= 0.2;

    // Known types increase confidence
    const knownTypes = ['code', 'deployment', 'security', 'database', 'testing', 'documentation'];
    if (knownTypes.includes(type)) confidence += 0.1;

    return Math.min(Math.max(confidence, 0.5), 0.95);
  }

  /**
   * Generate overall recommendation
   */
  generateRecommendation(approved, risks, complexity) {
    if (!approved) {
      return 'CRITICAL REVIEW REQUIRED: This task has critical risks that must be addressed before proceeding. Review the identified risks and implement mitigation strategies.';
    }

    if (risks.length > 3) {
      return 'PROCEED WITH CAUTION: Multiple risks identified. Carefully review each risk and implement all suggested mitigations before starting.';
    }

    if (complexity === 'critical' || complexity === 'high') {
      return 'CAREFUL PLANNING RECOMMENDED: This is a complex task. Break it down into smaller steps, create a detailed plan, and consider pair programming or additional review.';
    }

    return 'APPROVED: Task reviewed and approved to proceed. Follow the suggestions and prerequisites to ensure successful completion.';
  }

  /**
   * Suggest next steps
   */
  suggestNextSteps(description, type, approved) {
    const steps = [];

    if (!approved) {
      steps.push('Address all critical risks identified in the review');
      steps.push('Revise the task plan and submit for re-review');
      return steps;
    }

    steps.push('Review all prerequisites and ensure they are met');
    steps.push('Create a detailed implementation plan with milestones');
    steps.push('Set up necessary monitoring and logging');
    steps.push('Begin implementation following best practices');
    steps.push('Test thoroughly at each milestone');
    steps.push('Document changes as you proceed');
    steps.push('Submit for code review before finalizing');

    return steps;
  }

  /**
   * Get task review history
   */
  getHistory(limit = 10) {
    return this.taskHistory.slice(-limit).reverse();
  }

  /**
   * Get a specific review by ID
   */
  getReviewById(reviewId) {
    return this.taskHistory.find(r => r.reviewId === reviewId);
  }

  /**
   * Add review to history
   */
  addToHistory(review) {
    this.taskHistory.push(review);

    // Keep history size manageable
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory.shift();
    }
  }

  /**
   * Generate unique review ID
   */
  generateReviewId() {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics about reviewed tasks
   */
  getStatistics() {
    const total = this.taskHistory.length;
    const approved = this.taskHistory.filter(r => r.analysis.approved).length;
    const byComplexity = this.taskHistory.reduce((acc, r) => {
      const complexity = r.analysis.complexity;
      acc[complexity] = (acc[complexity] || 0) + 1;
      return acc;
    }, {});

    return {
      total,
      approved,
      approvalRate: total > 0 ? (approved / total * 100).toFixed(1) + '%' : '0%',
      byComplexity,
      recentReviews: this.getHistory(5)
    };
  }
}

module.exports = new AgentReviewService();
