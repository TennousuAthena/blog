import { describe, expect, it } from 'vitest';
import { assertValidEmotionJsonUrl, loadFeatureSettings, saveFeatureSettings } from './featureSettings';

type SettingRow = {
	key: string;
	value: string;
};

/**
 * 创建一个只覆盖 Settings 表读写行为的 D1 mock。
 *
 * @returns 带有内存存储的 mock env
 */
function createMockEnv() {
	const settings = new Map<string, string>();

	const db = {
		prepare(sql: string) {
			return {
				bind(...args: string[]) {
					return {
						async all<T extends SettingRow>() {
							const keys = args;
							const results = keys
								.filter((key) => settings.has(key))
								.map((key) => ({ key, value: settings.get(key) })) as T[];

							return { results };
						},
						async run() {
							if (sql.startsWith('REPLACE INTO Settings')) {
								settings.set(args[0], args[1]);
							}

							return { success: true };
						},
					};
				},
				async run() {
					return { success: true };
				},
			};
		},
	};

	return {
		env: {
			CWD_DB: db,
		} as any,
		settings,
	};
}

describe('featureSettings emotionJson', () => {
	it('returns empty emotion JSON when no value is saved', async () => {
		const { env } = createMockEnv();

		const settings = await loadFeatureSettings(env);

		expect(settings.emotionJson).toBe('');
	});

	it('saves and loads custom emotion JSON URL', async () => {
		const { env } = createMockEnv();
		const emotionJson = 'https://cdn.example.com/emotion/OwO.json';

		await saveFeatureSettings(env, { emotionJson });
		const settings = await loadFeatureSettings(env);

		expect(settings.emotionJson).toBe(emotionJson);
	});

	it('saves and loads site-relative emotion JSON URL', async () => {
		const { env } = createMockEnv();
		const emotionJson = '/emotion/OwO.json';

		await saveFeatureSettings(env, { emotionJson });
		const settings = await loadFeatureSettings(env);

		expect(settings.emotionJson).toBe(emotionJson);
	});

	it('rejects inline emotion JSON text', () => {
		expect(() => assertValidEmotionJsonUrl('{"颜文字":{"container":[]}}')).toThrow('表情 JSON 链接格式不正确');
	});

	it('rejects non-json emotion URLs', () => {
		expect(() => assertValidEmotionJsonUrl('javascript:alert(1)')).toThrow('表情 JSON 链接格式不正确');
		expect(() => assertValidEmotionJsonUrl('https://cdn.example.com/emotion/OwO.txt')).toThrow('表情 JSON 链接格式不正确');
	});
});
