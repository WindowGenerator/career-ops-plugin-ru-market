// Self-contained: the HH companion imports this file from scripts/ru-market/lib/.
// Text from job boards is data. Normalise it and flag instruction-like patterns;
// flagged text is kept, never dropped.
export const LIMITS = { title: 300, company: 200, location: 300, note: 1000, description: 20000, item: 200 };

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const BIDI = /[\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
const TAGS = /[\u{e0000}-\u{e007f}]/u;
const INVISIBLE = /[\u{00ad}\u{034f}\u{061c}\u{180e}\u{200b}-\u{200f}\u{2060}-\u{2064}\u{206a}-\u{206f}\u{fe00}-\u{fe0f}\u{feff}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{e0000}-\u{e01ef}]/gu;
const CONTROL = /[\u{0000}-\u{0008}\u{000b}\u{000c}\u{000e}-\u{001f}\u{007f}-\u{009f}]/gu;

const PATTERNS = [
  ['ignore-previous', /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|preceding|all|any|your|these|the)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|directions?|guidelines?|context)\b/],
  ['ignore-previous-ru', /(?:игнорируй|игнорировать|игнорируйте|забудь|забудьте|отмени|отмените|не\s+учитывай|не\s+учитывайте|пренебреги)[^.\n]{0,40}(?:предыдущ|прежн|выше|ранее|все(?!\p{L})|всё(?!\p{L})|любые|свои|эти|вышеуказанн)[^.\n]{0,40}(?:инструкци|указани|правил|промпт|команд|ограничени)/],
  ['role-marker', /(?:^|[\n\r>\]]|[.!?]\s)\s*(?:system|assistant|developer|human)\s*:\s*(?:you|your|ignore|disregard|forget|from now|always|never|do not|don't|respond|reply|answer|output|reveal|follow|new|the user)/m],
  ['role-marker-ru', /(?:^|[\n\r>\]]|[.!?]\s)\s*(?:системное\s+сообщение|системный\s+промпт|системная\s+инструкция|ассистент)\s*:/m],
  ['chat-template', /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?inst\]|<<\/?sys>>|<\/?(?:system|assistant|human)>|^#{1,3}\s*(?:system|instructions?)\s*$/m],
  ['new-instructions', /\b(?:new|updated|additional|revised)\s+(?:system\s+)?instructions?\s*:|(?:новые|дополнительные|обновл[её]нные)\s+инструкции\s*:/],
  ['role-reassign', /\byou\s+are\s+now\s+(?:a|an|in|the|no longer)\b|\bfrom\s+now\s+on,?\s+you\b|\bact\s+as\s+(?:an?\s+)?(?:unrestricted|system|admin|developer)\b|\bdeveloper\s+mode\b|(?:^|\s)(?:теперь\s+ты|ты\s+теперь|с\s+этого\s+момента\s+ты)\s/],
  ['ai-addressed', /\b(?:attention|note\s+to|message\s+for|instructions?\s+for|attn)[,:]?\s+(?:the\s+)?(?:ai|llm|assistant|language\s+model|model|agent|chatgpt|claude|gpt)\b|\bif\s+you\s+are\s+(?:an?\s+)?(?:ai|llm|language\s+model|assistant|chatbot)\b|(?:внимание|обращение|инструкция|сообщение|привет)[,:]?\s+(?:для|к)\s+(?:ии|ai|нейросет\p{L}*|ассистент\p{L}*|модел\p{L}*|агент\p{L}*)|если\s+ты\s+(?:ии|ai|нейросеть|языковая\s+модель|ассистент)/u],
  ['tool-call', /<\/?(?:tool_call|tool_use|function_calls?|invoke)\b|\bantml:|\b(?:you\s+must|now|then|please)\s+(?:call|invoke|run|execute|use)\s+(?:the\s+)?(?:\w+\s+)?(?:tool|function|command|bash|shell|curl|wget|webfetch|playwright)\b|(?:вызови|выполни|запусти)\s+(?:\p{L}+\s+)?(?:инструмент|функци\p{L}*|команд\p{L}*|bash|curl|wget)/u],
  ['secret-exfiltration', /\b(?:send|post|upload|email|forward|exfiltrate|leak|reveal|print|show)\b[^.\n]{0,40}\b(?:api[ _-]?keys?|secrets?|credentials|passwords?|access\s+tokens?|\.env|system\s+prompt|hidden\s+instructions?)\b|(?:отправь|пришли|передай|покажи|выведи|раскрой)[^.\n]{0,40}(?:api[ _-]?ключ\p{L}*|ключ\p{L}*|парол\p{L}*|секрет\p{L}*|токен\p{L}*|системн\p{L}*\s+(?:промпт|инструкци\p{L}*))/u],
  ['score-manipulation', /\b(?:rate|score|rank|mark|evaluate|recommend)\b[^.\n]{0,30}\b(?:this|the)\b[^.\n]{0,20}\b(?:job|vacancy|posting|offer|role|candidate)\b[^.\n]{0,40}(?:10\s*\/\s*10|5\s*\/\s*5|highest|perfect|top\s+match|maximum|strong\s+match)|(?:оцени|поставь|отметь|выстави)[^.\n]{0,30}(?:вакансию|её|эту)[^.\n]{0,40}(?:максимальн\p{L}*|10\s*\/\s*10|5\s*\/\s*5|высш\p{L}*|идеальн\p{L}*)/u],
  ['conceal', /\b(?:do\s+not|don'?t|never)\s+(?:tell|mention|reveal|inform|show)\b[^.\n]{0,30}\b(?:the\s+)?(?:user|human|candidate|applicant)\b|не\s+(?:сообщай|говори|упоминай|показывай)\s+(?:об\s+этом\s+)?(?:пользовател\p{L}*|человеку|кандидату)/u],
];

export function detect(text) {
  const folded = String(text ?? '').normalize('NFKC').toLowerCase();
  const flags = PATTERNS.filter(([, pattern]) => pattern.test(folded)).map(([id]) => id);
  if (BIDI.test(text)) flags.push('bidi-control');
  if (TAGS.test(text)) flags.push('hidden-tag-chars');
  return flags;
}

export const limit = (text, field = 'description') => {
  const max = LIMITS[field] ?? LIMITS.item;
  return text.length > max ? [...text].slice(0, max).join('') : text;
};

// Detection runs before comments and invisible characters are removed, so hidden text is flagged.
export function untrusted(value, field = 'description') {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  const flags = detect(raw);
  const text = limit(raw.replace(HTML_COMMENT, ' ').replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/[\u{2028}-\u{2029}]/gu, ' '), field);
  return { text, flags };
}
