/**
 * /blog/<slug>.md — 与 HTML 博文同步，构建时从 Content Collections 自动导出。
 */
import { blogMarkdownGET, blogMarkdownStaticPaths, prerender } from '../../lib/llm';

export { prerender };
export const getStaticPaths = blogMarkdownStaticPaths('zh');
export const GET = blogMarkdownGET;
