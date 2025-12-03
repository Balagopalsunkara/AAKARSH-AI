const axios = require('axios');
const logger = require('./logger');

class ImageGenerationService {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY;
    }

    async generateImage(prompt, provider = 'auto') {
        if (provider === 'auto' || provider === 'openai') {
            if (this.openaiKey) {
                try {
                    return await this.generateWithOpenAI(prompt);
                } catch (error) {
                    logger.warn('OpenAI image generation failed, falling back', { error: error.message });
                    if (provider === 'openai') throw error;
                }
            }
        }

        throw new Error('No image generation provider available (OpenAI key not configured)');
    }

    async generateWithOpenAI(prompt) {
        const response = await axios.post(
            'https://api.openai.com/v1/images/generations',
            {
                prompt,
                n: 1,
                size: '512x512',
                response_format: 'b64_json'
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const b64 = response.data.data[0].b64_json;
        return `data:image/png;base64,${b64}`;
    }

}

module.exports = new ImageGenerationService();
