const KNOWLEDGE_SOURCES = [
  { path: 'README.md', title: 'README', type: 'markdown' },
  { path: 'docs/script.md', title: 'Narrative Script', type: 'markdown' },
  { path: 'docs/explaination.md', title: 'Portfolio Plan', type: 'markdown' },
  { path: 'meeting.md', title: 'Meeting Notes', type: 'markdown' },
  { path: 'feedback.md', title: 'Feedback Notes', type: 'markdown' },
  { path: 'plan.md', title: 'Implementation Plan', type: 'markdown' },
  { path: 'email.md', title: 'Project Email', type: 'markdown' },
  { path: 'data/yum/metadata.json', title: 'Yum Metadata', type: 'json' }
];

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'how', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'their', 'there', 'these', 'this', 'to', 'was', 'what', 'when',
  'where', 'which', 'who', 'why', 'with', 'you', 'your'
]);

const MAX_CHARS_PER_CHUNK = 900;
const MIN_TERM_LENGTH = 2;
let knowledgeBasePromise = null;

export function warmKnowledgeBase() {
  if (!knowledgeBasePromise) {
    knowledgeBasePromise = buildKnowledgeBase();
  }
  return knowledgeBasePromise;
}

export async function searchKnowledgeBase(query, options = {}) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    throw new Error('A search query is required.');
  }

  const index = await warmKnowledgeBase();
  const topK = Math.max(1, Math.min(8, Number(options.topK || options.top_k || 4)));
  const terms = extractQueryTerms(normalizedQuery);

  const ranked = index
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, normalizedQuery, terms)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  const results = ranked.slice(0, topK).map((chunk) => ({
    source_path: chunk.path,
    source_title: chunk.title,
    section: chunk.section,
    snippet: buildSnippet(chunk.text, terms),
    relevance: Number(chunk.score.toFixed(2))
  }));

  return {
    query,
    total_matches: ranked.length,
    results,
    summary: results.length
      ? `Found ${results.length} relevant knowledge chunks for "${query}".`
      : `No strong knowledge matches found for "${query}".`
  };
}

async function buildKnowledgeBase() {
  const results = await Promise.allSettled(KNOWLEDGE_SOURCES.map(loadKnowledgeSource));
  const documents = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (!documents.length) {
    throw new Error('No knowledge sources could be loaded.');
  }

  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => console.warn('Knowledge source skipped:', result.reason));

  return documents.flatMap(chunkDocument);
}

async function loadKnowledgeSource(source) {
  const response = await fetch(source.path);
  if (!response.ok) {
    throw new Error(`Failed to load knowledge source: ${source.path}`);
  }

  let text = '';
  if (source.type === 'json') {
    const data = await response.json();
    text = extractTextFromJson(data);
  } else {
    text = await response.text();
  }

  return {
    ...source,
    text: normalizeWhitespace(text)
  };
}

function extractTextFromJson(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }

  const lines = [];
  if (data.generated_for) lines.push(`Generated for: ${data.generated_for}`);
  if (data.description) lines.push(`Description: ${data.description}`);
  if (data.main_grain) lines.push(`Main grain: ${data.main_grain}`);
  if (data.source_method) lines.push(`Source method: ${data.source_method}`);

  if (data.datasets && typeof data.datasets === 'object') {
    lines.push('Datasets:');
    Object.entries(data.datasets).forEach(([path, meta]) => {
      const grain = meta?.grain ? `Grain: ${meta.grain}` : '';
      const description = meta?.description ? `Description: ${meta.description}` : '';
      lines.push(`${path} ${grain} ${description}`.trim());
    });
  }

  return lines.join('\n\n');
}

function chunkDocument(document) {
  const blocks = document.text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks = [];
  let currentSection = document.title;
  let currentChunk = '';

  blocks.forEach((block) => {
    const headingMatch = block.match(/^#{1,6}\s+(.+)$/m);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
    }

    const cleanBlock = block.replace(/^#{1,6}\s+/gm, '').trim();
    if (!cleanBlock) return;

    if (!currentChunk) {
      currentChunk = cleanBlock;
      return;
    }

    if ((currentChunk.length + cleanBlock.length + 2) <= MAX_CHARS_PER_CHUNK) {
      currentChunk = `${currentChunk}\n\n${cleanBlock}`;
      return;
    }

    chunks.push(createChunk(document, currentSection, currentChunk));
    currentChunk = cleanBlock;
  });

  if (currentChunk) {
    chunks.push(createChunk(document, currentSection, currentChunk));
  }

  return chunks;
}

function createChunk(document, section, text) {
  return {
    path: document.path,
    title: document.title,
    section,
    text
  };
}

function scoreChunk(chunk, normalizedQuery, terms) {
  const haystack = normalizeText(`${chunk.title} ${chunk.section} ${chunk.text}`);
  const titleText = normalizeText(chunk.title);
  const sectionText = normalizeText(chunk.section);

  let score = 0;
  if (haystack.includes(normalizedQuery)) {
    score += 18;
  }

  const matchedTerms = new Set();
  terms.forEach((term) => {
    if (!haystack.includes(term)) return;
    matchedTerms.add(term);
    score += 4;
    score += countOccurrences(haystack, term) * 1.5;
    if (titleText.includes(term)) score += 3;
    if (sectionText.includes(term)) score += 2;
  });

  if (matchedTerms.size === terms.length && terms.length > 1) {
    score += 6;
  } else {
    score += matchedTerms.size * 1.5;
  }

  return score;
}

function buildSnippet(text, terms) {
  const normalizedText = normalizeText(text);
  const firstMatch = terms.find((term) => normalizedText.includes(term));

  if (!firstMatch) {
    return truncate(text, 260);
  }

  const matchIndex = normalizedText.indexOf(firstMatch);
  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(text.length, start + 260);
  const snippet = text.slice(start, end).trim();
  return `${start > 0 ? '... ' : ''}${truncate(snippet, 260)}${end < text.length ? ' ...' : ''}`;
}

function extractQueryTerms(query) {
  return Array.from(new Set(
    query
      .split(/[^a-z0-9]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= MIN_TERM_LENGTH && !STOPWORDS.has(term))
  ));
}

function countOccurrences(text, term) {
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeText(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[`"'.,:;!?()[\]{}]/g, ' ');
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}
