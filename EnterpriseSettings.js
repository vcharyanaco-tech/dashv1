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
    provider: 'openrouter', // 'openrouter' | 'gemini' (override via AI_PROVIDER Script Property)
    apiKey: '',             // PLACEHOLDER - real key goes in Script Properties (OPENROUTER_API_KEY / GEMINI_API_KEY)
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
    dailySummary: {
      hour: 18,
      minute: 30
    }
  }
});