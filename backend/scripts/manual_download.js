
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MODEL_ID = 'Xenova/tinyllama-chat';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const OUTPUT_DIR = path.join(__dirname, '..', 'models', MODEL_ID);

const FILES = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'model_quantized.onnx'
];

async function downloadFile(filename) {
    const url = `${BASE_URL}/${filename}`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    console.log(`Downloading ${filename}...`);

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error = null;
            writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
            });
            writer.on('close', () => {
                if (!error) {
                    console.log(`Saved ${filename}`);
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(`Failed to download ${filename}: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        }
        throw error;
    }
}

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`Downloading model ${MODEL_ID} to ${OUTPUT_DIR}`);

    for (const file of FILES) {
        try {
            if (fs.existsSync(path.join(OUTPUT_DIR, file))) {
                console.log(`${file} already exists, skipping.`);
                continue;
            }
            await downloadFile(file);
        } catch (error) {
            console.error(`Error downloading ${file}, stopping.`);
            process.exit(1);
        }
    }

    console.log('All files downloaded successfully.');
}

main();
