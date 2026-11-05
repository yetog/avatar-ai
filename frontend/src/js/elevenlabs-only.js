// Only export ElevenLabs SDK for use in inline scripts
import { Conversation } from '@elevenlabs/client';

// Expose to window for inline script access
window.ElevenLabsConversation = Conversation;
