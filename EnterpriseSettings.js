var ENTERPRISE_SETTINGS = Object.freeze({
  PWA: {
    enabled: true,
    cacheBuster: '2026.08.07'
  },
  WHATSAPP: {
    enabled: false,
    apiBaseUrl: 'https://graph.facebook.com/v20.0', // Meta WhatsApp Cloud API
    apiToken: '',           // PLACEHOLDER - never commit real credentials
    phoneNumberId: '',      // PLACEHOLDER
    senderNumber: '',       // PLACEHOLDER
    templateName: ''        // PLACEHOLDER - set only when using an approved template
  },
  CALENDAR: {
    enabled: false,
    outputSheetName: 'ICS_EXPORT'
  },
  FATHOM: {
    enabled: true,
    apiBaseUrl: 'https://api.fathom.ai/external/v1',
    apiKey: '',             // PLACEHOLDER - real key goes in Script Properties (FATHOM_API_KEY)
    maxMeetings: 20         // how many recent meetings to list when pulling notes
  },
  AI_INSIGHTS: {
    enabled: true,
    provider: 'groq',       // 'groq' | 'huggingface' | 'openrouter' | 'gemini' | 'kilo' (override via AI_PROVIDER Script Property)
    apiKey: '',             // PLACEHOLDER - real key goes in Script Properties (GROQ_API_KEY / HUGGINGFACE_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY / KILO_API_KEY)
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    kiloFallback: true,     // if the primary provider fails, retry via Kilo Gateway free tier (keyless; disable via AI_KILO_FALLBACK=false)
    dailySummary: {
      hour: 18,
      minute: 30
    }
  }
});