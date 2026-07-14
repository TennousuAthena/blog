import type { Client } from '@notionhq/client';
import type { BlockObjectResponse, DataSourceObjectResponse, PageObjectResponse } from '@notionhq/client';

/** A page-shaped object for tests. */
export interface FakePageInput {
  id: string;
  name: string;
  slug: string;
  description: string;
  lang: 'zh' | 'en';
  pubStart: string;
  tags?: string[];
  featured?: boolean;
  translationKey?: string;
  coverUrl?: string;
  blocks?: BlockObjectResponse[];
}

export function makePage(input: FakePageInput): PageObjectResponse {
  const props: Record<string, unknown> = {
    Name: { id: 't', type: 'title', title: [{ plain_text: input.name }] },
    Slug: { id: 'r', type: 'rich_text', rich_text: [{ plain_text: input.slug }] },
    Description: { id: 'd', type: 'rich_text', rich_text: [{ plain_text: input.description }] },
    'Publish Date': { id: 'p', type: 'date', date: { start: input.pubStart, end: null, time_zone: null } },
    Tags: { id: 'g', type: 'multi_select', multi_select: (input.tags ?? []).map((t) => ({ id: 'x', name: t, color: 'default' })) },
    Language: { id: 'l', type: 'select', select: { id: 'x', name: input.lang, color: 'default' } },
    Featured: { id: 'f', type: 'checkbox', checkbox: input.featured ?? false },
    'Translation Key': { id: 'k', type: 'rich_text', rich_text: input.translationKey ? [{ plain_text: input.translationKey }] : [] },
  };
  const page = {
    object: 'page',
    id: input.id,
    created_time: input.pubStart,
    last_edited_time: input.pubStart,
    archived: false,
    in_trash: false,
    url: `https://notion.so/${input.id}`,
    parent: { type: 'data_source_id' as const, data_source_id: 'ds' },
    properties: props,
    cover: input.coverUrl
      ? { type: 'external' as const, external: { url: input.coverUrl } }
      : null,
  };
  return page as unknown as PageObjectResponse;
}

export function makeDataSource(overrides: Record<string, unknown> = {}): DataSourceObjectResponse {
  const base: Record<string, unknown> = {
    Name: { id: 't', name: 'Name', type: 'title', title: {} },
    Slug: { id: 'r', name: 'Slug', type: 'rich_text', rich_text: {} },
    Status: {
      id: 's',
      name: 'Status',
      type: 'status',
      status: { options: [{ id: '1', name: 'Published', color: 'default', description: null }], groups: [] },
    },
    Description: { id: 'd', name: 'Description', type: 'rich_text', rich_text: {} },
    'Publish Date': { id: 'p', name: 'Publish Date', type: 'date', date: {} },
    Tags: { id: 'g', name: 'Tags', type: 'multi_select', multi_select: { options: [] } },
    Language: {
      id: 'l',
      name: 'Language',
      type: 'select',
      select: { options: [{ id: 'z', name: 'zh', color: 'default', description: null }, { id: 'e', name: 'en', color: 'default', description: null }] },
    },
    Featured: { id: 'f', name: 'Featured', type: 'checkbox', checkbox: {} },
    'Translation Key': { id: 'k', name: 'Translation Key', type: 'rich_text', rich_text: {} },
  };
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return {
    object: 'data_source',
    id: 'ds',
    title: [],
    description: null,
    parent: { type: 'database_id' as const, database_id: 'db' },
    database_parent: { type: 'database_id' as const, database_id: 'db' },
    url: 'https://notion.so/ds',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-01T00:00:00.000Z',
    archived: false,
    in_trash: false,
    icon: null,
    cover: null,
    properties: base,
  } as unknown as DataSourceObjectResponse;
}

export interface FakeClientOptions {
  dataSource?: DataSourceObjectResponse;
  pages: PageObjectResponse[]
  blockMap?: Record<string, BlockObjectResponse[]>;
  queryFailures?: number;
}

export function makeFakeClient(opts: FakeClientOptions): Client {
  const pages = opts.pages as unknown as PageObjectResponse[];
  const blockMap = opts.blockMap ?? {};
  const client = {
    dataSources: {
      retrieve: async () => opts.dataSource ?? makeDataSource(),
      query: async () => {
        return {
          object: 'list',
          results: pages as unknown[],
          next_cursor: null,
          has_more: false,
          request_status: { type: 'complete' },
        };
      },
    },
    blocks: {
      children: {
        list: async (args: { block_id: string }) => {
          return {
            object: 'list',
            results: (blockMap[args.block_id] ?? []) as unknown[],
            next_cursor: null,
            has_more: false,
          };
        },
      },
    },
  };
  return client as unknown as Client;
}

export function paragraphBlock(id: string, text: string): BlockObjectResponse {
  return {
    object: 'block',
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text, link: null }, annotations: {}, plain_text: text }] },
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
  } as unknown as BlockObjectResponse;
}

export function headingBlock(id: string, text: string): BlockObjectResponse {
  return {
    object: 'block',
    id,
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text, link: null }, annotations: {}, plain_text: text }], is_toggleable: false },
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
  } as unknown as BlockObjectResponse;
}

export function codeBlock(id: string, code: string, language = 'ts'): BlockObjectResponse {
  return {
    object: 'block',
    id,
    type: 'code',
    code: { rich_text: [{ type: 'text', text: { content: code, link: null }, annotations: {}, plain_text: code }], language, caption: [] },
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
  } as unknown as BlockObjectResponse;
}

export function equationBlock(id: string, expr: string): BlockObjectResponse {
  return {
    object: 'block',
    id,
    type: 'equation',
    equation: { expression: expr },
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
  } as unknown as BlockObjectResponse;
}

export function listBlock(id: string, text: string, type: 'bulleted_list_item' | 'numbered_list_item' | 'to_do' = 'bulleted_list_item', checked = false): BlockObjectResponse {
  const inner = { rich_text: [{ type: 'text', text: { content: text, link: null }, annotations: {}, plain_text: text }] };
  const obj: Record<string, unknown> = { object: 'block', id, type, created_time: '', last_edited_time: '', has_children: false, archived: false, in_trash: false };
  if (type === 'to_do') obj.to_do = { ...inner, checked };
  else obj[type] = inner;
  return obj as unknown as BlockObjectResponse;
}

export function imageBlock(id: string, url: string): BlockObjectResponse {
  return {
    object: 'block',
    id,
    type: 'image',
    image: { type: 'external', external: { url }, caption: [] },
    created_time: '',
    last_edited_time: '',
    has_children: false,
    archived: false,
    in_trash: false,
  } as unknown as BlockObjectResponse;
}
