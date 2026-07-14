/**
 * 构建后校验：llms.txt 与各博文 .md 已随静态站点生成。
 * 由 npm run build 自动调用，失败则中断发布。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

async function exists(file) {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

async function listMd(dir) {
	try {
		const entries = await readdir(dir);
		return entries.filter((name) => name.endsWith('.md')).map((name) => path.join(dir, name));
	} catch {
		return [];
	}
}

const llmsPath = path.join(dist, 'llms.txt');
if (!(await exists(llmsPath))) {
	console.error('[verify-llm] missing dist/llms.txt');
	process.exit(1);
}

const llms = await readFile(llmsPath, 'utf8');
if (!llms.startsWith('# ') || !llms.includes('## Posts')) {
	console.error('[verify-llm] dist/llms.txt looks invalid');
	process.exit(1);
}

const zhMd = await listMd(path.join(dist, 'blog'));
const enMd = await listMd(path.join(dist, 'en', 'blog'));

if (zhMd.length === 0) {
	console.error('[verify-llm] no dist/blog/*.md generated');
	process.exit(1);
}

// llms.txt 中的每个 .md 链接都应落在 dist 内
const mdLinks = [...llms.matchAll(/\]\((https?:\/\/[^)]+\.md)\)/g)].map((m) => m[1]);
for (const href of mdLinks) {
	const pathname = new URL(href).pathname;
	const file = path.join(dist, pathname.replace(/^\//, ''));
	if (!(await exists(file))) {
		console.error(`[verify-llm] llms.txt links to missing file: ${pathname}`);
		process.exit(1);
	}
}

console.log(
	`[verify-llm] ok — llms.txt + ${zhMd.length} zh md + ${enMd.length} en md (build-time)`,
);
