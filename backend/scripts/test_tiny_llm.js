
const tinyLLM = require('../tinyLLM');
const logger = require('../logger');
const fs = require('fs');

// Disable logging for cleaner output
logger.info = () => { };
logger.warn = () => { };
logger.error = () => { };

const prompts = [
    // --- Identity & Capabilities ---
    "Who are you?",
    "Are you a real person?",
    "What can you do?",
    "How do you work?",

    // --- Coding Knowledge ---
    "How do I write a function in javascript?",
    "Explain async await",
    "What is a react component?",
    "How do REST APIs work?",
    "Show me a python loop", // Unknown to KB
    "What is a variable?", // Unknown to KB

    // --- DevOps Knowledge ---
    "What is docker?",
    "Explain CI/CD pipelines",
    "What is kubernetes used for?",
    "How do I deploy to AWS?", // Unknown to KB

    // --- General Conversation ---
    "Hello there",
    "Good morning",
    "Thank you very much",
    "Goodbye",
    "Tell me a joke", // Unknown to KB

    // --- NLP / Intent Testing ---
    "Analyze this text: The quick brown fox jumps over the lazy dog.",
    "Extract entities from: Elon Musk works at SpaceX in California.",
    "Is this positive? I love coding so much!",
    "Is this negative? I hate bugs.",

    // --- Complex / Compound ---
    "Can you help me debug my react component?",
    "I need to deploy a docker container",
    "Why is my code failing?",

    // --- Edge Cases ---
    "", // Empty
    "   ", // Whitespace
    "asdf jkl;", // Gibberish
    "What is the meaning of life, the universe, and everything?" // Abstract
];

async function runTests() {
    const results = [];
    console.log("=== Starting Tiny LLM Evaluation (30 Prompts) ===\n");

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`[${i + 1}/30] Prompt: "${prompt}"`);

        const start = Date.now();
        const response = await tinyLLM.generate(prompt);
        const duration = Date.now() - start;

        results.push({
            id: i + 1,
            prompt,
            response,
            duration
        });

        console.log(`Response: ${response}`);
        console.log(`Time: ${duration}ms\n`);
    }

    fs.writeFileSync('test_output.json', JSON.stringify(results, null, 2));
    console.log("=== Evaluation Complete. Results saved to test_output.json ===");
}

runTests();
