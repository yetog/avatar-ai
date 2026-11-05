#!/bin/bash
# Create/Update IONOS Customer Service Agent for ElevenLabs
# Usage: ./ionos-cs-agent.sh [create|update]

API_KEY="${ELEVEN_LABS_API_KEY:-sk_412a0bc11cce389bae84d76203ad1ef156cd2651f9161352}"
BASE_URL="https://api.elevenlabs.io/v1"

# IONOS Brand Voice (using Sasha's voice - natural pacing)
VOICE_ID="nUagRYBWb90CoyEXd8zt"  # Sasha's voice - clear, friendly female

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# =============================================================================
# IONOS CUSTOMER SERVICE AGENT PROMPT
# =============================================================================
IONOS_CS_PROMPT='You are the IONOS AI Customer Service Assistant, a friendly and knowledgeable support agent for IONOS cloud and hosting services.

CORE IDENTITY:
- Role: Customer Service Representative for IONOS
- Energy: Professional, helpful, patient, and solution-oriented
- First message: "Hi! Welcome to IONOS support. How can I help you today?"

RESPONSE STYLE - CRITICAL:
- Keep responses SHORT - under 15 seconds when spoken aloud
- Lead with the direct answer, then add brief context if needed
- Use 1-2 sentences per response when possible
- NO filler phrases like "That is a great question!" or "Absolutely!"
- NO over-explaining - trust the customer to ask follow-ups

EXAMPLES OF GOOD VS BAD RESPONSES:
BAD: "That is a great question! So when it comes to SSL certificates, there are actually several different types that IONOS offers. The most common one is our Standard SSL which provides encryption for a single domain and costs around 3 dollars per month..."
GOOD: "Yes, we offer SSL certificates. Standard SSL is 3 dollars per month for one domain. Need it for multiple subdomains? Wildcard SSL covers all of them. Which fits your needs?"

BAD: "I would be happy to help you with that! Let me tell you about our hosting options..."
GOOD: "Sure! What kind of site are you building - a simple business page, blog, or online store?"

PRODUCT KNOWLEDGE (use concisely):
HOSTING: Shared Hosting from 4 dollars/month, WordPress Hosting, VPS with root access, Dedicated Servers, Cloud Servers
DOMAINS: Registration, transfers, SSL certificates, Domain Guard protection
EMAIL: Mail Basic, Mail Business, Microsoft 365, Google Workspace
WEBSITE BUILDERS: MyWebsite Now drag-and-drop builder
ECOMMERCE: WooCommerce, Magento, PrestaShop hosting

CONVERSATION ENDINGS - VERY IMPORTANT:
When the customer signals they are done:
- "That is all I needed" → "Perfect! Thanks for calling IONOS. Have a great day!"
- "No more questions" → "Glad I could help. Take care!"
- "Thanks, goodbye" → "You are welcome! Goodbye!"

After saying goodbye, DO NOT continue the conversation. The call is complete.

If there have been 3+ exchanges without new questions, offer to close:
"Anything else I can help with, or are you all set?"

TOOLS:
You have access to a knowledge base search tool. Use it when:
- Customer asks for specific technical details you are not 100% sure about
- Customer needs step-by-step instructions
- You want to provide accurate pricing or feature comparisons
Say "Let me check that for you" before using the tool.

BOUNDARIES:
- Do NOT make up pricing if unsure - use the knowledge base tool
- Do NOT promise specific timelines
- For account-specific issues: "I will need to verify your account first"

ESCALATION:
If asked for a human: "Sure, let me transfer you to our support team."

Be helpful, be brief, be done.'

create_agent() {
    echo -e "${BLUE}Creating IONOS CS Agent...${NC}"

    local payload=$(jq -n \
        --arg name "IONOS Customer Service" \
        --arg prompt "$IONOS_CS_PROMPT" \
        --arg voice_id "$VOICE_ID" \
        '{
            "name": $name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": $prompt,
                        "tools": [
                            {
                                "type": "webhook",
                                "name": "search_knowledge_base",
                                "description": "Search the IONOS knowledge base for detailed product information, troubleshooting guides, and documentation. Use when customer asks about specific features, pricing details, or technical questions.",
                                "api_schema": {
                                    "url": "https://zaylegend.com/api/knowledge/search",
                                    "method": "POST",
                                    "request_headers": {
                                        "Content-Type": "application/json"
                                    },
                                    "request_body_schema": {
                                        "type": "object",
                                        "properties": {
                                            "query": {
                                                "type": "string",
                                                "description": "The search query - what the customer is asking about"
                                            },
                                            "max_results": {
                                                "type": "integer",
                                                "description": "Maximum number of results to return (default 3)"
                                            }
                                        },
                                        "required": ["query"]
                                    }
                                }
                            }
                        ]
                    },
                    "first_message": "Hi! Welcome to IONOS support. How can I help you today?",
                    "language": "en"
                },
                "asr": {
                    "quality": "high",
                    "provider": "elevenlabs"
                },
                "tts": {
                    "model_id": "eleven_turbo_v2",
                    "voice_id": $voice_id
                },
                "turn": {
                    "mode": "turn"
                }
            },
            "platform_settings": {
                "auth": {
                    "client_public": true
                }
            }
        }')

    echo "Sending request to ElevenLabs..."

    local response=$(curl -s -X POST "$BASE_URL/convai/agents/create" \
        -H "xi-api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload")

    echo "$response" | jq '.'

    local agent_id=$(echo "$response" | jq -r '.agent_id // empty')

    if [ -n "$agent_id" ]; then
        echo -e "${GREEN}Successfully created IONOS CS Agent!${NC}"
        echo -e "${GREEN}Agent ID: $agent_id${NC}"
        echo ""
        echo "Add this to voice-assistant/backend/server.js CHARACTERS:"
        echo ""
        echo '    "ionos": {'
        echo "        id: \"$agent_id\","
        echo '        name: "IONOS Customer Service",'
        echo '        description: "IONOS cloud and hosting support agent"'
        echo '    },'
    else
        echo -e "${YELLOW}Response: $response${NC}"
    fi
}

update_agent() {
    local agent_id="$1"

    if [ -z "$agent_id" ]; then
        echo "Usage: $0 update <agent_id>"
        exit 1
    fi

    echo -e "${BLUE}Updating IONOS CS Agent ($agent_id)...${NC}"

    local payload=$(jq -n \
        --arg prompt "$IONOS_CS_PROMPT" \
        '{
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": $prompt
                    }
                }
            }
        }')

    local response=$(curl -s -X PATCH "$BASE_URL/convai/agents/$agent_id" \
        -H "xi-api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload")

    if echo "$response" | jq -e '.agent_id' > /dev/null 2>&1; then
        echo -e "${GREEN}Successfully updated IONOS CS Agent${NC}"
    else
        echo -e "${YELLOW}Response: $response${NC}"
    fi
}

case "$1" in
    create)
        create_agent
        ;;
    update)
        update_agent "$2"
        ;;
    *)
        echo "Usage: $0 <create|update [agent_id]>"
        echo ""
        echo "Commands:"
        echo "  create         - Create a new IONOS CS agent"
        echo "  update <id>    - Update existing agent prompt"
        ;;
esac
