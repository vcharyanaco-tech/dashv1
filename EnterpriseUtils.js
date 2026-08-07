function enterpriseFeatureEnabled_(feature) {
  var s = (ENTERPRISE_SETTINGS || {})[feature];
  return !!(s && s.enabled);
}

/* Central non-secret configuration reader. Script Properties override the
   static ENTERPRISE_SETTINGS defaults. Returns booleans/config only — the
   caller decides whether to surface workerToken presence, never its value. */
function getEnterpriseConfig_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var s = ENTERPRISE_SETTINGS || {};
  return {
    enabled: props.ENTERPRISE_ENABLED === 'true',
    workerUrl: props.WORKER_API_URL || '',
    workerToken: props.WORKER_API_TOKEN || '',
    aiEnabled: props.AI_INSIGHTS_ENABLED === 'true' || ((s.AI_INSIGHTS || {}).enabled === true),
    whatsappEnabled: props.WHATSAPP_ENABLED === 'true' || ((s.WHATSAPP || {}).enabled === true),
    pwaEnabled: props.PWA_ENABLED === 'true' || ((s.PWA || {}).enabled === true),
    calendarEnabled: props.CALENDAR_ENABLED === 'true' || ((s.CALENDAR || {}).enabled === true),
    offlineStrictAuth: props.OFFLINE_STRICT_AUTH === 'true',
    timezone: props.TIMEZONE || 'Asia/Kolkata',
    aiModel: props.GEMINI_MODEL || ((s.AI_INSIGHTS || {}).model) || 'gemini-2.0-flash'
  };
}

function icsEscapeText_(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function icsFormatDate_(date) {
  var d = date instanceof Date ? date : new Date(date);
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + 'T' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
}

function icsFormatDateOnly_(date) {
  var d = date instanceof Date ? date : new Date(date);
  function two(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate());
}