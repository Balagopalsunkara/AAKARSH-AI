const logger = require('./logger');
const axios = require('axios');
const OpenAI = require('openai');
const tinyLLM = require('./tinyLLM');

const HUGGINGFACE_API_KEY =
  process.env.HUGGINGFACE_API_KEY ||
  process.env.HF_API_KEY ||
  process.env.HF_TOKEN ||
  process.env.HUGGINGFACEHUB_API_TOKEN;

// Available open-source LLM models with free inference endpoints
const HF_ROUTER_BASE = 'https://router.huggingface.co/v1';
const HF_CHAT_COMPLETIONS_ENDPOINT = `${HF_ROUTER_BASE}/chat/completions`;
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');

// Lazy-load cache for transformers.js pipelines
const XENOVA_PIPELINES = new Map();
let transformersLib = null;

async function getTransformers() {
  if (!transformersLib) {
    transformersLib = await import('@xenova/transformers');
    if (transformersLib?.env) {
      // Enforce local-only usage
      transformersLib.env.allowLocalModels = true;
      transformersLib.env.allowRemoteModels = false;

      // Set local model path to backend/models directory
      const path = require('path');
      transformersLib.env.localModelPath = path.join(__dirname, 'models');

      logger.info('Transformers configured for local-only mode', {
        path: transformersLib.env.localModelPath
      });
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
      : (model?.type !== 'huggingface');

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
  // 1. Rule-Based Assistant (100% Local, No Downloads)
  'local/instruct': {
    name: 'Tiny LLM (Local Assistant)',
    provider: 'Built-in',
    description: 'Lightweight, rule-based language model running locally. No downloads required.',
    maxTokens: 1024,
    free: true,
    type: 'local'
  },

  // 2. Local LLMs (Require manual download to backend/models)
  'xenova/tinyllama-chat': {
    name: 'TinyLlama Chat (Local LLM)',
    provider: 'Local CPU',
    description: '1.1B model. Requires model files in backend/models.',
    maxTokens: 512,
    free: true,
    type: 'xenova',
    transformersModel: 'Xenova/tinyllama-chat',
    notice: 'Requires model files to be manually downloaded to backend/models.'
  },
  'xenova/phi-1_5': {
    name: 'Phi-1.5 (Local LLM)',
    provider: 'Local CPU',
    description: 'Microsoft Phi-1.5. Requires model files in backend/models.',
    maxTokens: 512,
    free: true,
    type: 'xenova',
    transformersModel: 'Xenova/phi-1_5',
    notice: 'Requires model files to be manually downloaded to backend/models.'
  },

  // 3. Ollama (Local Service)
  'ollama/mistral:7b': {
    name: 'Mistral 7B (Ollama)',
    provider: 'Ollama Local',
    description: 'Requires Ollama app running locally.',
    maxTokens: 2048,
    free: true,
    type: 'ollama',
    endpoint: `${OLLAMA_HOST}`,
    ollamaModel: 'mistral:7b',
    notice: 'Requires Ollama running locally.'
  },

  // 4. Remote / Cloud Models (Optional)
  'huggingface/meta-llama-3.1-8b-instruct': {
    name: 'Llama 3.1 8B (Cloud)',
    provider: 'Hugging Face',
    description: 'Remote inference via Hugging Face API.',
    maxTokens: 4096,
    free: false,
    type: 'huggingface',
    requiresKey: 'HUGGINGFACE_API_KEY',
    hfModel: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
    notice: 'Requires API Key.'
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

class LLMService {
  constructor() {
    this.defaultModel = 'local/instruct';
    this.openaiClient = null;

    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI client initialized');
    }
  }

  isKeyAvailable(key) {
    if (key === 'HUGGINGFACE_API_KEY') {
      return !!HUGGINGFACE_API_KEY;
    }

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

    if (model.type === 'huggingface' && !HUGGINGFACE_API_KEY) {
      logger.warn('Hugging Face API key missing, using local fallback', {
        requestedModel: modelId
      });
      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Hugging Face API key not configured. Using built-in assistant instead.'
      });
    }

    if (model.type === 'huggingface') {
      return this.generateWithHuggingFace(prompt, requestedModel, options);
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

  async generateWithHuggingFace(prompt = '', modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!model) {
      return this.generateWithLocalModel(prompt, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Requested Hugging Face model was not found. Using built-in assistant instead.'
      });
    }

    try {
      const { data } = await this.requestHuggingFaceChat([
        { role: 'user', content: prompt }
      ], modelId, options);

      const choice = data?.choices?.[0];
      const generated = choice?.message?.content ? choice.message.content.trim() : '';

      if (!generated) {
        throw new Error('Hugging Face router returned an empty response.');
      }

      const { inline, extra } = prepareNotices(model, options);
      const resultText = composeContent(generated, inline);

      logger.info('Hugging Face text generated successfully', {
        model: modelId,
        responseLength: resultText.length
      });

      return {
        text: resultText,
        model: modelId,
        modelInfo: model,
        loading: false,
        notices: extra
      };
    } catch (error) {
      return this.handleHuggingFaceTextError(error, prompt, modelId);
    }
  }

  async requestHuggingFaceChat(messages, modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!model) {
      throw new Error(`Unknown Hugging Face model: ${modelId}`);
    }

    const safeMessages = Array.isArray(messages)
      ? messages.filter(entry => entry && typeof entry.content === 'string')
      : [];

    if (!safeMessages.length) {
      throw new Error('At least one message with string content is required for Hugging Face chat completions.');
    }

    const parameters = options.parameters || {};
    const maxTokenCandidates = [];

    if (typeof options.maxTokens === 'number') {
      maxTokenCandidates.push(options.maxTokens);
    }
    if (typeof parameters.max_tokens === 'number') {
      maxTokenCandidates.push(parameters.max_tokens);
    }
    if (typeof model.maxTokens === 'number') {
      maxTokenCandidates.push(model.maxTokens);
    }

    let maxTokens = model.maxTokens || 512;
    const validMaxTokens = maxTokenCandidates.filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
    if (validMaxTokens.length) {
      maxTokens = Math.min(...validMaxTokens);
    }

    const temperature = typeof options.temperature === 'number'
      ? options.temperature
      : (typeof parameters.temperature === 'number' ? parameters.temperature : 0.7);

    const topP = typeof options.topP === 'number'
      ? options.topP
      : (typeof parameters.top_p === 'number' ? parameters.top_p : 0.95);

    const payload = {
      model: model.hfModel || modelId,
      messages: safeMessages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stream: false
    };

    const numericKeys = ['frequency_penalty', 'presence_penalty', 'top_k', 'repetition_penalty'];
    numericKeys.forEach(key => {
      const value = options[key] ?? parameters[key];
      if (typeof value === 'number') {
        payload[key] = value;
      }
    });

    const stopSequences = options.stop ?? parameters.stop;
    if (Array.isArray(stopSequences) && stopSequences.length) {
      payload.stop = stopSequences;
    } else if (typeof stopSequences === 'string' && stopSequences.trim()) {
      payload.stop = [stopSequences];
    }

    const responseFormat = options.response_format || parameters.response_format;
    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    const axiosOptions = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`
      },
      timeout: options.timeout || 45000
    };

    if (options.abortSignal) {
      axiosOptions.signal = options.abortSignal;
    }

    return axios.post(HF_CHAT_COMPLETIONS_ENDPOINT, payload, axiosOptions);
  }

  handleHuggingFaceTextError(error, prompt, requestedModel) {
    logger.error('Hugging Face text generation failed', {
      error: error.message,
      model: requestedModel,
      status: error.response?.status,
      data: error.response?.data
    });

    const model = AVAILABLE_MODELS[requestedModel];
    const modelNotices = normalizeNotices(model?.notice);

    if (error.response) {
      const status = error.response.status;
      const errorMessage =
        error.response.data?.error?.message ||
        error.response.data?.message ||
        error.response.data?.detail;

      if (status === 503) {
        return {
          text: 'Model is currently loading. This can take 20-30 seconds for the first request. Please try again in a moment...\n\nFalling back to the built-in assistant for now.',
          model: this.defaultModel,
          modelInfo: AVAILABLE_MODELS[this.defaultModel],
          loading: true,
          notices: modelNotices
        };
      }

      if (status === 429) {
        return {
          text: 'Rate limit reached for the selected Hugging Face model. Using the built-in assistant instead.',
          model: this.defaultModel,
          modelInfo: AVAILABLE_MODELS[this.defaultModel],
          loading: false,
          notices: modelNotices
        };
      }

      if ([401, 403].includes(status)) {
        const authMessage = errorMessage
          ? `Authentication failed for the Hugging Face router: ${errorMessage}. Please double-check the HUGGINGFACE_API_KEY value.`
          : 'Authentication failed for the Hugging Face router. Please double-check the HUGGINGFACE_API_KEY value.';

        return {
          text: authMessage,
          model: requestedModel,
          modelInfo: model,
          loading: false,
          notices: modelNotices
        };
      }

      if (status === 410) {
        return this.generateWithLocalModel(prompt, this.defaultModel, {
          requestedModel,
          notice: 'The selected Hugging Face model endpoint returned 410 (gone). Using the built-in assistant instead.'
        });
      }

      if (status === 400 && errorMessage) {
        return this.generateWithLocalModel(prompt, this.defaultModel, {
          requestedModel,
          notice: `Hugging Face router rejected the request: ${errorMessage}. Using the built-in assistant instead.`
        });
      }
    }

    const statusLabel = error.response?.status ? ` (status ${error.response.status})` : '';
    const detail = error.response?.data?.error?.message || error.message;

    return this.generateWithLocalModel(prompt, this.defaultModel, {
      requestedModel,
      notice: detail
        ? `Remote generation failed${statusLabel}: ${detail}. Using the built-in assistant instead.`
        : 'Remote generation failed. Using the built-in assistant instead.'
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
            if (json.error) {
              throw new Error(json.error);
            }
            if (json.message && json.message.content) yield { content: json.message.content };
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') {
              logger.error('Ollama stream parse error', { error: e.message, line });
              // If it's an API error from Ollama, we should probably stop and report it
              if (line.includes('"error":')) {
                try {
                  const errJson = JSON.parse(line);
                  if (errJson.error) throw new Error(errJson.error);
                } catch (inner) { }
              }
            }
          }
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

  async generateWithLocalModel(prompt = '', modelId = this.defaultModel, options = {}) {
    const fallbackModelId = AVAILABLE_MODELS[modelId] && AVAILABLE_MODELS[modelId].type === 'local'
      ? modelId
      : this.defaultModel;
    const model = AVAILABLE_MODELS[fallbackModelId];
    const lowerPrompt = (prompt || '').toLowerCase();

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

    // Use TinyLLM for generation
    response = await tinyLLM.generate(prompt);

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

  async chat(messages, modelId = this.defaultModel, options = {}) {
    const resolvedModelId = AVAILABLE_MODELS[modelId] ? modelId : this.defaultModel;
    const model = AVAILABLE_MODELS[resolvedModelId];

    if (model.type === 'openai') {
      return this.chatWithOpenAI(messages, resolvedModelId, options);
    }

    if (model.type === 'local') {
      // Keep the original rule-based assistant behavior for the built-in instruct model
      // but route other local models (for example the new `local/aakarsh`) through
      // the neural local generator so they produce LLM replies instead of canned text.
      if (resolvedModelId === 'local/instruct') {
        const result = this.generateLocalChatResponse(messages, resolvedModelId, options);

        return {
          message: result.text,
          model: result.model,
          modelInfo: result.modelInfo,
          loading: result.loading,
          notices: result.notices
        };
      }

      // For other local models, compose a prompt and run the neural local generator
      const prompt = this.formatMessagesAsPrompt(messages, resolvedModelId);
      const result = await this.generateWithLocalModel(prompt, resolvedModelId, options);

      return {
        message: result.text,
        model: result.model,
        modelInfo: result.modelInfo,
        loading: result.loading,
        notices: result.notices
      };
    }

    if (model.type === 'huggingface' && !HUGGINGFACE_API_KEY) {
      const fallback = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Hugging Face API key not configured. Using built-in assistant instead.'
      });

      return {
        message: fallback.text,
        model: fallback.model,
        modelInfo: fallback.modelInfo,
        loading: fallback.loading,
        notices: fallback.notices
      };
    }

    if (model.type === 'huggingface') {
      return this.chatWithHuggingFace(messages, resolvedModelId, options);
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

  async chatWithHuggingFace(messages, modelId, options = {}) {
    const model = AVAILABLE_MODELS[modelId];

    if (!model) {
      const fallback = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel: modelId,
        notice: 'Requested Hugging Face model was not found. Using built-in assistant instead.'
      });

      return {
        message: fallback.text,
        model: fallback.model,
        modelInfo: fallback.modelInfo,
        loading: fallback.loading
      };
    }

    try {
      const { data } = await this.requestHuggingFaceChat(messages, modelId, options);
      const choice = data?.choices?.[0];
      const content = choice?.message?.content ? choice.message.content.trim() : '';

      if (!content) {
        throw new Error('Hugging Face router returned an empty response.');
      }

      const { inline, extra } = prepareNotices(model, options);
      const finalMessage = composeContent(content, inline);

      logger.info('Hugging Face chat completed successfully', {
        model: modelId,
        responseLength: finalMessage.length
      });

      return {
        message: finalMessage,
        model: modelId,
        modelInfo: model,
        loading: false,
        notices: extra
      };
    } catch (error) {
      return this.handleHuggingFaceChatError(error, messages, modelId);
    }
  }

  handleHuggingFaceChatError(error, messages, requestedModel) {
    logger.error('Hugging Face chat failed', {
      error: error.message,
      model: requestedModel,
      status: error.response?.status,
      data: error.response?.data
    });

    const model = AVAILABLE_MODELS[requestedModel];
    const status = error.response?.status;
    const errorMessage =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message;

    if (status === 503) {
      const fallbackLoading = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel,
        notice: 'Model is currently loading. This can take 20-30 seconds for the first request. Please try again in a moment...\n\nFalling back to the built-in assistant for now.'
      });

      return {
        message: fallbackLoading.text,
        model: fallbackLoading.model,
        modelInfo: fallbackLoading.modelInfo,
        loading: true,
        notices: fallbackLoading.notices
      };
    }

    if (status === 429) {
      const fallbackRateLimit = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel,
        notice: 'Rate limit reached for the selected Hugging Face model. Using the built-in assistant instead.'
      });

      return {
        message: fallbackRateLimit.text,
        model: fallbackRateLimit.model,
        modelInfo: fallbackRateLimit.modelInfo,
        loading: fallbackRateLimit.loading,
        notices: fallbackRateLimit.notices
      };
    }

    if ([401, 403].includes(status)) {
      const authMessage = errorMessage
        ? `Authentication failed for the Hugging Face router: ${errorMessage}. Please double-check the HUGGINGFACE_API_KEY value.`
        : 'Authentication failed for the Hugging Face router. Please double-check the HUGGINGFACE_API_KEY value.';

      return {
        message: authMessage,
        model: requestedModel,
        modelInfo: model,
        loading: false,
        notices: normalizeNotices(model?.notice)
      };
    }

    if (status === 410) {
      const fallbackGone = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel,
        notice: 'The selected Hugging Face model endpoint returned 410 (gone). Using the built-in assistant instead.'
      });

      return {
        message: fallbackGone.text,
        model: fallbackGone.model,
        modelInfo: fallbackGone.modelInfo,
        loading: fallbackGone.loading,
        notices: fallbackGone.notices
      };
    }

    if (status === 400 && errorMessage) {
      const fallbackBadRequest = this.generateLocalChatResponse(messages, this.defaultModel, {
        requestedModel,
        notice: `Hugging Face router rejected the request: ${errorMessage}. Using the built-in assistant instead.`
      });

      return {
        message: fallbackBadRequest.text,
        model: fallbackBadRequest.model,
        modelInfo: fallbackBadRequest.modelInfo,
        loading: fallbackBadRequest.loading,
        notices: fallbackBadRequest.notices
      };
    }

    const fallbackGeneric = this.generateLocalChatResponse(messages, this.defaultModel, {
      requestedModel,
      notice: status
        ? `Remote generation failed (status ${status}). Using the built-in assistant instead.`
        : 'Remote generation failed. Using the built-in assistant instead.'
    });

    return {
      message: fallbackGeneric.text,
      model: fallbackGeneric.model,
      modelInfo: fallbackGeneric.modelInfo,
      loading: fallbackGeneric.loading,
      notices: fallbackGeneric.notices
    };
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
