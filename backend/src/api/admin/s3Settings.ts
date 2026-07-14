import { Context } from 'hono';
import { Bindings } from '../../bindings';
import { loadS3Settings, saveS3Settings } from '../../utils/s3Settings';

export async function getS3Settings(c: Context<{ Bindings: Bindings }>) {
	try {
		const settings = await loadS3Settings(c.env);
		// Hide secret key for security in UI if needed, but usually user needs to edit it.
		// For now, return it as is, or maybe mask it partially?
		// User usually expects to see the inputs.
		return c.json(settings);
	} catch (e: any) {
		return c.json({ message: e.message || '加载 S3 配置失败' }, 500);
	}
}

export async function updateS3Settings(c: Context<{ Bindings: Bindings }>) {
	try {
		const body = await c.req.json();
		const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
		const accessKeyId = typeof body.accessKeyId === 'string' ? body.accessKeyId.trim() : '';
		const secretAccessKey = typeof body.secretAccessKey === 'string' ? body.secretAccessKey.trim() : '';
		const bucket = typeof body.bucket === 'string' ? body.bucket.trim() : '';
		const region = typeof body.region === 'string' ? body.region.trim() : 'auto';

		await saveS3Settings(c.env, {
			endpoint,
			accessKeyId,
			secretAccessKey,
			bucket,
			region,
		});

		return c.json({ message: '保存成功' });
	} catch (e: any) {
		return c.json({ message: e.message || '保存失败' }, 500);
	}
}
