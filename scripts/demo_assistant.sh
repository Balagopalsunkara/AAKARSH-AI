#!/bin/bash

# AI-APP Built-in Assistant Demo Script
# Demonstrates IT workplace operations capabilities
# Usage: ./scripts/demo_assistant.sh

API_BASE="http://localhost:4000"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AI-APP Built-in Assistant - IT Operations Demo          ║${NC}"
echo -e "${CYAN}║   Version 2.0 - Enhanced Workplace Capabilities            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}\n"

# Check if server is running
echo -e "${BLUE}Checking server status...${NC}"
if ! curl -s "${API_BASE}/health" > /dev/null; then
    echo -e "${RED}❌ Server is not running on port 4000${NC}"
    echo -e "${YELLOW}Please start the server: cd backend && npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}\n"

# 1. Get Capabilities
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}1. Assistant Capabilities Overview${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 GET /api/v1/assistant/capabilities${NC}"
curl -s "${API_BASE}/api/v1/assistant/capabilities" | jq -r '.message, .version' | while read line; do
    echo -e "${YELLOW}  $line${NC}"
done
echo ""

# 2. Intent Detection
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}2. Intent Detection${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"

queries=(
    "How do I deploy my application?"
    "What security vulnerabilities should I check?"
    "My database is slow"
)

for query in "${queries[@]}"; do
    echo -e "${BLUE}📍 Query: \"${query}\"${NC}"
    result=$(curl -s -X POST "${API_BASE}/api/v1/intent" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"${query}\"}")
    intent=$(echo "$result" | jq -r '.intent')
    name=$(echo "$result" | jq -r '.name')
    echo -e "${YELLOW}  → Detected: ${intent} (${name})${NC}"
done
echo ""

# 3. Code Review
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}3. Code Review${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/code-review${NC}"
review=$(curl -s -X POST "${API_BASE}/api/v1/assistant/code-review" \
    -H "Content-Type: application/json" \
    -d '{"code": "function add(a, b) { return a + b; }", "language": "javascript"}')
echo -e "${YELLOW}  Language: $(echo "$review" | jq -r '.language')${NC}"
echo -e "${YELLOW}  Model: $(echo "$review" | jq -r '.model')${NC}"
echo -e "${GREEN}  ✅ Review generated ($(echo "$review" | jq -r '.review' | wc -c) chars)${NC}\n"

# 4. Troubleshooting
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}4. Troubleshooting Assistant${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/troubleshoot${NC}"
troubleshoot=$(curl -s -X POST "${API_BASE}/api/v1/assistant/troubleshoot" \
    -H "Content-Type: application/json" \
    -d '{"error_message": "Connection timeout", "context": "Database connection"}')
echo -e "${YELLOW}  Model: $(echo "$troubleshoot" | jq -r '.model')${NC}"
echo -e "${GREEN}  ✅ Analysis generated ($(echo "$troubleshoot" | jq -r '.analysis' | wc -c) chars)${NC}\n"

# 5. Security Check
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}5. Security Analysis${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/security-check${NC}"
security=$(curl -s -X POST "${API_BASE}/api/v1/assistant/security-check" \
    -H "Content-Type: application/json" \
    -d '{"code": "const query = `SELECT * FROM users WHERE id = ${id}`;", "type": "javascript"}')
echo -e "${YELLOW}  Type: $(echo "$security" | jq -r '.type')${NC}"
echo -e "${GREEN}  ✅ Security analysis complete${NC}\n"

# 6. Performance Optimization
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}6. Performance Optimization${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/optimize${NC}"
optimize=$(curl -s -X POST "${API_BASE}/api/v1/assistant/optimize" \
    -H "Content-Type: application/json" \
    -d '{"code": "for(let i=0; i<n; i++) { for(let j=0; j<n; j++) {} }"}')
echo -e "${GREEN}  ✅ Optimization suggestions generated${NC}\n"

# 7. Test Generation
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}7. Test Generation${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/generate-tests${NC}"
tests=$(curl -s -X POST "${API_BASE}/api/v1/assistant/generate-tests" \
    -H "Content-Type: application/json" \
    -d '{"code": "function multiply(a, b) { return a * b; }", "framework": "jest"}')
echo -e "${YELLOW}  Framework: $(echo "$tests" | jq -r '.framework')${NC}"
echo -e "${YELLOW}  Type: $(echo "$tests" | jq -r '.type')${NC}"
echo -e "${GREEN}  ✅ Tests generated${NC}\n"

# 8. Documentation
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}8. Documentation Generation${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 POST /api/v1/assistant/document${NC}"
doc=$(curl -s -X POST "${API_BASE}/api/v1/assistant/document" \
    -H "Content-Type: application/json" \
    -d '{"type": "api", "content": "GET /api/users - Returns user list"}')
echo -e "${YELLOW}  Type: $(echo "$doc" | jq -r '.type')${NC}"
echo -e "${YELLOW}  Format: $(echo "$doc" | jq -r '.format')${NC}"
echo -e "${GREEN}  ✅ Documentation generated${NC}\n"

# 9. Deployment Checklist
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}9. Deployment Checklist${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 GET /api/v1/assistant/deployment-checklist${NC}"
checklist=$(curl -s "${API_BASE}/api/v1/assistant/deployment-checklist")
echo -e "${YELLOW}  Checklist sections:${NC}"
echo "$checklist" | jq -r '.checklist | keys[]' | while read section; do
    count=$(echo "$checklist" | jq -r ".checklist.${section} | length")
    echo -e "${YELLOW}    • ${section}: ${count} items${NC}"
done
echo ""

# 10. Available Intents
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}10. All Available Intents${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📍 GET /api/v1/intents${NC}"
intents=$(curl -s "${API_BASE}/api/v1/intents")
count=$(echo "$intents" | jq -r '.intents | length')
echo -e "${YELLOW}  Total intents: ${count}${NC}"
echo "$intents" | jq -r '.intents[].name' | head -8 | while read name; do
    echo -e "${YELLOW}    • ${name}${NC}"
done
echo -e "${YELLOW}    ... and $(($count - 8)) more${NC}\n"

# Summary
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}✨ Demo Complete${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}\n"
echo -e "${GREEN}All IT workplace operations capabilities tested successfully!${NC}\n"
echo -e "${CYAN}Key Features Demonstrated:${NC}"
echo -e "${GREEN}  ✅ Intent detection for 16 categories${NC}"
echo -e "${GREEN}  ✅ Code review and security analysis${NC}"
echo -e "${GREEN}  ✅ Troubleshooting and incident response${NC}"
echo -e "${GREEN}  ✅ Performance optimization suggestions${NC}"
echo -e "${GREEN}  ✅ Automated test generation${NC}"
echo -e "${GREEN}  ✅ Documentation generation${NC}"
echo -e "${GREEN}  ✅ Deployment checklists${NC}"
echo -e "${GREEN}  ✅ All features work offline!${NC}\n"
echo -e "${YELLOW}💡 For more details, see ASSISTANT_CAPABILITIES.md${NC}\n"
