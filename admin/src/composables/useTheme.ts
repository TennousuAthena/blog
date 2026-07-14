import { ref } from 'vue';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'cwd_admin_theme';
const theme = ref<Theme>('system');

export function useTheme() {
	function applyTheme() {
		if (typeof window === 'undefined') return;

		const root = document.documentElement;
		const isDark = theme.value === 'dark' || (theme.value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}
	}

	function setTheme(newTheme: Theme) {
		theme.value = newTheme;
		localStorage.setItem(STORAGE_KEY, newTheme);
		applyTheme();
	}

	function initTheme() {
		if (typeof window === 'undefined') return;

		const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
		if (stored && ['light', 'dark', 'system'].includes(stored)) {
			theme.value = stored;
		} else {
			theme.value = 'system';
		}
		applyTheme();

		// 监听系统变更
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		// 移除现有的监听器，以避免 init 被多次调用时出现重复监听（尽管不应该重复监听）。
		mediaQuery.onchange = () => {
			if (theme.value === 'system') {
				applyTheme();
			}
		};
	}

	return {
		theme,
		setTheme,
		initTheme,
	};
}
