/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly SITE: string;
	readonly PUBLIC_CWD_API_BASE_URL?: string;
	readonly PUBLIC_CWD_SITE_ID?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface CWDCommentsInstance {
	mount(): void;
	unmount(): void;
	updateConfig(config: Record<string, unknown>): void;
	getConfig(): Record<string, unknown>;
}

interface CWDCommentsConstructor {
	new (config: Record<string, unknown>): CWDCommentsInstance;
}

interface Window {
	CWDComments?: CWDCommentsConstructor;
	__mojianCwd?: CWDCommentsInstance;
}
