const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.apiKey = null;
    this.baseUrl = null;
    this.modelName = null;
    this.globalSystemPrompt = this._loadGlobalSystemPrompt();

    this.initializeClient();
  }

  initializeClient() {
    // Support both Claude (ANTHROPIC_*) and Gemini (GEMINI_*) env vars
    // Prefer Anthropic/Claude if configured
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY || config.getApiKey('GEMINI');
    this.baseUrl = process.env.ANTHROPIC_BASE_URL || config.get('llm.claude.baseUrl') || 'https://api.anthropic.com';
    this.modelName = process.env.ANTHROPIC_MODEL || config.get('llm.claude.model') || 'claude-sonnet-4-20250514';

    if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here' || this.apiKey === 'your-api-key-here') {
      logger.warn('LLM API key not configured', {
        keyExists: !!this.apiKey,
        isPlaceholder: true
      });
      return;
    }

    this.isInitialized = true;
    logger.info('Claude LLM client initialized successfully', {
      model: this.modelName,
      baseUrl: this.baseUrl
    });
  }

  /**
   * Load the global system prompt from prompts/system.md.
   * This prompt is prepended to every LLM call regardless of skill.
   */
  _loadGlobalSystemPrompt() {
    try {
      const promptPath = path.join(__dirname, '../../prompts/system.md');
      if (fs.existsSync(promptPath)) {
        const content = fs.readFileSync(promptPath, 'utf8').trim();
        logger.info('Global system prompt loaded', { length: content.length });
        return content;
      }
    } catch (e) {
      logger.warn('Failed to load global system prompt', { error: e.message });
    }
    return '';
  }

  /**
   * Return the system prompt. Skill-specific prompts have been removed —
   * only the global system.md prompt is used.
   */
  _buildSystemPrompt() {
    return this.globalSystemPrompt || undefined;
  }

  getGenerationConfig(overrides = {}) {
    const defaults = config.get('llm.claude.generation') || {};
    const fallback = {
      temperature: 0.7,
      maxOutputTokens: 16384
    };
    return { ...fallback, ...defaults, ...overrides };
  }

  /**
   * Process an image with Claude using the active skill prompt.
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check API key configuration.');
    }
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const base64 = imageBuffer.toString('base64');

      // Map mime types for Claude's supported media types
      const mediaType = this._normalizeMediaType(mimeType);

      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64
              }
            },
            {
              type: 'text',
              text: this.formatImageInstruction(activeSkill, programmingLanguage)
            }
          ]
        }
      ];

      const genConfig = this.getGenerationConfig();
      const request = {
        system: this._buildSystemPrompt(),
        messages,
        max_tokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature
      };

      const thinkingEnabled = config.get('llm.extendedThinking') || false;
      if (thinkingEnabled) {
        request.thinking = true;
        request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
      }

      const result = await this._makeClaudeRequest(request);
      const responseText = typeof result === 'string' ? result : result.text;
      const thinkingText = typeof result === 'object' ? result.thinking : null;

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        thinking: thinkingText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });
      if (config.get('llm.claude.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  _normalizeMediaType(mimeType) {
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (supported.includes(mimeType)) return mimeType;
    if (mimeType === 'image/jpg') return 'image/jpeg';
    return 'image/png'; // default fallback
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const request = this._buildTextRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const result = await this._makeClaudeRequest(request);
      const responseText = typeof result === 'string' ? result : result.text;
      const thinkingText = typeof result === 'object' ? result.thinking : null;

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        thinking: thinkingText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', { error: error.message, activeSkill });
      if (config.get('llm.claude.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check API key configuration.');
    }

    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const systemPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);

      // Build conversation history
      const sessionManager = require('../managers/session.manager');
      let messages = [];

      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        const history = sessionManager.getConversationHistory(10);
        messages = history
          .filter(e => e.role !== 'system' && e.content && e.content.trim().length > 0)
          .slice(-8)
          .map(e => ({
            role: e.role === 'model' ? 'assistant' : 'user',
            content: e.content.trim()
          }));
      }

      // Add current user message
      messages.push({ role: 'user', content: cleanText });

      // Ensure messages alternate properly (Claude requirement)
      messages = this._fixMessageAlternation(messages);

      const genConfig = this.getGenerationConfig();
      const request = {
        system: this._buildSystemPrompt(),
        messages,
        max_tokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature
      };

      const thinkingEnabled = config.get('llm.extendedThinking') || false;
      if (thinkingEnabled) {
        request.thinking = true;
        request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
      }

      const result = await this._makeClaudeRequest(request);
      const responseText = typeof result === 'string' ? result : result.text;
      const thinkingText = typeof result === 'object' ? result.thinking : null;

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      return {
        response: finalResponse,
        thinking: thinkingText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', { error: error.message, activeSkill });
      if (config.get('llm.claude.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      throw error;
    }
  }

  _buildTextRequest(text, activeSkill, sessionMemory, programmingLanguage) {

    const sessionManager = require('../managers/session.manager');
    let messages = [];

    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const history = sessionManager.getConversationHistory(15);
      messages = history
        .filter(e => e.role !== 'system' && e.content && e.content.trim().length > 0)
        .map(e => ({
          role: e.role === 'model' ? 'assistant' : 'user',
          content: e.content.trim()
        }));
    }

    // Add current user input
    messages.push({
      role: 'user',
      content: this.formatUserMessage(text, activeSkill)
    });

    // Ensure messages alternate properly
    messages = this._fixMessageAlternation(messages);

    const genConfig = this.getGenerationConfig();
    const request = {
      system: this._buildSystemPrompt(),
      messages,
      max_tokens: genConfig.maxOutputTokens,
      temperature: genConfig.temperature
    };

    const thinkingEnabled = config.get('llm.extendedThinking') || false;
    if (thinkingEnabled) {
      request.thinking = true;
      request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
    }

    return request;
  }

  /**
   * Claude requires strict user/assistant alternation.
   * Merge consecutive same-role messages.
   */
  _fixMessageAlternation(messages) {
    if (!messages.length) return [{ role: 'user', content: 'Hello' }];

    const fixed = [];
    for (const msg of messages) {
      if (fixed.length > 0 && fixed[fixed.length - 1].role === msg.role) {
        // Merge consecutive same-role messages
        fixed[fixed.length - 1].content += '\n\n' + msg.content;
      } else {
        fixed.push({ ...msg });
      }
    }

    // Must start with user
    if (fixed[0].role !== 'user') {
      fixed.unshift({ role: 'user', content: '(continuing conversation)' });
    }

    return fixed;
  }

  /**
   * Make a request to the Claude/Anthropic-compatible API.
   */
  async _makeClaudeRequest(requestBody) {
    const maxRetries = config.get('llm.claude.maxRetries') || 3;
    const timeout = config.get('llm.claude.timeout') || 60000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const body = {
          model: this.modelName,
          max_tokens: requestBody.max_tokens || 16384,
          messages: requestBody.messages
        };

        if (requestBody.temperature !== undefined) {
          body.temperature = requestBody.temperature;
        }
        if (requestBody.system) {
          body.system = requestBody.system;
        }

        if (requestBody.thinking) {
          body.thinking = {
            type: "enabled",
            budget_tokens: requestBody.thinking_budget || 10000
          };
          // Claude requires temperature=1 or omitted when thinking is enabled
          delete body.temperature;
        }

        const postData = JSON.stringify(body);
        const parsedUrl = new URL(`${this.baseUrl}/v1/messages`);
        const isHttps = parsedUrl.protocol === 'https:';
        const transport = isHttps ? https : http;

        const agent = new (isHttps ? https : http).Agent({ keepAlive: true, maxSockets: 2 });

        const options = {
          method: 'POST',
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout,
          agent
        };

        logger.debug(`Claude API attempt ${attempt}`, {
          model: this.modelName,
          baseUrl: this.baseUrl,
          messageCount: requestBody.messages.length,
          hasSystem: !!requestBody.system
        });

        const responseText = await new Promise((resolve, reject) => {
          const req = transport.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try {
                if (res.statusCode !== 200) {
                  const errBody = JSON.parse(data).error || {};
                  reject(new Error(`HTTP ${res.statusCode}: ${errBody.message || data.substring(0, 200)}`));
                  return;
                }

                const response = JSON.parse(data);

                // Extract thinking blocks (extended thinking)
                const thinkingBlocks = (response.content || [])
                  .filter(block => block.type === 'thinking')
                  .map(block => block.thinking);

                // Extract text blocks
                const textBlocks = (response.content || [])
                  .filter(block => block.type === 'text')
                  .map(block => block.text);

                if (!textBlocks.length) {
                  reject(new Error('No text content in Claude response'));
                  return;
                }

                const text = textBlocks.join('\n');
                const thinking = thinkingBlocks.length ? thinkingBlocks.join('\n') : null;

                if (response.stop_reason === 'max_tokens') {
                  logger.warn('Claude response reached max tokens limit');
                }

                logger.debug('Claude API request successful', {
                  attempt,
                  responseLength: text.length,
                  hasThinking: !!thinking,
                  stopReason: response.stop_reason,
                  inputTokens: response.usage?.input_tokens,
                  outputTokens: response.usage?.output_tokens
                });

                resolve({ text, thinking });
              } catch (parseError) {
                reject(new Error(`Failed to parse Claude response: ${parseError.message}`));
              }
            });
          });

          req.on('error', (error) => {
            reject(new Error(`Claude request failed: ${error.message}`));
          });
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Claude request timeout'));
          });

          req.write(postData);
          req.end();
        });

        return responseText;
      } catch (error) {
        const errorInfo = this.analyzeError(error);
        logger.warn(`Claude API attempt ${attempt} failed`, {
          error: error.message,
          errorType: errorInfo.type,
          remainingAttempts: maxRetries - attempt
        });

        if (attempt === maxRetries) {
          const finalError = new Error(`Claude API failed after ${maxRetries} attempts: ${error.message}`);
          finalError.originalError = error;
          throw finalError;
        }

        const baseDelay = errorInfo.isNetworkError ? 2500 : 1500;
        const delay = baseDelay * attempt + Math.random() * 1000;
        await this.delay(delay);
      }
    }
  }

  /**
   * Make a streaming request to the Claude/Anthropic-compatible API.
   * Parses SSE events and calls callbacks for each delta.
   * Returns the same { text, thinking } shape as _makeClaudeRequest when done.
   *
   * @param {object} requestBody - Same shape as _makeClaudeRequest
   * @param {object} callbacks - { onStart, onText, onThinking, onEnd, onError }
   * @returns {Promise<{text: string, thinking: string|null}>}
   */
  async _makeClaudeStreamingRequest(requestBody, callbacks = {}) {
    const timeout = config.get('llm.claude.timeout') || 60000;

    const body = {
      model: this.modelName,
      max_tokens: requestBody.max_tokens || 16384,
      messages: requestBody.messages,
      stream: true
    };

    if (requestBody.temperature !== undefined) {
      body.temperature = requestBody.temperature;
    }
    if (requestBody.system) {
      body.system = requestBody.system;
    }

    if (requestBody.thinking) {
      body.thinking = {
        type: "enabled",
        budget_tokens: requestBody.thinking_budget || 10000
      };
      // Claude requires temperature=1 or omitted when thinking is enabled
      delete body.temperature;
    }

    const postData = JSON.stringify(body);
    const parsedUrl = new URL(`${this.baseUrl}/v1/messages`);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const httpAgent = new (isHttps ? https : http).Agent({ keepAlive: true, maxSockets: 2 });

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout,
      agent: httpAgent
    };

    logger.debug('Claude streaming API request', {
      model: this.modelName,
      baseUrl: this.baseUrl,
      messageCount: requestBody.messages.length,
      hasSystem: !!requestBody.system
    });

    return new Promise((resolve, reject) => {
      let textAccumulator = '';
      let thinkingAccumulator = '';
      let sseBuffer = '';
      let streamStarted = false;
      let currentBlockType = null; // 'text' or 'thinking'

      const req = transport.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errData = '';
          res.on('data', chunk => { errData += chunk; });
          res.on('end', () => {
            try {
              const errBody = JSON.parse(errData).error || {};
              reject(new Error(`HTTP ${res.statusCode}: ${errBody.message || errData.substring(0, 200)}`));
            } catch (_) {
              reject(new Error(`HTTP ${res.statusCode}: ${errData.substring(0, 200)}`));
            }
          });
          return;
        }

        res.on('data', (chunk) => {
          sseBuffer += chunk.toString();

          // Process complete SSE lines
          const lines = sseBuffer.split('\n');
          // Keep the last incomplete line in the buffer
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // skip empty lines and comments

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              if (jsonStr === '[DONE]') continue;

              try {
                const event = JSON.parse(jsonStr);
                this._handleStreamEvent(event, {
                  onStart: () => {
                    streamStarted = true;
                    if (callbacks.onStart) callbacks.onStart();
                  },
                  onBlockStart: (type) => {
                    currentBlockType = type;
                  },
                  onTextDelta: (delta) => {
                    textAccumulator += delta;
                    if (callbacks.onText) callbacks.onText(delta);
                  },
                  onThinkingDelta: (delta) => {
                    thinkingAccumulator += delta;
                    if (callbacks.onThinking) callbacks.onThinking(delta);
                  },
                  onBlockStop: () => {
                    currentBlockType = null;
                  }
                });
              } catch (parseErr) {
                logger.debug('SSE parse skip', { line: trimmed.substring(0, 100) });
              }
            }
          }
        });

        res.on('end', () => {
          // Process any remaining buffer
          if (sseBuffer.trim().startsWith('data: ')) {
            try {
              const event = JSON.parse(sseBuffer.trim().slice(6));
              this._handleStreamEvent(event, {
                onTextDelta: (d) => { textAccumulator += d; if (callbacks.onText) callbacks.onText(d); },
                onThinkingDelta: (d) => { thinkingAccumulator += d; if (callbacks.onThinking) callbacks.onThinking(d); }
              });
            } catch (_) {}
          }

          const result = {
            text: textAccumulator,
            thinking: thinkingAccumulator || null
          };

          logger.debug('Claude streaming request completed', {
            responseLength: textAccumulator.length,
            hasThinking: !!thinkingAccumulator
          });

          if (callbacks.onEnd) callbacks.onEnd(result);
          resolve(result);
        });

        res.on('error', (error) => {
          const err = new Error(`Stream read error: ${error.message}`);
          if (callbacks.onError) callbacks.onError(err);
          reject(err);
        });
      });

      req.on('error', (error) => {
        const err = new Error(`Claude streaming request failed: ${error.message}`);
        if (streamStarted && callbacks.onError) {
          callbacks.onError(err);
        }
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        const err = new Error('Claude streaming request timeout');
        if (streamStarted && callbacks.onError) {
          callbacks.onError(err);
        }
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Handle a single SSE event from the Claude streaming API.
   */
  _handleStreamEvent(event, handlers) {
    switch (event.type) {
      case 'message_start':
        if (handlers.onStart) handlers.onStart();
        break;

      case 'content_block_start':
        if (event.content_block) {
          const blockType = event.content_block.type; // 'text' or 'thinking'
          if (handlers.onBlockStart) handlers.onBlockStart(blockType);
        }
        break;

      case 'content_block_delta':
        if (event.delta) {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            if (handlers.onTextDelta) handlers.onTextDelta(event.delta.text);
          } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
            if (handlers.onThinkingDelta) handlers.onThinkingDelta(event.delta.thinking);
          }
        }
        break;

      case 'content_block_stop':
        if (handlers.onBlockStop) handlers.onBlockStop();
        break;

      case 'message_delta':
        // Contains stop_reason, usage info
        break;

      case 'message_stop':
        // Stream complete — handled by res.on('end')
        break;

      default:
        break;
    }
  }

  /**
   * Streaming variant of processImageWithSkill.
   * Calls callbacks during streaming, returns full result when done.
   */
  async processImageWithSkillStreaming(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, callbacks = {}) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check API key configuration.');
    }
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const base64 = imageBuffer.toString('base64');
      const mediaType = this._normalizeMediaType(mimeType);

      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: this.formatImageInstruction(activeSkill, programmingLanguage)
            }
          ]
        }
      ];

      const genConfig = this.getGenerationConfig();
      const request = {
        system: this._buildSystemPrompt(),
        messages,
        max_tokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature
      };

      const thinkingEnabled = config.get('llm.extendedThinking') || false;
      if (thinkingEnabled) {
        request.thinking = true;
        request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
      }

      const result = await this._makeClaudeStreamingRequest(request, callbacks);
      const responseText = result.text;
      const thinkingText = result.thinking;

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('LLM streaming image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        thinking: thinkingText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM streaming image processing failed', { error: error.message, activeSkill });
      if (config.get('llm.claude.fallbackEnabled')) {
        return this.generateFallbackResponse('[image]', activeSkill);
      }
      throw error;
    }
  }

  /**
   * Streaming variant of processTranscriptionWithIntelligentResponse.
   * Used for typed chat messages and voice transcriptions.
   */
  async processTranscriptionStreaming(text, activeSkill, sessionMemory = [], programmingLanguage = null, callbacks = {}) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check API key configuration.');
    }

    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const systemPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);

      // Build conversation history
      const sessionManager = require('../managers/session.manager');
      let messages = [];

      if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
        const history = sessionManager.getConversationHistory(10);
        messages = history
          .filter(e => e.role !== 'system' && e.content && e.content.trim().length > 0)
          .slice(-8)
          .map(e => ({
            role: e.role === 'model' ? 'assistant' : 'user',
            content: e.content.trim()
          }));
      }

      messages.push({ role: 'user', content: cleanText });
      messages = this._fixMessageAlternation(messages);

      const genConfig = this.getGenerationConfig();
      const request = {
        system: this._buildSystemPrompt(),
        messages,
        max_tokens: genConfig.maxOutputTokens,
        temperature: genConfig.temperature
      };

      const thinkingEnabled = config.get('llm.extendedThinking') || false;
      if (thinkingEnabled) {
        request.thinking = true;
        request.thinking_budget = config.get('llm.thinkingBudget') || 10000;
      }

      const result = await this._makeClaudeStreamingRequest(request, callbacks);
      const responseText = result.text;
      const thinkingText = result.thinking;

      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      return {
        response: finalResponse,
        thinking: thinkingText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM streaming transcription failed', { error: error.message, activeSkill });
      if (config.get('llm.claude.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill);
      }
      throw error;
    }
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      const normalizedTildes = replacedBackticks
        .replace(/~~~([^\n]*)\n/g, (match, info) => {
          const current = (info || '').trim();
          if (!current) return '```\n';
          return '```' + fenceTag + '\n';
        });

      return normalizedTildes;
    } catch (_) {
      return text;
    }
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# Intelligent Transcription Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to question/message with appropriate brevity.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Always respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;

    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Respond with: "Yeah, I'm listening. Ask your question relevant to ${activeSkill}."
- Or similar brief acknowledgments

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers

If the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  analyzeError(error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('fetch failed') || msg.includes('network error') ||
        msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('timeout')) {
      return { type: 'NETWORK_ERROR', isNetworkError: true, suggestedAction: 'Check internet connection' };
    }
    if (msg.includes('unauthorized') || msg.includes('invalid') || msg.includes('forbidden') || msg.includes('401')) {
      return { type: 'AUTH_ERROR', isNetworkError: false, suggestedAction: 'Verify API key' };
    }
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('overloaded')) {
      return { type: 'RATE_LIMIT_ERROR', isNetworkError: false, suggestedAction: 'Wait before retrying' };
    }
    return { type: 'UNKNOWN_ERROR', isNetworkError: false, suggestedAction: 'Check logs' };
  }

  async checkNetworkConnectivity() {
    const parsedUrl = new URL(this.baseUrl);
    const tests = [
      { host: parsedUrl.hostname, port: parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80), name: 'LLM API Endpoint' }
    ];
    const results = await Promise.allSettled(tests.map(t => this.testNetworkConnection(t)));
    return {
      timestamp: new Date().toISOString(),
      tests: results.map((r, i) => ({
        ...tests[i],
        success: r.status === 'fulfilled' && r.value,
        error: r.status === 'rejected' ? r.reason.message : null
      }))
    };
  }

  async testNetworkConnection({ host, port }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      const timer = setTimeout(() => { socket.destroy(); reject(new Error(`Timeout to ${host}:${port}`)); }, 5000);
      socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.on('error', (e) => { clearTimeout(timer); reject(new Error(`Failed to ${host}:${port}: ${e.message}`)); });
      socket.connect(port, host);
    });
  }

  async testConnection() {
    if (!this.isInitialized) return { success: false, error: 'Service not initialized' };
    try {
      const startTime = Date.now();
      const result = await this._makeClaudeRequest({
        messages: [{ role: 'user', content: 'Test connection. Respond with OK.' }],
        max_tokens: 10,
        temperature: 0
      });
      const response = typeof result === 'string' ? result : result.text;
      return { success: true, response, latency: Date.now() - startTime };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  updateApiKey(newApiKey) {
    this.apiKey = newApiKey;
    process.env.ANTHROPIC_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    logger.info('API key updated and client reinitialized');
  }

  generateFallbackResponse(text, activeSkill) {
    const responses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components.',
      'system-design': 'For this system design question, consider scalability, reliability, and trade-offs.',
      'programming': 'This looks like a programming challenge. Focus on requirements, edge cases, and complexity.',
      'default': 'I can help analyze this content. Please ensure your API key is properly configured.'
    };
    return {
      response: responses[activeSkill] || responses.default,
      metadata: { skill: activeSkill, processingTime: 0, requestId: this.requestCount, usedFallback: true }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    const textLower = (text || '').toLowerCase();
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', '?'];
    const seemsLikeQuestion = questionIndicators.some(i => textLower.includes(i));

    const response = seemsLikeQuestion
      ? `I'm having trouble processing that right now. Could you rephrase your ${activeSkill} question?`
      : `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;

    return {
      response,
      metadata: { skill: activeSkill, processingTime: 0, requestId: this.requestCount, usedFallback: true, isTranscriptionResponse: true }
    };
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      model: this.modelName,
      baseUrl: this.baseUrl
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService();
