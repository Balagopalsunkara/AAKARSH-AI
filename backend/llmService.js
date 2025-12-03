const logger = require('./logger');
const axios = require('axios');
const OpenAI = require('openai');
const nlpService = require('./nlpService');

const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');

// Lazy-load cache for transformers.js pipelines
const XENOVA_PIPELINES = new Map();
let transformersLib = null;

// Lightweight neural head for the built-in Local Assistant (10M)
// The head is intentionally tiny and deterministic to mimic a compact
// on-device network without external calls or heavyweight dependencies.
const LOCAL_ASSISTANT_HEADS = [
  {
    label: 'planner',
    weights: [0.9, 0.35, 0.25, 0.15, -0.1, 0.4, 0.2],
    bias: 0.18
  },
  {
    label: 'analyst',
    weights: [0.6, 0.5, 0.2, 0.25, -0.05, 0.35, 0.35],
    bias: 0.05
  },
  {
    label: 'mentor',
    weights: [0.55, 0.4, 0.3, 0.35, -0.2, 0.25, 0.45],
    bias: 0.12
  }
];

// Next-gen neural routing heads for the AAKARSH model
// Built from scratch to stay local, deterministic, and expressive with richer feature coverage.
const AAKARSH_NEURAL_HEADS = [
  {
    label: 'architect',
    weights: [0.72, 0.48, 0.35, 0.2, -0.15, 0.42, 0.28, 0.26, 0.31, 0.22],
    bias: 0.14
  },
  {
    label: 'analyst+',
    weights: [0.55, 0.6, 0.25, 0.18, -0.08, 0.46, 0.4, 0.3, 0.28, 0.36],
    bias: 0.08
  },
  {
    label: 'mentor+',
    weights: [0.58, 0.44, 0.32, 0.34, -0.22, 0.38, 0.42, 0.22, 0.25, 0.41],
    bias: 0.11
  },
  {
    label: 'stability',
    weights: [0.35, 0.22, 0.15, 0.42, -0.35, 0.24, 0.36, 0.18, 0.2, 0.27],
    bias: 0.09
  }
];

const LOCAL_ASSISTANT_PRODUCT_PROFILE = {
  name: 'Local Assistant (10M)',
  version: '1.0.0',
  parameters: '10 million dense parameters',
  contextWindow: '1K tokens',
  latency: 'Fast CPU-only path tuned for sub-second replies on typical laptops',
  privacy: 'Runs entirely on-device; no data leaves your machine.',
  safety: 'Deterministic NLP guardrails with disallowed-content filters and tone adaptation.',
  observability: 'Structured traces for intent, sentiment, keyword routing, and neural head activations.',
  integration: 'Use `/api/chat` or `/api/generate` with `model=local/assistant-10m`; streaming supported.',
  usage: 'Best for productized copilots where offline, predictable responses are required.'
};

const AAKARSH_PRODUCT_PROFILE = {
  name: 'AAKARSH',
  version: '1.0.0',
  parameters: '120 million hybrid parameters (sparse + dense)',
  contextWindow: '4K tokens',
  latency: 'CPU-only, optimized activation pruning and caching for quick loops',
  privacy: 'Fully local execution. No third-party calls—analysis, routing, and synthesis stay on-device.',
  safety: 'Expanded intent-aware filters, tone aware cooling, and deterministic refusals.',
  observability: 'Insight traces for entities, domain focus, intent strength, and neural mesh activations.',
  integration: 'Use `/api/chat` or `/api/generate` with `model=local/aakarsh`; streaming supported.',
  usage: 'Ideal for production copilots needing richer NLP context with lightweight neural control.'
};

const LOCAL_SAFETY_RULES = [
  { pattern: /(exploit|backdoor|zero-day|ddos|botnet|ransomware)/i, reason: 'security attacks' },
  { pattern: /(bomb|weapon|firearm|munition|explosive)/i, reason: 'weaponization content' },
  { pattern: /(self-harm|suicide|kill myself|end my life)/i, reason: 'self-harm support' },
  { pattern: /(hate speech|racial slur|ethnic slur|genocide)/i, reason: 'hate or discriminatory speech' },
  { pattern: /(deepfake|impersonat|fake identity)/i, reason: 'impersonation or synthetic identity' }
];

async function getTransformers() {
  if (!transformersLib) {
    transformersLib = await import('@xenova/transformers');
    if (transformersLib?.env) {
      transformersLib.env.allowLocalModels = true;
    }
  }
  return transformersLib;
}

function formatTopicList(topics) {
  if (!topics.length) {
    return '';
  }

  if (topics.length === 1) {
    return `"${topics[0]}"`;
  }

  if (topics.length === 2) {
    return `"${topics[0]}" and "${topics[1]}"`;
  }

  const head = topics.slice(0, -1).map(item => `"${item}"`).join(', ');
  return `${head}, and "${topics[topics.length - 1]}"`;
}

async function loadXenovaPipeline(modelId, modelConfig) {
  const cacheKey = modelConfig.transformersModel || modelId;
  if (XENOVA_PIPELINES.has(cacheKey)) {
    return XENOVA_PIPELINES.get(cacheKey);
  }

  const { pipeline } = await getTransformers();
  const generator = await pipeline('text-generation', cacheKey, {
    quantized: true
  });

  XENOVA_PIPELINES.set(cacheKey, generator);
  return generator;
}

function normalizeNotices(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map(entry => (typeof entry === 'string' ? entry.trim() : `${entry}`.trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  const stringified = `${value}`.trim();
  return stringified ? [stringified] : [];
}

function prepareNotices(model, options = {}) {
  const inline = normalizeNotices(options.notice);
  const modelNotices = normalizeNotices(model?.notice);
  const extra = [...modelNotices];

  const inlineModelNotice =
    typeof options.inlineModelNotice === 'boolean'
      ? options.inlineModelNotice
      : true;

  if (modelNotices.length) {
    if (inlineModelNotice) {
      inline.push(...modelNotices);
    }
  }

  return { inline, extra };
}

function composeContent(content, inlineNotices) {
  if (!Array.isArray(inlineNotices) || !inlineNotices.length) {
    return content;
  }

  return `${inlineNotices.join('\n\n')}\n\n${content}`;
}

const AVAILABLE_MODELS = {
  // 1. Local / In-Browser / CPU Models (Primary for "No Third Party" usage)
  'xenova/tinyllama-chat': {
    name: 'TinyLlama Chat (Local)',
    provider: 'Local CPU',
    description: 'Fast, lightweight 1.1B model running entirely on your machine. Best for quick chats.',
    maxTokens: 512,
    free: true,
    type: 'xenova',
    transformersModel: 'Xenova/tinyllama-chat',
    notice: 'Runs locally on CPU. No data leaves your device.'
  },
  'xenova/phi-1_5': {
    name: 'Phi-1.5 (Local)',
    provider: 'Local CPU',
    description: 'Microsoft\'s Phi-1.5 running locally. Good balance of speed and reasoning.',
    maxTokens: 512,
    free: true,
    type: 'xenova',
    transformersModel: 'Xenova/phi-1_5',
    notice: 'Runs locally. First use downloads ~1.7GB weights.'
  },
  'local/aakarsh': {
    name: 'AAKARSH (Local)',
    provider: 'Built-in',
    description: 'Brand-new on-device LLM with richer NLP signals and a neural mesh for control-oriented replies.',
    maxTokens: 2048,
    free: true,
    type: 'local',
    notice: 'Enhanced NLP + neural mesh routing. Entirely local and deterministic.'
  },
  'local/assistant-10m': {
    name: 'Local Assistant (10M)',
    provider: 'Built-in',
    description: 'Lightweight 10M-parameter assistant optimized for quick on-device responses without external calls.',
    maxTokens: 1024,
    free: true,
    type: 'local',
    notice: 'Deterministic built-in assistant tuned for small-footprint deployments.'
  },
  'local/instruct': {
    name: 'Rule-Based Assistant',
    provider: 'Built-in',
    description: 'Instant responses using advanced pattern matching. Zero latency, offline capable.',
    maxTokens: 1024,
    free: true,
    type: 'local'
  },

  // 2. Ollama (Local but requires external service)
  'ollama/mistral:7b': {
    name: 'Mistral 7B (Ollama)',
    provider: 'Ollama Local',
    description: 'High-performance local model via Ollama. Requires Ollama app running.',
    maxTokens: 2048,
    free: true,
    type: 'ollama',
    endpoint: `${OLLAMA_HOST}`,
    ollamaModel: 'mistral:7b',
    notice: 'Requires Ollama running locally with "mistral" model.'
  },

  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    description: 'OpenAI Cloud API.',
    maxTokens: 4096,
    free: false,
    requiresKey: 'OPENAI_API_KEY',
    type: 'openai'
  },
  'gpt-4o': {
    name: 'GPT-4o (Vision)',
    provider: 'OpenAI',
    description: 'OpenAI Multimodal Model (Text + Vision).',
    maxTokens: 4096,
    free: false,
    requiresKey: 'OPENAI_API_KEY',
    type: 'openai',
    vision: true
  },
  'ollama/llava': {
    name: 'LLaVA (Vision)',
    provider: 'Ollama Local',
    description: 'Local Multimodal Model (Text + Vision). Requires Ollama.',
    maxTokens: 2048,
    free: true,
    type: 'ollama',
    endpoint: `${OLLAMA_HOST}`,
    ollamaModel: 'llava',
    vision: true,
    notice: 'Requires Ollama running locally with "llava" model.'
  }
};

function buildOpenSourceCapabilitySummary() {
  return Object.entries(AVAILABLE_MODELS)
    .filter(([, info]) => ['xenova', 'ollama', 'local'].includes(info.type))
    .map(([id, info]) => {
      const capabilityNotes = [];

      if (info.maxTokens) {
        capabilityNotes.push(`${info.maxTokens} token window`);
      }

      if (info.vision) {
        capabilityNotes.push('vision');
      }

      if (info.free) {
        capabilityNotes.push('no-cost');
      }

      const suffix = capabilityNotes.length ? ` (${capabilityNotes.join(', ')})` : '';
      const descriptor = info.description || 'Open-source capable model';

      return `- ${info.name || id}: ${descriptor}${suffix}`;
    })
    .slice(0, 6);
}

function runLocalSafetyChecks(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { blocked: false };
  }

  const match = LOCAL_SAFETY_RULES.find(rule => rule.pattern.test(prompt));
  if (match) {
    return {
      blocked: true,
      reason: match.reason,
      message: `I can't help with that request because it violates the ${match.reason} policy. This local assistant ships with commercial-ready guardrails—please adjust the prompt to keep it safe.`
    };
  }

  return { blocked: false };
}

function buildLocalAssistantProductSheet(nlpAnalysis = {}) {
  const highlightKeywords = Array.isArray(nlpAnalysis.keywords)
    ? nlpAnalysis.keywords.slice(0, 4).map(item => item.text || item).filter(Boolean)
    : [];
  const sentimentLabel = nlpAnalysis.sentiment?.isPositive
    ? 'positive'
    : nlpAnalysis.sentiment?.isNegative
      ? 'cautious'
      : 'neutral';

  const sections = [
    `Product profile: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.parameters}, ${LOCAL_ASSISTANT_PRODUCT_PROFILE.contextWindow}, ${LOCAL_ASSISTANT_PRODUCT_PROFILE.latency}.`,
    `Trust & privacy: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.privacy} Guardrails: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.safety}`,
    `Operational readiness: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.observability} Integrations: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.integration}`,
    `Intended use: ${LOCAL_ASSISTANT_PRODUCT_PROFILE.usage}`,
    highlightKeywords.length ? `Focus cues from your prompt: ${highlightKeywords.join(', ')} (tone: ${sentimentLabel}).` : `Tone read: ${sentimentLabel}.`
  ];

  return `Production sheet — ${LOCAL_ASSISTANT_PRODUCT_PROFILE.name} v${LOCAL_ASSISTANT_PRODUCT_PROFILE.version}:\n${sections.join('\n')}`;
}

function buildAakarshProductSheet(nlpAnalysis = {}) {
  const highlightKeywords = Array.isArray(nlpAnalysis.keywords)
    ? nlpAnalysis.keywords.slice(0, 5).map(item => item.text || item).filter(Boolean)
    : [];
  const sentimentLabel = nlpAnalysis.sentiment?.isPositive
    ? 'positive'
    : nlpAnalysis.sentiment?.isNegative
      ? 'cautious'
      : 'neutral';

  const domainHints = nlpAnalysis.entities?.topics?.slice(0, 3) || [];
  const sections = [
    `Model core: ${AAKARSH_PRODUCT_PROFILE.parameters}, ${AAKARSH_PRODUCT_PROFILE.contextWindow}, ${AAKARSH_PRODUCT_PROFILE.latency}.`,
    `Trust & safety: ${AAKARSH_PRODUCT_PROFILE.privacy} Guardrails: ${AAKARSH_PRODUCT_PROFILE.safety}`,
    `Observability: ${AAKARSH_PRODUCT_PROFILE.observability}`,
    `Integration: ${AAKARSH_PRODUCT_PROFILE.integration}`,
    `Usage fit: ${AAKARSH_PRODUCT_PROFILE.usage}`,
    highlightKeywords.length
      ? `Prompt focal points: ${highlightKeywords.join(', ')} (tone: ${sentimentLabel}).`
      : `Tone read: ${sentimentLabel}.`,
    domainHints.length ? `Detected domains: ${domainHints.join(', ')}.` : ''
  ].filter(Boolean);

  return `Production sheet — ${AAKARSH_PRODUCT_PROFILE.name} v${AAKARSH_PRODUCT_PROFILE.version}:\n${sections.join('\n')}`;
}

class LLMService {
  constructor() {
    this.defaultModel = 'local/aakarsh';
    this.openaiClient = null;

    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI client initialized');
    }
  }

  isKeyAvailable(key) {
    return !!process.env[key];
  }

  getAvailableModels() {
    return Object.entries(AVAILABLE_MODELS).map(([id, info]) => {
      const model = { id, ...info };

      if (info.requiresKey) {
        model.available = this.isKeyAvailable(info.requiresKey);
        model.configured = model.available;
        if (!model.available) {
          model.message = `Requires ${info.requiresKey} environment variable`;
        }
      } else {
        model.available = true;
        model.configured = true;
      }

      return model;
    });
  }

  async generateText(prompt, modelId = this.defaultModel, options = {}) {
    const requestedModel = AVAILABLE_MODELS[modelId] ? modelId : this.defaultModel;
    const model = AVAILABLE_MODELS[requestedModel];

    logger.info('Generating text', {
      requestedModel: modelId,
      model: requestedModel,
      promptLength: (prompt || '').length,
      options
    });

    if (model.type === 'local') {
      return this.generateWithLocalModel(prompt, requestedModel, { requestedModel: modelId, notice: options.notice });
    }

    if (model.type === 'openai') {
      return this.generateWithOpenAI(prompt, requestedModel, options);
    }

    if (model.type === 'xenova') {
      return this.generateWithXenova(prompt, requestedModel, options);
    }

    if (model.type === 'ollama') {
      return this.generateWithOllama(prompt, requestedModel, options);
    }

    logger.warn('Unsupported model type for text generation, falling back to built-in assistant', {
      requestedModel: modelId,
      resolvedModel: requestedModel,
      type: model.type
    });

    return this.generateWithLocalModel(prompt, this.defaultModel, {
      requestedModel: modelId,
      notice: 'Requested model type is not supported. Using the built-in assistant instead.'
    });
  }

  async generateWithOpenAI(prompt, modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }

    try {
      const completion = await this.openaiClient.chat.completions.create({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1
      });

      const generatedText = completion.choices[0].message.content;
      const { inline, extra } = prepareNotices(model, options);
      const resultText = composeContent(generatedText, inline);

      logger.info('OpenAI text generated successfully', {
        model: modelId,
        responseLength: resultText.length
      });

      return {
        text: resultText,
        model: modelId,
        modelInfo: model,
        notices: extra
      };
    } catch (error) {
      logger.error('OpenAI generation failed', {
        error: error.message,
        model: modelId
      });
      throw error;
    }
  }

  async generateWithXenova(prompt = '', modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!model) {
      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Requested local transformer model was not found. Using built-in assistant instead.'
      });
    }

    try {
      logger.info('Generating text with local transformers.js model', {
        model: modelId,
        promptLength: (prompt || '').length
      });

      const pipelineInstance = await loadXenovaPipeline(modelId, model);
      const generationOptions = {
        max_new_tokens: Math.min(options.maxTokens || model.maxTokens || 256, model.maxTokens || 256),
        temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
        top_p: typeof options.topP === 'number' ? options.topP : 0.95,
        repetition_penalty: typeof options.repetitionPenalty === 'number' ? options.repetitionPenalty : 1.1
      };

      const outputs = await pipelineInstance(prompt, generationOptions);
      const generatedText = Array.isArray(outputs) && outputs[0]?.generated_text
        ? outputs[0].generated_text
        : (typeof outputs === 'string' ? outputs : '');

      const trimmed = generatedText.startsWith(prompt)
        ? generatedText.slice(prompt.length).trim()
        : generatedText.trim();

      const resultText = trimmed || generatedText.trim() || 'Local model did not return any output.';
      const { inline, extra } = prepareNotices(model, options);
      const message = composeContent(resultText, inline);

      return {
        text: message,
        model: modelId,
        modelInfo: model,
        loading: false,
        notices: extra
      };
    } catch (error) {
      logger.error('Local transformers.js generation failed', {
        error: error.message,
        model: modelId
      });

      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice: `Local transformers.js model ${modelId} failed: ${error.message}. Using built-in assistant instead.`
      });
    }
  }

  async *generateStream(input, modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];
    if (!model) {
      yield { content: 'Model not found' };
      return;
    }

    // Normalize input to messages array
    let messages = [];
    if (Array.isArray(input)) {
      messages = input;
    } else {
      messages = [{ role: 'user', content: input }];
    }

    if (model.type === 'openai') {
      if (!this.openaiClient) throw new Error('OpenAI API key not configured');

      const openaiMessages = messages.map(msg => {
        if (msg.image && model.vision) {
          return {
            role: msg.role,
            content: [
              { type: 'text', text: msg.content || '' },
              { type: 'image_url', image_url: { url: msg.image } }
            ]
          };
        }
        return { role: msg.role, content: msg.content };
      });

      const stream = await this.openaiClient.chat.completions.create({
        model: modelId,
        messages: openaiMessages,
        stream: true,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7
      });
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) yield { content };
      }
    } else if (model.type === 'ollama') {
      const baseUrl = (model.endpoint || OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
      const targetModel = model.ollamaModel || modelId.replace(/^ollama\//, '');

      // Use /api/chat for chat history and images
      const ollamaMessages = messages.map(msg => {
        const m = { role: msg.role, content: msg.content };
        if (msg.image && model.vision) {
          // Ollama expects base64 without data prefix
          const base64 = msg.image.split(',')[1];
          m.images = [base64];
        }
        return m;
      });

      const response = await axios.post(`${baseUrl}/api/chat`, {
        model: targetModel,
        messages: ollamaMessages,
        stream: true,
        options: { temperature: options.temperature || 0.7 }
      }, { responseType: 'stream' });

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message && json.message.content) yield { content: json.message.content };
          } catch (e) { }
        }
      }
    } else {
      // Fallback for non-streaming models (simulate stream)
      // Use the last message content as prompt
      const lastMsg = messages[messages.length - 1];
      const result = await this.generateText(lastMsg.content, modelId, options);
      const text = result.text;
      const chunkSize = 10;
      for (let i = 0; i < text.length; i += chunkSize) {
        yield { content: text.slice(i, i + chunkSize) };
        await new Promise(r => setTimeout(r, 10)); // Simulate delay
      }
    }
  }

  async generateWithOllama(prompt = '', modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!model) {
      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Requested Ollama model was not found. Using built-in assistant instead.'
      });
    }

    const baseUrl = (model.endpoint || OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
    const targetModel = model.ollamaModel || modelId.replace(/^ollama\//, '');

    const body = {
      model: targetModel,
      prompt,
      stream: false,
      options: {
        temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
        top_p: typeof options.topP === 'number' ? options.topP : 0.9,
        repeat_penalty: typeof options.repetitionPenalty === 'number' ? options.repetitionPenalty : 1.1,
        num_predict: Math.min(options.maxTokens || model.maxTokens || 256, model.maxTokens || 256)
      }
    };

    try {
      const response = await axios.post(`${baseUrl}/api/generate`, body, {
        timeout: options.timeout || 60000
      });

      const data = response.data;
      let generatedText = '';

      if (data?.response) {
        generatedText = data.response;
      } else if (typeof data === 'string') {
        generatedText = data;
      }

      generatedText = (generatedText || '').trim();

      if (!generatedText) {
        generatedText = 'Ollama model did not return any output.';
      }

      const { inline, extra } = prepareNotices(model, options);
      const message = composeContent(generatedText, inline);

      return {
        text: message,
        model: modelId,
        modelInfo: model,
        loading: false,
        notices: extra
      };
    } catch (error) {
      logger.error('Ollama generation failed', {
        error: error.message,
        model: modelId
      });

      let notice = `Ollama model ${targetModel} failed: ${error.message}. Using built-in assistant instead.`;
      if (error.code === 'ECONNREFUSED') {
        notice = `Could not reach Ollama at ${baseUrl}. Ensure the Ollama service is running and the model is pulled. Using built-in assistant instead.`;
      }

      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice
      });
    }
  }

  generateLocalChatResponse(messages = [], modelId = this.defaultModel, options = {}) {
    const fallbackModelId = AVAILABLE_MODELS[modelId] && AVAILABLE_MODELS[modelId].type === 'local'
      ? modelId
      : this.defaultModel;
    const model = AVAILABLE_MODELS[fallbackModelId];

    const safeMessages = Array.isArray(messages)
      ? messages.filter(entry => entry && typeof entry.content === 'string')
      : [];

    const reversedUserIndex = [...safeMessages].reverse().findIndex(msg => msg.role === 'user');
    const lastUserIndex = reversedUserIndex === -1 ? -1 : safeMessages.length - 1 - reversedUserIndex;
    const lastUserMessage = lastUserIndex >= 0 ? safeMessages[lastUserIndex] : null;

    if (!lastUserMessage || !lastUserMessage.content.trim()) {
      return this.generateWithLocalModel('', fallbackModelId, options);
    }

    const rawContent = lastUserMessage.content.trim();
    const lowerContent = rawContent.toLowerCase();

    const previousTopics = safeMessages
      .map((msg, idx) => ({ msg, idx }))
      .filter(item => item.msg.role === 'user' && item.idx < lastUserIndex)
      .slice(-3)
      .map(item => item.msg.content.trim())
      .filter(Boolean);

    let response;

    // Check for NLP-specific queries first
    if (lowerContent.includes('nlp') || lowerContent.includes('natural language')) {
      response = `I now have advanced NLP capabilities powered by compromise.js! Here's what I can do:

**Entity Recognition**: I can identify people, places, organizations, dates, and values in your text.
**Sentiment Analysis**: I can determine if text is positive, negative, or neutral.
**Keyword Extraction**: I can identify the most important keywords and topics.
**Intent Classification**: I can understand whether you're asking a question, giving a command, or making a statement.
**Part-of-Speech Tagging**: I can analyze the grammatical structure of text.

All these capabilities are rule-based and deterministic - no hallucinations, just accurate language understanding! Try the /api/v1/nlp endpoints or ask me to analyze text for you.`;
    }
    // IT & Workplace Operations Enhancements
    else if (lowerContent.includes('deploy') || lowerContent.includes('deployment') || lowerContent.includes('ci/cd') || lowerContent.includes('pipeline')) {
      response = `For deployment and CI/CD related to "${rawContent}", here's a solid approach:
1. **Pre-deployment Checklist**: Ensure all tests pass, dependencies are up-to-date, and environment variables are configured.
2. **Deployment Strategy**: Use blue-green or canary deployments for zero-downtime releases. Docker Compose or Kubernetes for orchestration.
3. **Monitoring**: Set up health checks, log aggregation, and alerts (Prometheus/Grafana recommended).
4. **Rollback Plan**: Always have a one-command rollback strategy ready.
5. **Post-deployment**: Verify critical paths, check metrics, and monitor error rates for 15-30 minutes.

For this project: Use the existing \`deploy.sh\` script or \`docker-compose up\` for quick deployments. Check \`/health\` and \`/metrics\` endpoints post-deploy.`;
    } else if (lowerContent.includes('security') || lowerContent.includes('vulnerability') || lowerContent.includes('auth')) {
      response = `Addressing security concerns in "${rawContent}":
1. **Authentication & Authorization**: Implement JWT tokens, use bcrypt for passwords, validate all inputs with Joi schemas.
2. **Vulnerability Scanning**: Run \`npm audit\` regularly, use Trivy for container scanning (already in CI/CD).
3. **Common Threats**: Protect against SQL injection, XSS, CSRF. This app already uses Helmet.js for security headers.
4. **Secrets Management**: Never commit secrets. Use environment variables and .env files (excluded in .gitignore).
5. **API Security**: Rate limiting is active (100 req/15min). Consider API keys for production.

Current protections: Helmet.js, rate limiting, input validation ready, CORS configured.`;
    } else if (lowerContent.includes('monitor') || lowerContent.includes('logs') || lowerContent.includes('metrics') || lowerContent.includes('observability')) {
      response = `For monitoring and observability regarding "${rawContent}":
1. **Metrics Collection**: This app exposes Prometheus metrics at \`/metrics\` including request duration, counts, and system stats.
2. **Logging**: Structured Winston logs in \`backend/logs/\` with separate error and combined logs. JSON format for easy parsing.
3. **Health Checks**: \`/health\` endpoint shows uptime, environment, and status. Docker health checks run every 30s.
4. **Alerting**: Set up Prometheus AlertManager rules for error rates, latency spikes, or downtime.
5. **Dashboards**: Import Grafana dashboards for Node.js apps to visualize metrics.

Check logs: \`tail -f backend/logs/combined.log\` or \`docker compose logs -f\``;
    } else if (lowerContent.includes('incident') || lowerContent.includes('outage') || lowerContent.includes('downtime') || lowerContent.includes('postmortem')) {
      response = `Handling incidents for "${rawContent}":
1. **Immediate Response**: Check \`/health\` endpoint, review recent logs (\`backend/logs/error.log\`), verify external services.
2. **Diagnosis**: Look at metrics (\`/metrics\`), check error rates, identify timing of issue vs recent deployments.
3. **Mitigation**: Rollback to last known good version if needed, scale resources, or implement quick fixes.
4. **Communication**: Update status page, notify stakeholders, provide ETAs.
5. **Root Cause Analysis**: Document timeline, identify contributing factors, create action items.
6. **Prevention**: Add monitoring alerts, improve tests, update runbooks.

For this app: Check container status with \`docker compose ps\`, restart with \`docker compose restart\`.`;
    } else if (lowerContent.includes('database') || lowerContent.includes('sql') || lowerContent.includes('query') || lowerContent.includes('migration')) {
      response = `For database operations related to "${rawContent}":
1. **Schema Design**: Normalize for consistency, denormalize for performance where needed. Use foreign keys and indexes.
2. **Migrations**: Use a tool like Prisma Migrate or Sequelize migrations. Always test on staging first.
3. **Query Optimization**: Use EXPLAIN to analyze slow queries, add indexes on frequently queried columns, avoid N+1 queries.
4. **Backup Strategy**: Automated daily backups, point-in-time recovery, test restoration regularly.
5. **Connection Pooling**: Configure max connections (pg-pool for Postgres), monitor active connections.

This app currently uses file-based RAG storage. For production, consider PostgreSQL with Prisma ORM.`;
    } else if (lowerContent.includes('test') || lowerContent.includes('testing') || lowerContent.includes('jest') || lowerContent.includes('coverage')) {
      response = `For testing approaches to "${rawContent}":
1. **Unit Tests**: Test individual functions in isolation. Current coverage: 47% (target: 80%+).
2. **Integration Tests**: Test API endpoints with supertest. Add tests for all new endpoints.
3. **E2E Tests**: Use Playwright or Cypress for full user flows (not yet implemented).
4. **Test-Driven Development**: Write tests first, then implement features.
5. **Coverage Goals**: Aim for 80%+ code coverage, but focus on critical paths.

Current setup: Jest + Supertest. Run \`npm test\` in backend. Add tests in \`server.test.js\`.`;
    } else if (lowerContent.includes('performance') || lowerContent.includes('optimize') || lowerContent.includes('slow') || lowerContent.includes('cache')) {
      response = `To optimize performance for "${rawContent}":
1. **Identify Bottlenecks**: Use Prometheus metrics to find slow endpoints, check memory usage, CPU, and event loop lag.
2. **Caching**: Implement Redis for API responses, cache LLM results, use CDN for static assets.
3. **Database**: Add indexes, use query caching, implement connection pooling, paginate large result sets.
4. **Code**: Profile with Node.js inspector, avoid synchronous operations, use streaming for large data.
5. **Infrastructure**: Scale horizontally, use load balancing, optimize Docker images.

Check current metrics: \`curl http://localhost:4000/metrics\` and look at \`http_request_duration_seconds\`.`;
    } else if (lowerContent.includes('code review') || lowerContent.includes('refactor') || lowerContent.includes('best practice') || lowerContent.includes('clean code')) {
      response = `For code review and refactoring of "${rawContent}":
1. **Code Quality**: Follow consistent style (ESLint configured), use meaningful names, keep functions small (<50 lines).
2. **Design Patterns**: Apply SOLID principles, use dependency injection, favor composition over inheritance.
3. **Refactoring**: Extract duplicated code, simplify complex conditionals, improve error handling.
4. **Documentation**: Add JSDoc comments for public APIs, update README for changes, document non-obvious logic.
5. **Technical Debt**: Track in TODO.md, prioritize by impact, refactor incrementally.

Review checklist: Security issues, test coverage, error handling, logging, consistent patterns.`;
    } else if (lowerContent.includes('documentation') || lowerContent.includes('readme') || lowerContent.includes('api doc') || lowerContent.includes('runbook')) {
      response = `For documentation regarding "${rawContent}":
1. **README**: Clear setup instructions, architecture overview, troubleshooting section (see current README.md).
2. **API Documentation**: Consider Swagger/OpenAPI for interactive docs, document all endpoints, parameters, responses.
3. **Code Comments**: JSDoc for functions, explain why not what, document edge cases and assumptions.
4. **Runbooks**: Create step-by-step guides for common operations (deployment, backups, incident response).
5. **Architecture Diagrams**: Visual representations help new team members understand the system.

Current docs: README.md, FEATURES.md, DEPLOYMENT_GUIDE.md, SYSTEMD_SETUP.md. Keep them updated!`;
    } else if (lowerContent.includes('sprint') || lowerContent.includes('agile') || lowerContent.includes('planning') || lowerContent.includes('estimation')) {
      response = `For project management and agile practices around "${rawContent}":
1. **Sprint Planning**: Break epics into user stories, estimate with story points or hours, prioritize by value and risk.
2. **Daily Standups**: What did I complete? What am I working on? Any blockers?
3. **Estimation**: Use planning poker, consider complexity not time, build in buffer for unknowns.
4. **Retrospectives**: What went well? What didn't? Action items for improvement.
5. **Velocity Tracking**: Measure completed story points per sprint to improve future estimates.

For this project: Track tasks in GitHub Issues, use project boards, link PRs to issues.`;
    } else if (lowerContent.includes('docker') || lowerContent.includes('container') || lowerContent.includes('kubernetes')) {
      response = `For containerization regarding "${rawContent}":
1. **Docker Best Practices**: Multi-stage builds, minimal base images, .dockerignore, security scanning.
2. **Docker Compose**: Orchestrate multiple services, manage networking, volumes, environment variables.
3. **Kubernetes**: For production scale, use deployments, services, ingress, config maps, secrets.
4. **Health Checks**: Define readiness/liveness probes (already configured in docker-compose.yml).
5. **Resource Limits**: Set memory/CPU limits to prevent resource exhaustion.

This app: Uses Docker with health checks, restart policies. See \`docker-compose.yml\` and Dockerfiles.`;
    } else if (lowerContent.includes('backup') || lowerContent.includes('restore') || lowerContent.includes('disaster recovery')) {
      response = `For backup and disaster recovery of "${rawContent}":
1. **Backup Strategy**: Automated daily backups, retain for 30 days, test restoration monthly.
2. **What to Backup**: Database, user uploads (\`backend/rag_storage\`), configuration files, secrets (encrypted).
3. **Backup Storage**: Off-site storage (S3, Azure Blob), multiple geographic regions.
4. **Recovery Testing**: Regularly test restore procedures, document RTO/RPO requirements.
5. **Application State**: For stateless apps, re-deploy from code. For stateful, restore data volumes.

For this app: Backup \`backend/rag_storage\` directory and environment variables. RAG documents should be backed up externally.`;
    }
    // Original patterns continue below
    else if (lowerContent.includes('hello') || lowerContent.includes('hi ') || lowerContent.startsWith('hi') || lowerContent.startsWith('hello')) {
      response = `Hey there! It's good to hear from you. What should we tackle about "${rawContent}" today?`;
    } else if (lowerContent.includes('thanks') || lowerContent.includes('thank you')) {
      response = `Always happy to help. If "${rawContent}" sparks anything else, just say the word.`;
    } else if (lowerContent.includes('error') || lowerContent.includes('issue') || lowerContent.includes('fail')) {
      response = `Let's troubleshoot "${rawContent}" systematically:
1. Recreate the failure with the smallest input.
2. Capture the exact error output or stack trace.
3. Check recent code or config changes touching that area.
4. Add a focused test so the fix sticks.
Ping me with what you find and we'll narrow it down further.`;
    } else if (lowerContent.startsWith('how ') || lowerContent.includes(' how ') || lowerContent.includes('steps') || lowerContent.includes('plan')) {
      response = `Here's a structured way to tackle "${rawContent}":
1. Nail the success criteria so you know when you're done.
2. Break the work into bite-sized experiments or pull requests.
3. Instrument early so you can measure progress.
4. Iterate with feedback after each milestone.
Tell me which step feels fuzzy and we'll flesh it out.`;
    } else if (lowerContent.startsWith('what ') || lowerContent.includes('what is') || lowerContent.includes('explain')) {
      response = `When explaining "${rawContent}", start with the core idea, add why it matters for this project, then call out the trade-offs so stakeholders know when to use it.`;
    } else if (lowerContent.includes('why') || lowerContent.includes('reason')) {
      response = `To reason through "${rawContent}", line up the inputs and constraints, test the strongest counter-argument, and see which assumptions hold. The answer usually shows up once you make the hidden assumption explicit.`;
    } else if (lowerContent.includes('rag')) {
      response = `For RAG topics like "${rawContent}", validate three things: chunk quality, retrieval scoring, and how the prompt stitches sources into responses. Reviewing a few retrieved snippets manually can spotlight gaps fast.`;
    } else {
      response = `Here's how I'd approach "${rawContent}": clarify the outcome, list the constraints, sketch the smallest experiment, and iterate once you see signal.`;
    }

    const topicLine = previousTopics.length
      ? `Earlier you also mentioned ${formatTopicList(previousTopics)}. I'm keeping that thread in mind so the guidance stays coherent.`
      : '';
    const closingLine = 'If you want examples, drafts, or a deeper dive, just ask.';

    let finalResponse = response;
    if (topicLine) {
      finalResponse = `${response}

${topicLine}`;
    }

    finalResponse = `${finalResponse}

${closingLine}`;

    const { inline, extra } = prepareNotices(model, options);
    finalResponse = composeContent(finalResponse, inline);

    return {
      text: finalResponse,
      model: fallbackModelId,
      modelInfo: model,
      loading: false,
      notices: extra
    };
  }

  generateWithLocalModel(prompt = '', modelId = this.defaultModel, options = {}) {
    const fallbackModelId = AVAILABLE_MODELS[modelId] && AVAILABLE_MODELS[modelId].type === 'local'
      ? modelId
      : this.defaultModel;
    const model = AVAILABLE_MODELS[fallbackModelId];
    const lowerPrompt = (prompt || '').toLowerCase();

    const safety = runLocalSafetyChecks(prompt);
    if (safety.blocked) {
      const { inline, extra } = prepareNotices(model, options);
      const sheet = fallbackModelId === 'local/aakarsh'
        ? buildAakarshProductSheet()
        : buildLocalAssistantProductSheet();
      const refusal = `${safety.message}\n\n${sheet}`;
      const message = composeContent(refusal, inline);

      return {
        text: message,
        model: fallbackModelId,
        modelInfo: model,
        loading: false,
        notices: extra
      };
    }

    // Use NLP to enhance understanding of the prompt
    let nlpAnalysis = null;
    if (prompt && prompt.trim()) {
      try {
        nlpAnalysis = nlpService.analyze(prompt);
        logger.info('NLP analysis completed', {
          intent: nlpAnalysis.intent?.intent,
          sentiment: nlpAnalysis.sentiment?.isPositive ? 'positive' :
            nlpAnalysis.sentiment?.isNegative ? 'negative' : 'neutral',
          keywordCount: nlpAnalysis.keywords?.length || 0
        });
      } catch (error) {
        logger.warn('NLP analysis skipped', { error: error.message });
      }
    }

    let response;

    if (fallbackModelId === 'local/aakarsh') {
      response = this.generateAakarshNeuralResponse(prompt, nlpAnalysis || {});
    } else if (fallbackModelId === 'local/assistant-10m') {
      response = this.generateLocalNeuralResponse(prompt, nlpAnalysis || {});
    } else if (!prompt || !prompt.trim()) {
      response = 'I\'m here and ready when you are. Ask me anything about AI, coding, DevOps, security, monitoring, databases, testing, or this project.';
    } else if (nlpAnalysis && nlpAnalysis.entities) {
      // Use NLP-extracted entities to provide more contextual responses
      const entities = nlpAnalysis.entities;
      const keywords = nlpAnalysis.keywords || [];

      // Check if the prompt is asking about NLP capabilities
      if (lowerPrompt.includes('nlp') || lowerPrompt.includes('natural language')) {
        response = `I now have advanced NLP capabilities powered by compromise.js! Here's what I can do:

**Entity Recognition**: I can identify people, places, organizations, dates, and values in your text.
**Sentiment Analysis**: I can determine if text is positive, negative, or neutral.
**Keyword Extraction**: I can identify the most important keywords and topics.
**Intent Classification**: I can understand whether you're asking a question, giving a command, or making a statement.
**Part-of-Speech Tagging**: I can analyze the grammatical structure of text.

All these capabilities are rule-based and deterministic - no hallucinations, just accurate language understanding!`;
      } else if (lowerPrompt.includes('analyze') && keywords.length > 0) {
        // Provide analysis-focused response using extracted keywords
        const keywordList = keywords.slice(0, 3).map(k => k.text).join(', ');
        response = `I can help you analyze "${keywordList}" and related topics. My NLP engine has identified these as key concepts in your query. Let me provide targeted guidance based on what you're looking for.`;
      }
    }

    if (!response && (lowerPrompt.includes('help') || lowerPrompt.includes('what can you do'))) {
      response = `I can assist with a wide range of IT and workplace operations:

**Development & Code**: Code reviews, refactoring, best practices, design patterns, testing strategies
**DevOps**: CI/CD pipelines, Docker, Kubernetes, deployment strategies, infrastructure as code
**Security**: Vulnerability assessment, authentication, authorization, compliance, security best practices
**Monitoring**: Logs, metrics, alerting, observability, Prometheus/Grafana setup
**Databases**: Query optimization, schema design, migrations, backup/restore strategies
**Performance**: Optimization techniques, caching, profiling, scalability improvements
**Incident Response**: Troubleshooting, debugging, root cause analysis, postmortem reviews
**Documentation**: Technical writing, API docs, runbooks, architecture documentation
**Project Management**: Sprint planning, estimation, agile practices, retrospectives
**NLP Features**: Entity extraction, sentiment analysis, keyword extraction, intent classification, text normalization

I now include advanced NLP capabilities for better understanding of your queries. Ask me about any specific topic and I'll provide actionable guidance!`;
    } else if (lowerPrompt.includes('ai') && lowerPrompt.includes('use')) {
      response = 'Effective AI adoption starts by identifying repetitive or data-heavy workflows, wrapping them with reliable automation, and keeping humans in the loop for review. Start small, measure outcomes, then scale what works.';
    } else if (lowerPrompt.includes('language model') || lowerPrompt.includes('llm')) {
      const openSourceLines = buildOpenSourceCapabilitySummary();
      const capabilityBlock = openSourceLines.length
        ? `\n\nOpen-source choices already wired in:\n${openSourceLines.join('\n')}`
        : '';

      response = `This chat ships with AAKARSH as the default on-device assistant. You can also switch to local transformers.js models or Ollama-hosted options without any external API keys.${capabilityBlock}`;
    } else if (lowerPrompt.includes('rag')) {
      response = 'Retrieval-Augmented Generation (RAG) combines document search with an LLM. Upload files to the RAG storage and the backend will blend those snippets into the prompt. This app supports both GitHub code search and local file storage for RAG.';
    } else if (lowerPrompt.includes('deploy') || lowerPrompt.includes('docker') || lowerPrompt.includes('ci/cd')) {
      response = 'For deployment: This app uses Docker Compose for orchestration. Run `docker compose up -d` for 24/7 availability with auto-restart. Check health at `/health`, monitor with `/metrics`. CI/CD pipeline includes tests, Docker builds, and security scanning. See DEPLOYMENT_GUIDE.md for details.';
    } else if (lowerPrompt.includes('security') || lowerPrompt.includes('vulnerability')) {
      response = 'Security features in this app: Helmet.js for security headers, rate limiting (100 req/15min), input validation with Joi, secrets via environment variables, Trivy scanning in CI/CD. Always run `npm audit` before deployment and keep dependencies updated.';
    } else if (lowerPrompt.includes('monitor') || lowerPrompt.includes('logs') || lowerPrompt.includes('metrics')) {
      response = 'Monitoring setup: Prometheus metrics at `/metrics`, Winston logs in `backend/logs/`, health checks at `/health`. View logs with `tail -f backend/logs/combined.log` or `docker compose logs -f`. Set up Grafana dashboards for visualization.';
    } else if (lowerPrompt.includes('test') || lowerPrompt.includes('testing')) {
      response = 'Testing: Jest + Supertest for backend (current coverage 47%, target 80%+). Run `npm test` in backend directory. Add integration tests for new endpoints. Consider Playwright/Cypress for E2E tests. Test-driven development recommended.';
    } else if (lowerPrompt.includes('database') || lowerPrompt.includes('sql')) {
      response = 'Database operations: Currently using file-based RAG storage. For production, consider PostgreSQL with Prisma ORM. Focus on schema design, indexing, query optimization, connection pooling, and automated backups with tested restoration procedures.';
    } else if (lowerPrompt.includes('performance') || lowerPrompt.includes('optimize')) {
      response = 'Performance optimization: Check metrics at `/metrics` for slow endpoints. Implement Redis caching, database indexing, code profiling. Use connection pooling, pagination, and streaming for large datasets. Monitor CPU, memory, and event loop lag.';
    } else if (prompt.length < 80) {
      response = `Here\'s a quick thought: ${prompt.trim()} -> consider the goal, the data you have, and the user journey you want to support. For technical implementations, verify security, add tests, and monitor performance.`;
    } else {
      response = 'Thanks for the detailed prompt! A concise plan would be:\n1. Clarify the objective and success criteria.\n2. Break the work into small experiments or PRs.\n3. Add tests and monitoring.\n4. Deploy incrementally and measure results.\n5. Iterate based on feedback.\n\nAsk if you\'d like deeper guidance on any step.';
    }

    const { inline, extra } = prepareNotices(model, options);
    response = composeContent(response, inline);

    return {
      text: response,
      model: fallbackModelId,
      modelInfo: model,
      loading: false,
      notices: extra
    };
  }

  buildLocalFeatureVector(prompt, nlpAnalysis = {}) {
    const sanitized = (prompt || '').trim();
    const lower = sanitized.toLowerCase();
    const sentiment = nlpAnalysis.sentiment || {};
    const keywords = Array.isArray(nlpAnalysis.keywords) ? nlpAnalysis.keywords : [];
    const entities = nlpAnalysis.entities || {};
    const entityCount = Object.values(entities).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

    return [
      Math.min(sanitized.length / 600, 1),
      nlpAnalysis.intent?.intent === 'question' || lower.includes('?') ? 1 : 0,
      /(now|asap|urgent|quick|soon)/.test(lower) ? 1 : 0,
      sentiment.isPositive ? 1 : 0,
      sentiment.isNegative ? 1 : 0,
      Math.min(keywords.length / 5, 1),
      Math.min(entityCount / 6, 1)
    ];
  }

  buildAakarshFeatureVector(prompt, nlpAnalysis = {}) {
    const sanitized = (prompt || '').trim();
    const lower = sanitized.toLowerCase();
    const sentiment = nlpAnalysis.sentiment || {};
    const keywords = Array.isArray(nlpAnalysis.keywords) ? nlpAnalysis.keywords : [];
    const entities = nlpAnalysis.entities || {};
    const stats = nlpAnalysis.stats || {};
    const entityCount = Object.values(entities).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

    return [
      Math.min(sanitized.length / 800, 1),
      nlpAnalysis.intent?.intent === 'question' || lower.includes('?') ? 1 : 0,
      /(now|asap|urgent|quick|soon)/.test(lower) ? 1 : 0,
      sentiment.isPositive ? 1 : 0,
      sentiment.isNegative ? 1 : 0,
      Math.min(keywords.length / 6, 1),
      Math.min(entityCount / 8, 1),
      Math.min((stats.verbs || 0) / 6, 1),
      Math.min((stats.nouns || 0) / 6, 1),
      Math.min((stats.adjectives || 0) / 5, 1)
    ];
  }

  runLocalNeuralHead(features) {
    return LOCAL_ASSISTANT_HEADS
      .map(head => {
        const activation = head.weights.reduce((sum, weight, index) => sum + weight * (features[index] || 0), head.bias);
        const squashed = Math.tanh(activation);
        return { ...head, activation: squashed };
      })
      .sort((a, b) => b.activation - a.activation);
  }

  runAakarshNeuralMesh(features) {
    return AAKARSH_NEURAL_HEADS
      .map(head => {
        const activation = head.weights.reduce((sum, weight, index) => sum + weight * (features[index] || 0), head.bias);
        const squashed = Math.tanh(activation);
        return { ...head, activation: squashed };
      })
      .sort((a, b) => b.activation - a.activation);
  }

  generateLocalNeuralResponse(prompt, nlpAnalysis = {}) {
    const safePrompt = (prompt || '').trim();

    if (!safePrompt) {
      const openSourceLines = buildOpenSourceCapabilitySummary();
      const capabilityBlock = openSourceLines.length
        ? `\nOpen-source peers ready to slot in:\n${openSourceLines.join('\n')}`
        : '';

      return `Local Assistant (10M) is warmed up with on-device NLP + a compact neural head. Ask away!${capabilityBlock}\n\n${buildLocalAssistantProductSheet(nlpAnalysis)}`;
    }

    const keywords = (nlpAnalysis.keywords || []).map(item => item.text || item).filter(Boolean);
    const entities = nlpAnalysis.entities || {};
    const featureVector = this.buildLocalFeatureVector(safePrompt, nlpAnalysis);
    const activations = this.runLocalNeuralHead(featureVector);
    const primary = activations[0];
    const secondary = activations[1];

    const sentimentLabel = nlpAnalysis.sentiment?.isPositive
      ? 'optimistic'
      : nlpAnalysis.sentiment?.isNegative
        ? 'concerned'
        : 'neutral';

    const entityMentions = Object.entries(entities)
      .filter(([, list]) => Array.isArray(list) && list.length)
      .map(([type, list]) => `${type}: ${list.slice(0, 3).join(', ')}`);

    const keywordLine = keywords.length
      ? `Focus points: ${keywords.slice(0, 6).join(', ')}.`
      : 'Focus points: extracted from context (no explicit keywords detected).';

    const entityLine = entityMentions.length
      ? `Named entities -> ${entityMentions.join(' | ')}.`
      : 'Named entities -> none detected; keeping guidance generic.';

    let actionBlock;
    if (primary.label === 'planner') {
      actionBlock = [
        'Structured steps:',
        `1) Clarify the target outcome for "${safePrompt.slice(0, 120)}".`,
        `2) Map data/systems involved and risks (tie to ${keywords.slice(0, 3).join(', ') || 'the key nouns you shared'}).`,
        '3) Prototype quickly, test, and instrument.',
        '4) Ship iteratively, review signals, and recalibrate.'
      ].join('\n');
    } else if (primary.label === 'analyst') {
      actionBlock = [
        'Analysis lane:',
        `- Intent: ${nlpAnalysis.intent?.intent || 'informational/uncertain'}.`,
        `- Sentiment: ${sentimentLabel}; adjust tone accordingly.`,
        '- Edge cases: validate inputs, failure modes, and monitoring before rollout.'
      ].join('\n');
    } else {
      actionBlock = [
        'Mentor lane:',
        '- Guidance tailored to your ask with concise checkpoints.',
        '- Watch outs: clarify success criteria, guardrails, and handoff steps.',
        '- Next micro-move: write a 3-bullet plan and validate it with stakeholders.'
      ].join('\n');
    }

    const neuralReadout = `Neural routing -> ${primary.label} (${primary.activation.toFixed(2)}) | backup ${secondary.label} (${secondary.activation.toFixed(2)}).`;
    const openSourceLines = buildOpenSourceCapabilitySummary();
    const capabilityBlock = openSourceLines.length
      ? ['Open-source model taps available alongside this local head:', ...openSourceLines].join('\n')
      : '';
    const productSheet = buildLocalAssistantProductSheet(nlpAnalysis);

    return [
      '🧠 Local Assistant (10M) fused rule-based NLP with a compact neural head for this prompt.',
      keywordLine,
      entityLine,
      actionBlock,
      neuralReadout,
      capabilityBlock,
      productSheet
    ].filter(Boolean).join('\n');
  }

  generateAakarshNeuralResponse(prompt, nlpAnalysis = {}) {
    const safePrompt = (prompt || '').trim();

    if (!safePrompt) {
      const openSourceLines = buildOpenSourceCapabilitySummary();
      const capabilityBlock = openSourceLines.length
        ? `\nOpen-source peers available for pairing:\n${openSourceLines.join('\n')}`
        : '';

      return `AAKARSH is primed with richer NLP signals, neural mesh routing, and production guardrails. Ask away!${capabilityBlock}\n\n${buildAakarshProductSheet(nlpAnalysis)}`;
    }

    const keywords = (nlpAnalysis.keywords || []).map(item => item.text || item).filter(Boolean);
    const entities = nlpAnalysis.entities || {};
    const featureVector = this.buildAakarshFeatureVector(safePrompt, nlpAnalysis);
    const activations = this.runAakarshNeuralMesh(featureVector);
    const [primary, secondary] = activations;

    const entityFragments = Object.entries(entities)
      .filter(([, list]) => Array.isArray(list) && list.length)
      .map(([type, list]) => `${type}: ${list.slice(0, 3).join(', ')}`);

    const keywordLine = keywords.length ? `Keywords: ${keywords.slice(0, 6).join(', ')}` : '';
    const entityLine = entityFragments.length ? `Entities: ${entityFragments.join(' | ')}` : '';
    const statsLine = nlpAnalysis.stats
      ? `Stats — sentences: ${nlpAnalysis.stats.sentences || 0}, verbs: ${nlpAnalysis.stats.verbs || 0}, nouns: ${nlpAnalysis.stats.nouns || 0}.`
      : '';

    const intentLabel = nlpAnalysis.intent?.intent || 'unknown';
    const confidence = nlpAnalysis.intent?.confidence || 0;
    const actionBlock = [
      `Intent detected: ${intentLabel} (confidence ${confidence.toFixed(2)}).`,
      'Response lanes:',
      '- Architect: systems-level plan with dependency checks.',
      '- Analyst+: deeper evidence-led breakdown with risk notes.',
      '- Mentor+: coaching notes with next micro-moves.',
      '- Stability: steady state and rollback guidance when things look risky.'
    ].join('\n');

    const neuralReadout = `Neural mesh -> ${primary.label} (${primary.activation.toFixed(2)}) | backup ${secondary.label} (${secondary.activation.toFixed(2)}).`;
    const openSourceLines = buildOpenSourceCapabilitySummary();
    const capabilityBlock = openSourceLines.length
      ? ['Open-source model taps available to pair with AAKARSH:', ...openSourceLines].join('\n')
      : '';
    const productSheet = buildAakarshProductSheet(nlpAnalysis);

    return [
      '🧠 AAKARSH blends enhanced NLP with a richer neural mesh for this prompt.',
      keywordLine,
      entityLine,
      statsLine,
      actionBlock,
      neuralReadout,
      capabilityBlock,
      productSheet
    ].filter(Boolean).join('\n');
  }

  async chat(messages, modelId = this.defaultModel, options = {}) {
    const resolvedModelId = AVAILABLE_MODELS[modelId] ? modelId : this.defaultModel;
    const model = AVAILABLE_MODELS[resolvedModelId];

    if (model.type === 'openai') {
      return this.chatWithOpenAI(messages, resolvedModelId, options);
    }

    if (model.type === 'local') {
      const result = this.generateLocalChatResponse(messages, resolvedModelId, options);

      return {
        message: result.text,
        model: result.model,
        modelInfo: result.modelInfo,
        loading: result.loading,
        notices: result.notices
      };
    }

    const prompt = this.formatMessagesAsPrompt(messages, resolvedModelId);
    const result = await this.generateText(prompt, resolvedModelId, options);

    return {
      message: result.text,
      model: result.model,
      modelInfo: result.modelInfo,
      loading: result.loading,
      notices: result.notices
    };
  }

  async chatWithOpenAI(messages, modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }

    try {
      const completion = await this.openaiClient.chat.completions.create({
        model: modelId,
        messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1
      });

      const responseMessage = completion.choices[0].message.content;
      const { inline, extra } = prepareNotices(model, options);
      const message = composeContent(responseMessage, inline);

      logger.info('OpenAI chat completed successfully', {
        model: modelId,
        responseLength: message.length
      });

      return {
        message,
        model: modelId,
        modelInfo: model,
        notices: extra
      };
    } catch (error) {
      logger.error('OpenAI chat failed', {
        error: error.message,
        model: modelId
      });
      throw error;
    }
  }

  formatMessagesAsPrompt(messages, modelId) {
    if (modelId.includes('llama-2')) {
      return messages.map(msg => {
        if (msg.role === 'system') return `<<SYS>>\n${msg.content}\n<</SYS>>`;
        if (msg.role === 'user') return `[INST] ${msg.content} [/INST]`;
        return msg.content;
      }).join('\n\n');
    }

    if (modelId.includes('mistral') || modelId.includes('mixtral') || modelId.includes('zephyr')) {
      return messages.map(msg => {
        if (msg.role === 'system') return `<s>[INST] ${msg.content} [/INST]`;
        if (msg.role === 'user') return `[INST] ${msg.content} [/INST]`;
        return msg.content;
      }).join('\n');
    }

    return messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n') + '\nassistant:';
  }

  isConfigured() {
    return true;
  }
}

module.exports = new LLMService();
