export type Priority = 'high' | 'medium' | 'low';

export interface ParsedEntry {
  raw: string;
  body: string;
  tags: string[];
  priority: Priority | null;
  dates: string[];
  times: string[];
}

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const ORDINAL = '\\d{1,2}(?:st|nd|rd|th)?';

// Control phrases
const SEP = '[\\s,.:;!?-]+';
const JOURNAL = '(?:journals?|general|journey|jernal|jurnal|journel|chernel|journo|colonel|kernel)';
const WAKE_NOTE = '(?:notes?|node|no|knot|now|mode)';
const CMD_NOTE = '(?:notes?|node)';

export const WAKE_RE = new RegExp(
  `\\b(?:(?:hey|hi|hay|hello|ok(?:ay)?)${SEP})?${JOURNAL}${SEP}(?:start(?:ed|s)?|star|begin|new|open)${SEP}(?:a\\s+)?(?:new\\s+)?${WAKE_NOTE}\\b`,
  'i',
);
export const STOP_RE = new RegExp(
  `\\b(?:save|saved|safe|finish|end|stop)${SEP}(?:the\\s+|this\\s+)?${CMD_NOTE}\\b`,
  'i',
);
export const CANCEL_RE = new RegExp(
  `\\b(?:cancel|cancelled|discard)${SEP}(?:the\\s+|this\\s+)?${CMD_NOTE}\\b`,
  'i',
);

// Metadata commands
const TAG_CMD_RE = /\b(?:hash\s?tag|tag(?:ged)?(?:\s+it)?\s+as)[\s,.:;-]+([a-z0-9][\w-]*)/gi;
const HASHTAG_RE = /#([a-z0-9][\w-]*)/gi;
const PRIORITY_RE =
  /\b(?:priority[\s,.:;-]+(high|medium|low)|(high|medium|low)\s+priority|mark(?:ed)?(?:\s+it)?\s+as[\s,.:;-]+(urgent|important))\b/gi;

// Temporal expressions
const DATE_RE = new RegExp(
  [
    '\\b(?:today|tonight|tomorrow|yesterday)\\b',
    `\\b(?:next|this|last)\\s+(?:week|month|year|${WEEKDAY})\\b`,
    `\\b(?:on\\s+)?${WEEKDAY}\\b`,
    `\\b${MONTH}\\.?\\s+${ORDINAL}(?:,?\\s+\\d{4})?\\b`,
    `\\b${ORDINAL}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+\\d{4})?\\b`,
    '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    '\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b',
  ].join('|'),
  'gi',
);
const TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\b(?:noon|midnight)\b/gi;

const unique = (xs: string[]) => [...new Set(xs)];

function normalizePriority(word: string): Priority {
  const w = word.toLowerCase();
  return w === 'urgent' || w === 'important' ? 'high' : (w as Priority);
}

function tidy(text: string): string {
  const t = text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?:\s*[,.!?;:])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:!?-]+|[\s,;:-]+$/g, '')
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function parseEntry(raw: string): ParsedEntry {
  const tags: string[] = [];
  let priority: Priority | null = null;

  let body = raw
    .replace(WAKE_RE, ' ')
    .replace(STOP_RE, ' ')
    .replace(TAG_CMD_RE, (_, tag: string) => {
      tags.push(tag.toLowerCase());
      return ' ';
    })
    .replace(HASHTAG_RE, (_, tag: string) => {
      tags.push(tag.toLowerCase());
      return ' ';
    })
    .replace(PRIORITY_RE, (_, a?: string, b?: string, c?: string) => {
      priority = normalizePriority((a ?? b ?? c)!);
      return ' ';
    });

  body = tidy(body);

  return {
    raw: raw.trim(),
    body,
    tags: unique(tags),
    priority,
    dates: unique((body.match(DATE_RE) ?? []).map((d) => d.trim().toLowerCase())),
    times: unique((body.match(TIME_RE) ?? []).map((t) => t.trim().toLowerCase())),
  };
}

export function isValidEntry(entry: ParsedEntry): boolean {
  return /[a-z0-9]/i.test(entry.body);
}
