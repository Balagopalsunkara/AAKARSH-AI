
const nlpService = require('./nlpService');
const logger = require('./logger');

/**
 * TinyLLM v2 - Enhanced lightweight, local language model
 * Improvements: Better tokenization, expanded KB, smarter matching
 */
class TinyLLM {
    constructor() {
        this.context = [];
        this.maxContext = 5;

        // Enhanced Knowledge Base with more patterns
        this.knowledge = {
            // Identity & Capabilities
            identity: [
                { pattern: ['who', 'are', 'you'], response: "I am the Local Assistant, a lightweight AI running entirely on your machine. I use advanced NLP and pattern matching to help with coding, DevOps, and technical questions." },
                { pattern: ['are', 'you', 'real'], response: "No, I am a code-based AI assistant designed to be helpful and privacy-focused. All processing happens locally." },
                { pattern: ['are', 'you', 'human'], response: "No, I'm an AI assistant that runs locally on your computer. I don't send any data to external servers." },
                { pattern: ['what', 'can', 'you', 'do'], response: "I can help with coding (JavaScript, React, Python), DevOps (Docker, CI/CD, Kubernetes), debugging, system operations, and general technical questions. I use advanced NLP to understand your intent." },
                { pattern: ['how', 'do', 'you', 'work'], response: "I analyze your input using NLP (compromise.js) to extract intent, entities, and keywords. Then I match against my knowledge base or construct contextual responses. All processing is local and instant." },
                { pattern: ['what', 'are', 'you'], response: "I'm a local AI assistant called Tiny LLM. I combine rule-based logic with NLP analysis to provide helpful responses without needing external APIs." }
            ],

            // Coding Knowledge - JavaScript
            javascript: [
                { pattern: ['function', 'javascript'], response: "In JavaScript, you can define functions in several ways:\n1. Function declaration: `function myFunc() { }`\n2. Arrow function: `const myFunc = () => { }`\n3. Function expression: `const myFunc = function() { }`\n\nArrow functions are preferred for concise syntax and lexical `this` binding." },
                { pattern: ['write', 'function'], response: "To write a function, use: `function name(params) { return value; }` or the modern arrow syntax: `const name = (params) => value;`" },
                { pattern: ['async', 'await'], response: "Async/await is syntactic sugar for Promises. Use `async` before a function to make it return a Promise, and `await` inside to pause execution until a Promise resolves:\n```javascript\nasync function fetchData() {\n  const data = await fetch(url);\n  return data.json();\n}\n```" },
                { pattern: ['promise'], response: "Promises represent eventual completion of async operations. Use `.then()` for chaining or `async/await` for cleaner syntax." },
                { pattern: ['variable'], response: "Variables store data. Use `const` for constants, `let` for mutable values, avoid `var`. Example: `const name = 'value';`" }
            ],

            // Coding Knowledge - React
            react: [
                { pattern: ['react', 'component'], response: "React components are building blocks of UI. Functional components are preferred:\n```javascript\nconst MyComponent = ({ props }) => {\n  return <div>{props.text}</div>;\n}\n```\nUse hooks like `useState` and `useEffect` for state and side effects." },
                { pattern: ['component'], response: "Components are reusable UI pieces. In React, write functional components with JSX. Pass data via props." },
                { pattern: ['react'], response: "React is a JavaScript library for building user interfaces using components. It uses a virtual DOM for efficient updates." }
            ],

            // Coding Knowledge - Python
            python: [
                { pattern: ['python', 'loop'], response: "Python loops:\n```python\n# For loop\nfor i in range(10):\n    print(i)\n\n# While loop\nwhile condition:\n    do_something()\n\n# List comprehension\nresult = [x*2 for x in range(10)]\n```" },
                { pattern: ['python'], response: "Python is a high-level programming language. It's great for scripting, data science, and automation." }
            ],

            // APIs & Architecture
            apis: [
                { pattern: ['rest', 'api'], response: "REST APIs use standard HTTP methods:\n- GET: Retrieve data\n- POST: Create data\n- PUT/PATCH: Update data\n- DELETE: Remove data\n\nDesign around resources (nouns) and use proper status codes (200, 201, 404, 500)." },
                { pattern: ['api'], response: "APIs (Application Programming Interfaces) allow programs to communicate. REST is the most common style for web APIs." }
            ],

            // DevOps Knowledge - Docker
            docker: [
                { pattern: ['docker', 'container'], response: "Docker containers package code and dependencies together. Key concepts:\n- `Dockerfile`: Defines the image\n- `docker build`: Creates an image\n- `docker run`: Starts a container\n- `docker-compose.yml`: Orchestrates multiple containers\n\nContainers are isolated, portable, and lightweight compared to VMs." },
                { pattern: ['docker'], response: "Docker is a containerization platform. It packages applications with dependencies into portable containers. Use `Dockerfile` to define images and `docker-compose` for multi-container apps." },
                { pattern: ['container'], response: "Containers are lightweight, isolated environments that package code with dependencies. Docker is the most popular container platform." }
            ],

            // DevOps Knowledge - CI/CD
            cicd: [
                { pattern: ['ci', 'cd'], response: "CI/CD automates software delivery:\n- **CI (Continuous Integration)**: Automatically test code on each commit\n- **CD (Continuous Deployment)**: Automatically deploy to production\n\nPopular tools: GitHub Actions, Jenkins, GitLab CI, CircleCI. Pipeline stages: build → test → deploy." },
                { pattern: ['pipeline'], response: "CI/CD pipelines automate build, test, and deployment stages. Define them in YAML files for tools like GitHub Actions or GitLab CI." },
                { pattern: ['deploy'], response: "Deployment involves releasing code to production. Use CI/CD pipelines, Docker for consistency, and rolling updates to minimize downtime." }
            ],

            // DevOps Knowledge - Kubernetes
            kubernetes: [
                { pattern: ['kubernetes'], response: "Kubernetes (K8s) orchestrates containerized applications across clusters. Key concepts:\n- **Pods**: Smallest deployable units\n- **Services**: Expose pods to network\n- **Deployments**: Manage pod replicas\n- **ConfigMaps/Secrets**: Configuration management\n\nUse `kubectl` CLI to manage clusters." },
                { pattern: ['k8s'], response: "K8s is short for Kubernetes. It manages container orchestration, scaling, and self-healing." }
            ],

            // General Conversation
            greetings: [
                { pattern: ['hello'], response: "Hello! How can I assist you with your project today? I can help with coding, DevOps, debugging, or technical questions." },
                { pattern: ['hi'], response: "Hi there! What are you working on? I'm here to help with code, systems, or technical challenges." },
                { pattern: ['hey'], response: "Hey! Ready to tackle some code or technical problems?" },
                { pattern: ['good', 'morning'], response: "Good morning! Let's start the day with some productive coding or problem-solving." },
                { pattern: ['good', 'afternoon'], response: "Good afternoon! What can I help you with?" },
                { pattern: ['good', 'evening'], response: "Good evening! Still working? Let me know how I can help." }
            ],

            thanks: [
                { pattern: ['thank'], response: "You're welcome! Let me know if you need anything else." },
                { pattern: ['thanks'], response: "Happy to help! Feel free to ask more questions." }
            ],

            goodbye: [
                { pattern: ['bye'], response: "Goodbye! Happy coding." },
                { pattern: ['goodbye'], response: "See you later! Keep building great things." },
                { pattern: ['see', 'you'], response: "See you! Come back anytime." }
            ]
        };
    }

    /**
     * Generate a response based on the input prompt
     */
    async generate(prompt) {
        try {
            // Handle empty input
            if (!prompt || !prompt.trim()) {
                return "I'm here to help. What would you like to know about coding, DevOps, or technical topics?";
            }

            // 1. Analyze Input using NLP Service
            const analysis = nlpService.analyze(prompt);

            // 2. Better tokenization: remove punctuation, lowercase, normalize spaces
            const normalized = (analysis.normalized || prompt)
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')  // Replace punctuation wit spaces
                .replace(/\s+/g, ' ')       // Normalize whitespace
                .trim();
            const tokens = normalized.split(' ').filter(t => t.length > 0);

            // 3. Update Context
            this.updateContext('user', prompt);

            // 4. Check for Direct Matches in Knowledge Base
            const directMatch = this.findBestMatch(tokens, normalized);
            if (directMatch) {
                this.updateContext('assistant', directMatch);
                return directMatch;
            }

            // 5. Intent-Based Generation
            if (analysis.intent) {
                const intentResponse = this.generateFromIntent(analysis, tokens);
                if (intentResponse) {
                    this.updateContext('assistant', intentResponse);
                    return intentResponse;
                }
            }

            // 6. Fallback / Constructed Response
            const fallback = this.constructFallback(analysis);
            this.updateContext('assistant', fallback);
            return fallback;

        } catch (error) {
            logger.error('TinyLLM generation failed', { error: error.message });
            return "I encountered an error processing that request. Please try rephrasing.";
        }
    }

    /**
     * Find the best matching response from the knowledge base
     */
    findBestMatch(tokens, normalized) {
        let bestMatch = null;
        let maxScore = 0;

        for (const category in this.knowledge) {
            for (const item of this.knowledge[category]) {
                // Count how many pattern words appear in the input
                let matches = 0;
                for (const word of item.pattern) {
                    if (tokens.includes(word)) {
                        matches++;
                    }
                }

                // Calculate score
                const patternLength = item.pattern.length;
                const score = matches / patternLength;

                // For short patterns (1-2 words), require higher match rate
                // For longer patterns, allow more flexibility
                let threshold = 0.5;
                if (patternLength === 1) threshold = 1.0;  // Must match exactly
                else if (patternLength === 2) threshold = 1.0;  // Must match both words
                else if (patternLength === 3) threshold = 0.67; // At least 2 of 3
                else threshold = 0.5;  // At least half

                // Bonus for exact substring match
                const patternPhrase = item.pattern.join(' ');
                const exactMatch = normalized.includes(patternPhrase);
                const finalScore = exactMatch ? score + 0.5 : score;

                if (score >= threshold && finalScore > maxScore) {
                    maxScore = finalScore;
                    bestMatch = item.response;
                }
            }
        }

        return bestMatch;
    }

    /**
     * Generate response based on detected intent and entities
     */
    generateFromIntent(analysis, tokens) {
        const { intent, entities, keywords } = analysis;

        if (intent.intent === 'question') {
            if (intent.details.isWhatQuestion) {
                if (keywords.length > 0) {
                    return `You're asking about "${keywords[0].text}". Based on the context, I'd recommend breaking this down into specific components. What aspect would you like to explore first?`;
                }
                return "That's a good question. Could you provide more context about what you're trying to achieve?";
            }
            if (intent.details.isHowQuestion) {
                return `To accomplish that, I'd recommend: 1) Break it into smaller steps, 2) Test each component, 3) Integrate and validate. What specific part would you like help with?`;
            }
            if (intent.details.isWhyQuestion) {
                return "That's worth investigating. Common reasons include configuration issues, dependency conflicts, or logic errors. Can you share more details about the error?";
            }
        }

        return null;
    }

    /**
     * Construct a fallback response using analysis data
     */
    constructFallback(analysis) {
        const { sentiment, keywords, entities } = analysis;

        // Use entities to make it sound smart
        if (entities.people.length > 0) {
            return `I see you mentioned ${entities.people[0]}. I can help you research information or analyze code related to them.`;
        }

        if (entities.places.length > 0) {
            return `${entities.places[0]} - interesting! Are you working on something location-specific or just providing context?`;
        }

        if (keywords.length > 0) {
            const topic = keywords[0].text;
            return `Regarding "${topic}" - I can help you explore this concept, write code for it, or troubleshoot issues. What's your main goal?`;
        }

        if (sentiment.isNegative) {
            return "I sense some frustration. Let's tackle this systematically. What's the specific error or issue you're facing?";
        }

        if (sentiment.isPositive) {
            return "Great enthusiasm! What are you building? I can help with architecture, code, or deployment strategies.";
        }

        return "I'm listening. Tell me more about what you're working on - whether it's code, infrastructure, or debugging.";
    }

    updateContext(role, content) {
        this.context.push({ role, content });
        if (this.context.length > this.maxContext * 2) {
            this.context.shift();
        }
    }
}

module.exports = new TinyLLM();
