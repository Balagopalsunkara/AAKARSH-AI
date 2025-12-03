
const path = require('path');

async function downloadModel() {
    console.log('Starting model download...');

    // Unset HF keys to avoid auth errors with public models
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.HF_TOKEN;
    delete process.env.HF_HUB_TOKEN;

    try {
        const { pipeline, env } = await import('@xenova/transformers');

        // Explicitly clear token in the library env
        env.HF_TOKEN = null;
        env.HF_HUB_TOKEN = null;

        // Configure to download to local models directory
        env.allowLocalModels = false; // Force download
        env.allowRemoteModels = true;
        env.localModelPath = path.join(__dirname, '..', 'models');

        console.log(`Downloading to: ${env.localModelPath}`);

        // Trigger download by initializing the pipeline
        // We use the same model ID as in llmService.js
        const modelId = 'Xenova/tinyllama-chat';

        console.log(`Fetching ${modelId}...`);
        await pipeline('text-generation', modelId, {
            quantized: true
        });

        console.log('Download complete! You can now run the app offline.');

    } catch (error) {
        console.log('ERROR_MESSAGE: ' + error.message);
        process.exit(1);
    }
}

downloadModel();
