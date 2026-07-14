/**
 * /en/blog/<slug>.md — 与英文 HTML 博文同步，构建时自动导出。
 */
import { blogMarkdownGET, blogMarkdownStaticPaths, prerender } from '../../../lib/llm';

export { prerender };
export const getStaticPaths = blogMarkdownStaticPaths('en');
export const GET = blogMarkdownGET;
