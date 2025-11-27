const logger = require('./logger');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

let octokitLoadPromise;

async function loadOctokitCtor() {
  if (octokitLoadPromise) {
    return octokitLoadPromise;
  }

  octokitLoadPromise = (async () => {
    try {
      const mod = await import('@octokit/rest');
      return mod.Octokit;
    } catch (error) {
      try {
        const fallback = await import('octokit');
        return fallback.Octokit;
      } catch (fallbackError) {
        logger.error('Failed to load Octokit module', {
          error: fallbackError.message,
        });
        throw fallbackError;
      }
    }
  })();

  return octokitLoadPromise;
}

/**
 * RAG (Retrieval-Augmented Generation) Service
 * Supports two data sources: GitHub repositories and local server storage
 */

class RAGService {
  constructor() {
    this.githubClient = null;
    this.serverStoragePath = path.join(__dirname, 'rag_storage');
    this.vectorStore = new Map(); // Simple in-memory vector store
    
    this.initializeGitHubClient();
    this.initializeServerStorage();
  }

  async initializeGitHubClient() {
    if (!process.env.GITHUB_TOKEN) {
      return;
    }

    try {
      const OctokitCtor = await loadOctokitCtor();
      this.githubClient = new OctokitCtor({
        auth: process.env.GITHUB_TOKEN,
      });
      logger.info('GitHub client initialized for RAG');
    } catch (error) {
      logger.error('Failed to initialize GitHub client', { error: error.message });
    }
  }

  /**
   * Initialize server storage directory
   */
  async initializeServerStorage() {
    try {
      await fs.mkdir(this.serverStoragePath, { recursive: true });
      logger.info('RAG server storage initialized', { path: this.serverStoragePath });
    } catch (error) {
      logger.error('Failed to initialize RAG storage', { error: error.message });
    }
  }

  /**
   * Search GitHub repository for relevant content
   */
  async searchGitHub(query, options = {}) {
    if (!this.githubClient) {
      throw new Error('GitHub token not configured. Set GITHUB_TOKEN environment variable.');
    }

    try {
      const {
        owner = process.env.GITHUB_RAG_OWNER,
        repo = process.env.GITHUB_RAG_REPO,
        maxResults = 5
      } = options;

      if (!owner || !repo) {
        throw new Error('GitHub repository not configured. Set GITHUB_RAG_OWNER and GITHUB_RAG_REPO.');
      }

      logger.info('Searching GitHub repository', { owner, repo, query });

      // Search code in repository
      const searchResults = await this.githubClient.search.code({
        q: `${query} repo:${owner}/${repo}`,
        per_page: maxResults
      });

      const results = await Promise.all(
        searchResults.data.items.map(async (item) => {
          try {
            // Get file content
            const content = await this.githubClient.repos.getContent({
              owner,
              repo,
              path: item.path
            });

            const fileContent = Buffer.from(content.data.content, 'base64').toString('utf-8');

            return {
              source: 'github',
              path: item.path,
              url: item.html_url,
              content: fileContent.substring(0, 1000), // Limit content size
              score: item.score,
              repository: `${owner}/${repo}`
            };
          } catch (error) {
            logger.warn('Failed to fetch file content', { path: item.path, error: error.message });
            return null;
          }
        })
      );

      return results.filter(r => r !== null);
    } catch (error) {
      logger.error('GitHub search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Search server storage for relevant documents
   */
  async searchServer(query, options = {}) {
    try {
      const { maxResults = 5 } = options;

      logger.info('Searching server storage', { query, path: this.serverStoragePath });

      // Read all files from storage
      const files = await fs.readdir(this.serverStoragePath);
      const results = [];

      for (const file of files) {
        if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
          const filePath = path.join(this.serverStoragePath, file);
          const content = await fs.readFile(filePath, 'utf-8');

          // Simple keyword matching (can be replaced with vector similarity)
          const relevanceScore = this.calculateRelevance(query, content);

          if (relevanceScore > 0) {
            results.push({
              source: 'server',
              path: file,
              content: content.substring(0, 1000),
              score: relevanceScore,
              timestamp: (await fs.stat(filePath)).mtime
            });
          }
        }
      }

      // Sort by relevance and limit results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, maxResults);
    } catch (error) {
      logger.error('Server search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate simple relevance score
   */
  calculateRelevance(query, content) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const count = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += count;
    }

    return score;
  }

  /**
   * Upload document to server storage
   */
  async uploadDocument(filename, content) {
    try {
      const filePath = path.join(this.serverStoragePath, filename);
      await fs.writeFile(filePath, content, 'utf-8');

      logger.info('Document uploaded to server storage', { filename });

      return {
        success: true,
        filename,
        path: filePath,
        size: content.length
      };
    } catch (error) {
      logger.error('Document upload failed', { error: error.message, filename });
      throw error;
    }
  }

  /**
   * List documents in server storage
   */
  async listDocuments() {
    try {
      const files = await fs.readdir(this.serverStoragePath);
      const documents = [];

      for (const file of files) {
        const filePath = path.join(this.serverStoragePath, file);
        const stats = await fs.stat(filePath);

        documents.push({
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }

      return documents;
    } catch (error) {
      logger.error('Failed to list documents', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete document from server storage
   */
  async deleteDocument(filename) {
    try {
      const filePath = path.join(this.serverStoragePath, filename);
      await fs.unlink(filePath);

      logger.info('Document deleted from server storage', { filename });

      return { success: true, filename };
    } catch (error) {
      logger.error('Document deletion failed', { error: error.message, filename });
      throw error;
    }
  }

  /**
   * Perform RAG query (retrieve + generate)
   */
  async query(userQuery, options = {}) {
    const { source = 'auto', llmService } = options;

    try {
      let context = [];

      // Retrieve relevant documents
      if (source === 'github' || source === 'auto') {
        if (this.githubClient) {
          const githubResults = await this.searchGitHub(userQuery, options);
          context.push(...githubResults);
        }
      }

      if (source === 'server' || source === 'auto') {
        const serverResults = await this.searchServer(userQuery, options);
        context.push(...serverResults);
      }

      // Sort by relevance
      context.sort((a, b) => b.score - a.score);
      const topContext = context.slice(0, 3);

      // Build augmented prompt
      const contextText = topContext.map((ctx, idx) => 
        `[Source ${idx + 1}: ${ctx.source} - ${ctx.path}]\n${ctx.content}`
      ).join('\n\n---\n\n');

      const augmentedPrompt = `Based on the following context, please answer the question.

Context:
${contextText}

Question: ${userQuery}

Answer:`;

      return {
        context: topContext,
        augmentedPrompt,
        sources: topContext.map(ctx => ({
          source: ctx.source,
          path: ctx.path,
          url: ctx.url,
          score: ctx.score
        }))
      };
    } catch (error) {
      logger.error('RAG query failed', { error: error.message, query: userQuery });
      throw error;
    }
  }

  /**
   * Check if RAG sources are configured
   */
  getStatus() {
    return {
      github: {
        configured: !!this.githubClient,
        owner: process.env.GITHUB_RAG_OWNER || null,
        repo: process.env.GITHUB_RAG_REPO || null
      },
      server: {
        configured: true,
        path: this.serverStoragePath
      }
    };
  }
}

module.exports = new RAGService();
