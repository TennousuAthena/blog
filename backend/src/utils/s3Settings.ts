import { Bindings } from '../bindings';

const S3_CONFIG_KEY = 's3_config';

export interface S3Settings {
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	region: string;
}

export async function loadS3Settings(env: Bindings): Promise<S3Settings> {
	await env.CWD_DB.prepare('CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
	const row = await env.CWD_DB.prepare('SELECT value FROM Settings WHERE key = ?')
		.bind(S3_CONFIG_KEY)
		.first<{ value: string }>();

	const defaults: S3Settings = {
		endpoint: '',
		accessKeyId: '',
		secretAccessKey: '',
		bucket: '',
		region: 'auto',
	};

	if (!row || !row.value) {
		return defaults;
	}

	try {
		const parsed = JSON.parse(row.value);
		return {
			endpoint: parsed.endpoint || '',
			accessKeyId: parsed.accessKeyId || '',
			secretAccessKey: parsed.secretAccessKey || '',
			bucket: parsed.bucket || '',
			region: parsed.region || 'auto',
		};
	} catch {
		return defaults;
	}
}

export async function saveS3Settings(env: Bindings, settings: S3Settings) {
	await env.CWD_DB.prepare('CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
	const value = JSON.stringify(settings);
	await env.CWD_DB.prepare('REPLACE INTO Settings (key, value) VALUES (?, ?)').bind(S3_CONFIG_KEY, value).run();
}
