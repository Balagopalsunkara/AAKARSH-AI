const prompts = [
  'Summarize the purpose of the AI-APP project in two sentences.',
  'List three benefits of using retrieval-augmented generation for enterprise knowledge bases.',
  'Explain how to add a new REST endpoint to the existing Express backend.',
  'Provide a short onboarding checklist for a developer joining this project.',
  'What are effective strategies to monitor Node.js services in production?',
  'Generate a sample JSON payload for the /api/v1/chat endpoint using the local assistant.',
  'Suggest improvements to the chat UI for better accessibility.',
  'Describe how the local rule-based assistant differs from remote LLMs.',
  'Outline steps to configure Hugging Face credentials for this app.',
  'Give advice on reducing cold-start latency when running models locally.',
  'Draft a polite message to inform stakeholders about maintenance downtime.',
  'List five creative demo prompts to showcase the chat assistant to clients.',
  'Explain the role of the ragService in this repository.',
  'Propose a simple caching strategy for chat responses.',
  'How can we log prompt and response pairs responsibly?',
  'Provide troubleshooting tips when the frontend cannot reach the backend.',
  'Suggest metrics to track for evaluating assistant quality.',
  'Give a concise explanation of Ollama and why it is useful here.',
  'Offer a two-step plan to add unit tests for llmService.js.',
  'Write a short inspirational quote for the dashboard banner.',
  'Recommend next steps after successfully integrating a new local model.'
];

const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

(async () => {
  const results = [];
  for (const prompt of prompts) {
    try {
      const body = {
        messages: [
          { role: 'system', content: 'You are a concise, helpful assistant for the AI-APP project.' },
          { role: 'user', content: prompt }
        ],
        model: 'ollama/mistral:7b',
        options: {
          temperature: 0.7
        }
      };

      const response = await fetch('http://localhost:4000/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const json = await response.json();
      const message = json.message || json.error || '';
      results.push({
        prompt,
        status: response.status,
        response: message,
        loading: json.loading || false
      });

      console.log('Prompt:', prompt);
      console.log('Status:', response.status);
      console.log('Response preview:', message.length > 500 ? `${message.slice(0, 500)}...` : message);
      console.log('---\n');

      await new Promise(resolve => setTimeout(resolve, 750));
    } catch (error) {
      console.error('Prompt failed:', prompt, error.message);
      results.push({ prompt, status: 'error', response: error.message, loading: false });
    }
  }

  try {
    require('fs').writeFileSync('ollama_mistral_results.json', JSON.stringify(results, null, 2));
    console.log('Saved detailed results to ollama_mistral_results.json');
  } catch (error) {
    console.error('Failed to write results file:', error.message);
  }
})();
