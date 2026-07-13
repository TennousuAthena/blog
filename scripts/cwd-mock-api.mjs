#!/usr/bin/env node
/**
 * Local CWD API mock for widget testing.
 * Contract: https://cwd.js.org/api/overview.html
 *
 * Usage: node scripts/cwd-mock-api.mjs
 * Default: http://127.0.0.1:8787
 */

import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.CWD_MOCK_PORT || 8787);
const HOST = process.env.CWD_MOCK_HOST || '127.0.0.1';

/** @type {Map<string, any[]>} */
const threads = new Map();
let nextId = 1;

function cors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
	res.setHeader(
		'Access-Control-Allow-Headers',
		'Content-Type, Authorization, X-CWD-Like-User',
	);
}

function send(res, status, body) {
	cors(res);
	const payload = typeof body === 'string' ? body : JSON.stringify(body);
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
	});
	res.end(payload);
}

function threadKey(siteId, postSlug) {
	return `${siteId || 'default'}::${postSlug || ''}`;
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf8');
			if (!raw) return resolve({});
			try {
				resolve(JSON.parse(raw));
			} catch (err) {
				reject(err);
			}
		});
		req.on('error', reject);
	});
}

function seedDemo() {
	const key = threadKey('mojian', 'post/using-mdx');
	if (threads.has(key)) return;
	threads.set(key, [
		{
			id: nextId++,
			author: '墨间测试',
			email: 'tester@example.com',
			url: 'https://mojian.dev',
			contentText: '本地 mock 评论：主题与日夜间切换看起来很齐。',
			contentHtml: '本地 mock 评论：主题与日夜间切换看起来很齐。',
			pubDate: new Date().toISOString(),
			postSlug: 'post/using-mdx',
			avatar: 'https://www.gravatar.com/avatar/?d=mp&s=80',
			priority: 0,
			likes: 2,
			replies: [
				{
					id: nextId++,
					author: '访客',
					email: 'guest@example.com',
					url: null,
					contentText: '收到，准备接上正式 Worker API。',
					contentHtml: '收到，准备接上正式 Worker API。',
					pubDate: new Date().toISOString(),
					postSlug: 'post/using-mdx',
					avatar: 'https://www.gravatar.com/avatar/?d=identicon&s=80',
					parentId: 1,
					replyToAuthor: '墨间测试',
					priority: 0,
					likes: 0,
				},
			],
		},
	]);
}

seedDemo();

const server = http.createServer(async (req, res) => {
	cors(res);
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		return res.end();
	}

	const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
	const path = url.pathname.replace(/\/+$/, '') || '/';

	try {
		if (req.method === 'GET' && path === '/') {
			return send(res, 200, {
				version: 'mock-0.1',
				data: 'CWD mock API ready. Docs: https://cwd.js.org',
			});
		}

		if (req.method === 'GET' && path === '/api/config/comments') {
			return send(res, 200, {
				adminEmail: '',
				adminBadge: '博主',
				avatar: 'https://www.gravatar.com/avatar',
				avatarPrefix: 'https://www.gravatar.com/avatar',
				adminEnabled: false,
				allowedDomains: [],
				requireReview: false,
				enableCommentLike: true,
				enableArticleLike: true,
				enableImageLightbox: false,
				commentPlaceholder: '说点什么吧（本地 mock）…',
				adminLanguage: 'zh-CN',
				widgetLanguage: 'zh-CN',
			});
		}

		if (req.method === 'GET' && path === '/api/comments') {
			const postSlug = url.searchParams.get('post_slug') || '';
			const siteId =
				url.searchParams.get('site_id') ||
				url.searchParams.get('siteId') ||
				'default';
			const page = Number(url.searchParams.get('page') || 1);
			const limit = Number(url.searchParams.get('limit') || 20);
			const list = threads.get(threadKey(siteId, postSlug)) || [];
			const start = (page - 1) * limit;
			const slice = list.slice(start, start + limit);
			return send(res, 200, {
				data: slice,
				pagination: {
					page,
					limit,
					total: list.length,
					totalCount: list.reduce(
						(n, c) => n + 1 + (c.replies?.length || 0),
						0,
					),
				},
			});
		}

		if (req.method === 'POST' && path === '/api/comments') {
			const body = await readBody(req);
			const postSlug = body.post_slug || '';
			const siteId = body.site_id || body.siteId || 'default';
			if (!postSlug || !body.name || !body.email || !body.content) {
				return send(res, 400, { message: '缺少必填字段' });
			}
			const key = threadKey(siteId, postSlug);
			const list = threads.get(key) || [];
			const comment = {
				id: nextId++,
				author: String(body.name).slice(0, 50),
				email: body.email,
				url: body.url || null,
				contentText: String(body.content),
				contentHtml: String(body.content)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/\n/g, '<br />'),
				pubDate: new Date().toISOString(),
				postSlug,
				avatar: 'https://www.gravatar.com/avatar/?d=mp&s=80',
				priority: 0,
				likes: 0,
				replies: [],
			};

			if (body.parent_id) {
				const parent = list.find((c) => c.id === Number(body.parent_id));
				if (parent) {
					comment.parentId = parent.id;
					comment.replyToAuthor = parent.author;
					parent.replies = parent.replies || [];
					parent.replies.push(comment);
				} else {
					list.unshift(comment);
				}
			} else {
				list.unshift(comment);
			}
			threads.set(key, list);
			return send(res, 200, { data: comment, message: 'ok' });
		}

		if (path === '/api/analytics/visit') {
			return send(res, 200, { ok: true });
		}

		if (path === '/api/analytics/pv') {
			return send(res, 200, { pv: 42, postSlug: url.searchParams.get('post_slug') });
		}

		if (path === '/api/like') {
			return send(res, 200, { liked: false, alreadyLiked: false, totalLikes: 0 });
		}

		if (path === '/api/comments/like') {
			return send(res, 200, { likes: 1 });
		}

		if (path === '/api/verify-admin') {
			return send(res, 401, { message: 'mock: admin disabled' });
		}

		return send(res, 404, { message: `Not found: ${path}` });
	} catch (err) {
		return send(res, 500, { message: err?.message || 'mock error' });
	}
});

server.listen(PORT, HOST, () => {
	console.log(`[cwd-mock] listening on http://${HOST}:${PORT}`);
});
