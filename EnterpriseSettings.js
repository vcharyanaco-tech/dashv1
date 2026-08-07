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
  AI_INSIGHTS: {
    enabled: true,
    provider: 'groq',       // 'groq' | 'openrouter' | 'gemini' (override via AI_PROVIDER Script Property)
    apiKey: '',             // PLACEHOLDER - real key goes in Script Properties (GROQ_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY)
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    dailySummary: {
      hour: 18,
      minute: 30
    }
  }
});