#!/bin/bash
# ElevenLabs Agent CLI
# Usage: ./elevenlabs-cli.sh <command> [args]

API_KEY="${ELEVEN_LABS_API_KEY:-sk_412a0bc11cce389bae84d76203ad1ef156cd2651f9161352}"
BASE_URL="https://api.elevenlabs.io/v1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo -e "${BLUE}ElevenLabs Agent CLI${NC}"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  voices              List all available voices"
    echo "  voices search <q>   Search voices by name"
    echo "  agents              List all agents"
    echo "  agent <id>          Get agent details"
    echo "  create              Create new agent (interactive)"
    echo "  create-quick <name> <voice_id> <prompt>  Quick create agent"
    echo "  delete <id>         Delete an agent"
    echo ""
    echo "Examples:"
    echo "  $0 voices"
    echo "  $0 voices search rachel"
    echo "  $0 agents"
    echo "  $0 create-quick 'Luna' '21m00Tcm4TlvDq8ikWAM' 'You are Luna, a friendly AI companion'"
    echo ""
}

# List voices
list_voices() {
    echo -e "${BLUE}Fetching voices...${NC}"
    curl -s -X GET "$BASE_URL/voices" \
        -H "xi-api-key: $API_KEY" | \
    jq -r '.voices[] | "\(.voice_id)\t\(.name)\t\(.labels.accent // "N/A")\t\(.labels.gender // "N/A")"' | \
    column -t -s $'\t' | head -50
}

# Search voices
search_voices() {
    local query="$1"
    echo -e "${BLUE}Searching for '$query'...${NC}"
    curl -s -X GET "$BASE_URL/voices" \
        -H "xi-api-key: $API_KEY" | \
    jq -r --arg q "$query" '.voices[] | select(.name | test($q; "i")) | "\(.voice_id)\t\(.name)\t\(.labels.accent // "N/A")\t\(.labels.gender // "N/A")\t\(.labels.description // "N/A")"' | \
    column -t -s $'\t'
}

# List agents
list_agents() {
    echo -e "${BLUE}Fetching agents...${NC}"
    curl -s -X GET "$BASE_URL/convai/agents" \
        -H "xi-api-key: $API_KEY" | \
    jq -r '.agents[] | "\(.agent_id)\t\(.name)\t\(.conversation_config.tts.voice_id // "default")"' | \
    column -t -s $'\t'
}

# Get agent details
get_agent() {
    local agent_id="$1"
    echo -e "${BLUE}Fetching agent $agent_id...${NC}"
    curl -s -X GET "$BASE_URL/convai/agents/$agent_id" \
        -H "xi-api-key: $API_KEY" | jq .
}

# Create agent (quick)
create_agent_quick() {
    local name="$1"
    local voice_id="$2"
    local prompt="$3"
    local first_message="${4:-Hello! How can I help you today?}"

    echo -e "${BLUE}Creating agent '$name'...${NC}"

    local response=$(curl -s -X POST "$BASE_URL/convai/agents/create" \
        -H "xi-api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$name\",
            \"conversation_config\": {
                \"agent\": {
                    \"prompt\": {
                        \"prompt\": \"$prompt\",
                        \"llm\": \"gpt-4o-mini\"
                    },
                    \"first_message\": \"$first_message\",
                    \"language\": \"en\"
                },
                \"tts\": {
                    \"voice_id\": \"$voice_id\"
                }
            }
        }")

    local agent_id=$(echo "$response" | jq -r '.agent_id // empty')

    if [ -n "$agent_id" ]; then
        echo -e "${GREEN}Agent created successfully!${NC}"
        echo -e "Agent ID: ${YELLOW}$agent_id${NC}"
        echo ""
        echo "WebSocket URL:"
        echo "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=$agent_id"
        echo ""
        echo "To use in Avatar AI, update AGENT_ID in websocket-test.html"
    else
        echo -e "${RED}Failed to create agent${NC}"
        echo "$response" | jq .
    fi
}

# Interactive create
create_agent_interactive() {
    echo -e "${BLUE}Create New ElevenLabs Agent${NC}"
    echo ""

    read -p "Agent name: " name
    read -p "Voice ID (run 'voices' to list): " voice_id
    read -p "System prompt: " prompt
    read -p "First message [Hello!]: " first_message
    first_message="${first_message:-Hello!}"

    create_agent_quick "$name" "$voice_id" "$prompt" "$first_message"
}

# Delete agent
delete_agent() {
    local agent_id="$1"
    echo -e "${YELLOW}Deleting agent $agent_id...${NC}"
    read -p "Are you sure? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        curl -s -X DELETE "$BASE_URL/convai/agents/$agent_id" \
            -H "xi-api-key: $API_KEY"
        echo -e "${GREEN}Agent deleted${NC}"
    else
        echo "Cancelled"
    fi
}

# Main
case "$1" in
    voices)
        if [ -n "$2" ] && [ "$2" = "search" ]; then
            search_voices "$3"
        else
            list_voices
        fi
        ;;
    agents)
        list_agents
        ;;
    agent)
        get_agent "$2"
        ;;
    create)
        create_agent_interactive
        ;;
    create-quick)
        create_agent_quick "$2" "$3" "$4" "$5"
        ;;
    delete)
        delete_agent "$2"
        ;;
    *)
        usage
        ;;
esac
