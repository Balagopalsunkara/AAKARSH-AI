// test-local-fallback.js
// Script to test and log local assistant fallback in the backend

const axios = require('axios');

async function testLocalFallback() {
  const endpoint = 'http://localhost:4000/api/v1/chat';
  const testPayloads = [
    {
      description: 'No API key, default model',
      body: {
        messages: [
          { role: 'user', content: 'What can you do?' }
        ],
        model: 'local/instruct',
        options: {}
      }
    },
    {
      description: 'No API key, non-existent model',
      body: {
        messages: [
          { role: 'user', content: 'What is the weather?' }
        ],
        model: 'huggingface/meta-llama-3.1-8b-instruct',
        options: {}
      }
    },
    {
      description: 'No API key, empty model',
      body: {
        messages: [
          { role: 'user', content: 'Tell me a joke.' }
        ],
        model: '',
        options: {}
      }
    }
  ];

  for (const test of testPayloads) {
    try {
      console.log(`\n--- ${test.description} ---`);
      const res = await axios.post(endpoint, test.body);
      console.log('Response:', {
        model: res.data.model,
        message: res.data.message,
        notices: res.data.notices
      });
    } catch (err) {
      if (err.response) {
        console.error('Error response:', err.response.data);
      } else {
        console.error('Request error:', err.message);
      }
    }
  }
}

testLocalFallback();
