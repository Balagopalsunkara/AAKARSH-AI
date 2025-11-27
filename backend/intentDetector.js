const logger = require('./logger');

/**
 * Intent Detection Service
 * Classifies user queries into different intents for routing
 */

// Define intent categories and their patterns
const INTENT_CATEGORIES = {
  CHAT: {
    name: 'General Chat',
    description: 'General conversation and questions',
    keywords: ['hello', 'hi', 'how are you', 'what is', 'explain', 'tell me', 'describe', 'chat'],
    route: '/chat',
    priority: 1
  },
  CODE: {
    name: 'Code Related',
    description: 'Programming, coding, development questions',
    keywords: ['code', 'function', 'program', 'debug', 'error', 'syntax', 'python', 'javascript', 'java', 'algorithm', 'api', 'database'],
    route: '/rag',
    ragType: 'github',
    priority: 3
  },
  DOCUMENT_SEARCH: {
    name: 'Document Search',
    description: 'Search in uploaded documents or knowledge base',
    keywords: ['search', 'find', 'document', 'file', 'knowledge', 'lookup', 'retrieve', 'where is', 'show me'],
    route: '/rag',
    ragType: 'server',
    priority: 2
  },
  ANALYSIS: {
    name: 'Data Analysis',
    description: 'Data analysis, statistics, insights',
    keywords: ['analyze', 'analysis', 'statistics', 'data', 'chart', 'graph', 'trend', 'compare', 'evaluate'],
    route: '/rag',
    ragType: 'server',
    priority: 2
  },
  GITHUB: {
    name: 'GitHub Repository',
    description: 'GitHub repository related queries',
    keywords: ['github', 'repository', 'repo', 'commit', 'pull request', 'issue', 'branch', 'fork'],
    route: '/rag',
    ragType: 'github',
    priority: 4
  },
  DEVOPS: {
    name: 'DevOps Operations',
    description: 'CI/CD, deployment, containerization, infrastructure operations',
    keywords: ['deploy', 'deployment', 'docker', 'container', 'kubernetes', 'k8s', 'ci/cd', 'pipeline', 'build', 'jenkins', 'github actions', 'gitlab', 'terraform', 'ansible', 'infrastructure'],
    route: '/chat',
    priority: 3
  },
  SECURITY: {
    name: 'Security Operations',
    description: 'Security vulnerabilities, compliance, access control, authentication',
    keywords: ['security', 'vulnerability', 'cve', 'authentication', 'authorization', 'oauth', 'jwt', 'ssl', 'tls', 'encryption', 'penetration', 'audit', 'compliance', 'gdpr', 'hipaa', 'firewall', 'intrusion'],
    route: '/chat',
    priority: 4
  },
  MONITORING: {
    name: 'Monitoring & Observability',
    description: 'System monitoring, logs, metrics, alerting, performance tracking',
    keywords: ['monitor', 'monitoring', 'log', 'logs', 'metric', 'metrics', 'alert', 'alerting', 'prometheus', 'grafana', 'elk', 'splunk', 'apm', 'trace', 'observability', 'dashboard'],
    route: '/chat',
    priority: 3
  },
  INCIDENT: {
    name: 'Incident Response',
    description: 'Troubleshooting, debugging, incident management, root cause analysis',
    keywords: ['incident', 'outage', 'downtime', 'troubleshoot', 'debug', 'fix', 'broken', 'not working', 'crash', 'failure', 'root cause', 'postmortem', '500 error', '404 error', 'timeout'],
    route: '/chat',
    priority: 5
  },
  DATABASE: {
    name: 'Database Operations',
    description: 'Database queries, optimization, backup, migration, schema design',
    keywords: ['database', 'sql', 'query', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'schema', 'migration', 'backup', 'restore', 'index', 'optimize', 'orm', 'prisma', 'sequelize'],
    route: '/chat',
    priority: 3
  },
  DOCUMENTATION: {
    name: 'Documentation',
    description: 'Technical documentation, API docs, runbooks, writing guides',
    keywords: ['documentation', 'document', 'readme', 'wiki', 'guide', 'tutorial', 'how-to', 'manual', 'api doc', 'swagger', 'openapi', 'runbook', 'playbook'],
    route: '/chat',
    priority: 2
  },
  TESTING: {
    name: 'Testing & QA',
    description: 'Unit testing, integration testing, test automation, quality assurance',
    keywords: ['test', 'testing', 'jest', 'mocha', 'pytest', 'junit', 'selenium', 'cypress', 'coverage', 'mock', 'stub', 'qa', 'quality', 'e2e', 'integration test', 'unit test'],
    route: '/chat',
    priority: 3
  },
  PERFORMANCE: {
    name: 'Performance Optimization',
    description: 'Performance tuning, profiling, caching, scalability improvements',
    keywords: ['performance', 'optimize', 'optimization', 'slow', 'latency', 'throughput', 'cache', 'caching', 'scale', 'scalability', 'profile', 'profiling', 'bottleneck', 'memory leak'],
    route: '/chat',
    priority: 3
  },
  PROJECT_MANAGEMENT: {
    name: 'Project Management',
    description: 'Sprint planning, task estimation, agile methodologies, retrospectives',
    keywords: ['sprint', 'scrum', 'agile', 'kanban', 'backlog', 'story', 'epic', 'retrospective', 'standup', 'planning', 'estimation', 'velocity', 'jira', 'ticket'],
    route: '/chat',
    priority: 2
  },
  CODE_REVIEW: {
    name: 'Code Review',
    description: 'Code quality, best practices, refactoring, design patterns',
    keywords: ['code review', 'review', 'refactor', 'refactoring', 'clean code', 'best practice', 'design pattern', 'solid', 'dry', 'code smell', 'technical debt', 'lint', 'linting'],
    route: '/chat',
    priority: 3
  },
  SYSTEM_ADMIN: {
    name: 'System Administration',
    description: 'User management, server configuration, backups, system maintenance',
    keywords: ['admin', 'administrator', 'user management', 'permission', 'role', 'server', 'nginx', 'apache', 'systemd', 'cron', 'backup', 'maintenance', 'configuration', 'setup'],
    route: '/chat',
    priority: 3
  },
  WEB_SEARCH: {
    name: 'Web Search',
    description: 'Search the internet for current information',
    keywords: ['search', 'google', 'bing', 'latest', 'news', 'current', 'weather', 'price', 'stock', 'who is', 'what is', 'when is', 'find online', 'look up'],
    route: '/chat',
    priority: 5
  },
  IMAGE_GENERATION: {
    name: 'Image Generation',
    description: 'Generate images from text description',
    keywords: ['generate image', 'create image', 'draw', 'picture of', 'image of', 'photo of', 'illustrate', 'paint'],
    route: '/image',
    priority: 5
  }
};

class IntentDetector {
  constructor() {
    this.intents = INTENT_CATEGORIES;
  }

  /**
   * Detect intent from user input
   */
  detectIntent(userInput) {
    const input = userInput.toLowerCase();
    const scores = {};

    // Calculate scores for each intent based on keyword matching
    for (const [intentKey, intent] of Object.entries(this.intents)) {
      let score = 0;

      // Check for keyword matches
      for (const keyword of intent.keywords) {
        if (input.includes(keyword)) {
          score += intent.priority;
        }
      }

      scores[intentKey] = score;
    }

    // Find intent with highest score
    let detectedIntent = 'CHAT'; // Default to chat
    let maxScore = 0;

    for (const [intentKey, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intentKey;
      }
    }

    const intent = this.intents[detectedIntent];

    logger.info('Intent detected', {
      input: userInput.substring(0, 100),
      detectedIntent,
      score: maxScore,
      route: intent.route
    });

    return {
      intent: detectedIntent,
      name: intent.name,
      description: intent.description,
      route: intent.route,
      ragType: intent.ragType,
      confidence: maxScore > 0 ? Math.min(maxScore / 10, 1) : 0.5,
      scores
    };
  }

  /**
   * Get all available intents
   */
  getAvailableIntents() {
    return Object.entries(this.intents).map(([key, intent]) => ({
      id: key,
      name: intent.name,
      description: intent.description,
      route: intent.route,
      ragType: intent.ragType
    }));
  }

  /**
   * Classify multiple queries in batch
   */
  batchDetect(queries) {
    return queries.map(query => this.detectIntent(query));
  }
}

module.exports = new IntentDetector();
