import { defaultLang, languages, ui, type Lang, type UiKey } from './ui';

export function isLang(value: string): value is Lang {
	return value in languages;
}

export function getLangFromUrl(url: URL): Lang {
	const [, maybe] = url.pathname.replace(/\/+$/, '').split('/');
	if (maybe && isLang(maybe) && maybe !== defaultLang) return maybe;
	return defaultLang;
}

export function useTranslations(lang: Lang) {
	return function t(key: UiKey, vars?: Record<string, string | number>) {
		const table = ui[lang] ?? ui[defaultLang];
		let text: string = table[key] ?? ui[defaultLang][key] ?? key;
		if (vars) {
			for (const [k, v] of Object.entries(vars)) {
				text = text.replace(`{${k}}`, String(v));
			}
		}
		return text;
	};
}

/** Localized path helper. Default locale (zh) has no prefix. */
export function localePath(path: string, lang: Lang = defaultLang): string {
	const clean = path.startsWith('/') ? path : `/${path}`;
	if (lang === defaultLang) return clean === '' ? '/' : clean;
	if (clean === '/') return `/${lang}/`;
	return `/${lang}${clean}`;
}

export function stripLocaleFromPath(pathname: string): string {
	const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
	if (parts[0] && isLang(parts[0]) && parts[0] !== defaultLang) {
		const rest = parts.slice(1).join('/');
		return rest ? `/${rest}/` : '/';
	}
	return pathname.endsWith('/') || pathname === '' ? pathname || '/' : `${pathname}/`;
}

export function htmlLang(lang: Lang): string {
	return lang === 'zh' ? 'zh-CN' : 'en';
}

export function cwdLang(lang: Lang): 'zh-CN' | 'en-US' {
	return lang === 'zh' ? 'zh-CN' : 'en-US';
}

export function dateLocale(lang: Lang): string {
	return lang === 'zh' ? 'zh-CN' : 'en-US';
}
