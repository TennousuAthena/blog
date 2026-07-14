import { describe, it, expect, vi } from 'vitest';
import { getStats } from './getStats';

describe('getStats siteId filtering behavior', () => {
	const createMockContext = (rows: any[], siteId?: string) => {
		const allMock = vi.fn().mockResolvedValue({ results: rows });
		const prepareMock = vi.fn().mockReturnValue({
			all: allMock
		});

		const c = {
			req: {
				query: (key: string) => {
					if (key === 'siteId') return siteId;
					return undefined;
				}
			},
			env: {
				CWD_DB: {
					prepare: prepareMock
				}
			},
			json: vi.fn()
		} as any;

		return { c, prepareMock, allMock };
	};

	it('returns global domains while summary is filtered by siteId', async () => {
		const now = Date.now();
		const baseDay = new Date(now);
		baseDay.setUTCHours(0, 0, 0, 0);
		const today = baseDay.getTime();

		const rows = [
			{
				created: today,
				status: 'approved',
				site_id: 'blog'
			},
			{
				created: today,
				status: 'pending',
				site_id: 'docs'
			},
			{
				created: today,
				status: 'rejected',
				site_id: ''
			}
		];

		const { c } = createMockContext(rows, 'blog');

		await getStats(c);

		expect(c.json).toHaveBeenCalledTimes(1);
		const response = (c.json as any).mock.calls[0][0];

		expect(response.summary).toEqual({
			total: 1,
			approved: 1,
			pending: 0,
			rejected: 0
		});

		expect(response.domains).toEqual([
			{
				domain: 'blog',
				total: 1,
				approved: 1,
				pending: 0,
				rejected: 0
			},
			{
				domain: 'docs',
				total: 1,
				approved: 0,
				pending: 1,
				rejected: 0
			},
			{
				domain: 'default',
				total: 1,
				approved: 0,
				pending: 0,
				rejected: 1
			}
		]);
	});
});

