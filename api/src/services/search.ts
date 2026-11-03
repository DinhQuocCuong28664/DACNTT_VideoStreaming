/**
 * Atlas Search (§5.9). Three indexes, the free-tier maximum. The video analyzer maps the
 * Vietnamese letter d with stroke to d (Unicode folding leaves it alone), then lowercases and
 * folds diacritics, so "nhac" finds "nhạc" and "do" finds "đỏ".
 */
import type { Db, Document } from 'mongodb';

const FOLD_ANALYZER = {
  name: 'vi_folding',
  charFilters: [{ type: 'mapping', mappings: { 'đ': 'd', 'Đ': 'D' } }],
  tokenizer: { type: 'standard' },
  tokenFilters: [{ type: 'lowercase' }, { type: 'icuFolding' }],
};

export const SEARCH_INDEXES: { collection: string; name: string; definition: Document }[] = [
  {
    collection: 'videos',
    name: 'videos_search',
    definition: {
      analyzer: 'vi_folding',
      searchAnalyzer: 'vi_folding',
      analyzers: [FOLD_ANALYZER],
      mappings: {
        dynamic: false,
        fields: {
          title: [{ type: 'string', analyzer: 'vi_folding' }, { type: 'autocomplete', tokenization: 'edgeGram', minGrams: 2, maxGrams: 15, foldDiacritics: true }],
          description: { type: 'string', analyzer: 'vi_folding' },
          tags: { type: 'string', analyzer: 'vi_folding' },
          channelName: { type: 'string', analyzer: 'vi_folding' },
          visibility: { type: 'token' },
          status: { type: 'token' },
          audience: { type: 'token' },
          moderation: { type: 'document', fields: { status: { type: 'token' } } },
          processedAt: { type: 'date' },
        },
      },
    },
  },
  {
    collection: 'users',
    name: 'channels_search',
    definition: {
      analyzer: 'vi_folding', searchAnalyzer: 'vi_folding', analyzers: [FOLD_ANALYZER],
      mappings: { dynamic: false, fields: { displayName: { type: 'string', analyzer: 'vi_folding' }, handle: { type: 'string', analyzer: 'lucene.keyword' }, disabled: { type: 'boolean' } } },
    },
  },
  {
    collection: 'playlists',
    name: 'playlists_search',
    definition: {
      analyzer: 'vi_folding', searchAnalyzer: 'vi_folding', analyzers: [FOLD_ANALYZER],
      mappings: { dynamic: false, fields: { title: { type: 'string', analyzer: 'vi_folding' }, visibility: { type: 'token' } } },
    },
  },
];

/** Creates missing search indexes; Atlas builds them in the background. */
export async function ensureSearchIndexes(db: Db): Promise<string[]> {
  const created: string[] = [];
  for (const idx of SEARCH_INDEXES) {
    const existing = await db.collection(idx.collection).listSearchIndexes(idx.name).toArray();
    if (existing.length === 0) {
      await db.collection(idx.collection).createSearchIndex({ name: idx.name, definition: idx.definition });
      created.push(idx.name);
    }
  }
  return created;
}

export interface SearchHit { id: string; score: number }
export interface Search {
  videos(q: string, opts: { skip: number; limit: number; category?: string }): Promise<SearchHit[]>;
  suggest(q: string, limit: number): Promise<string[]>;
  channels(q: string, limit: number): Promise<string[]>;
}

/** Only these videos may ever appear in results. */
const PUBLIC_FILTER = [
  { equals: { path: 'status', value: 'READY' } },
  { equals: { path: 'visibility', value: 'public' } },
  { equals: { path: 'moderation.status', value: 'approved' } },
];

export function atlasSearch(db: Db): Search {
  return {
    async videos(q, { skip, limit, category }) {
      const rows = await db.collection('videos').aggregate<{ _id: unknown; score: number }>([
        {
          $search: {
            index: 'videos_search',
            compound: {
              must: [{ text: { query: q, path: ['title', 'description', 'tags', 'channelName'], fuzzy: { maxEdits: 1, prefixLength: 1 } } }],
              should: [{ text: { query: q, path: 'title', score: { boost: { value: 3 } } } }],
              filter: PUBLIC_FILTER,
            },
          },
        },
        ...(category ? [{ $match: { category } }] : []),
        { $skip: skip },
        { $limit: limit },
        { $project: { _id: 1, score: { $meta: 'searchScore' } } },
      ]).toArray();
      return rows.map((r) => ({ id: String(r._id), score: r.score }));
    },
    async suggest(q, limit) {
      const rows = await db.collection('videos').aggregate<{ title: string }>([
        { $search: { index: 'videos_search', compound: { must: [{ autocomplete: { query: q, path: 'title', fuzzy: { maxEdits: 1, prefixLength: 1 } } }], filter: PUBLIC_FILTER } } },
        { $limit: limit * 2 },
        { $project: { _id: 0, title: 1 } },
      ]).toArray();
      return [...new Set(rows.map((r) => r.title))].slice(0, limit);
    },
    async channels(q, limit) {
      const rows = await db.collection('users').aggregate<{ _id: unknown }>([
        { $search: { index: 'channels_search', compound: { should: [{ text: { query: q, path: 'displayName', fuzzy: { maxEdits: 1 } } }, { text: { query: q.replace(/^@/, '').toLowerCase(), path: 'handle' } }], minimumShouldMatch: 1, filter: [{ equals: { path: 'disabled', value: false } }] } } },
        { $limit: limit },
        { $project: { _id: 1 } },
      ]).toArray();
      return rows.map((r) => String(r._id));
    },
  };
}
