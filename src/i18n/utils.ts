import en from "./en.json";
import zh from "./zh.json";

export const languages = { zh: "中文", en: "English" } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = "zh";

const dictionaries: Record<Lang, typeof zh> = { zh, en: en as typeof zh };

export type MessageKey = keyof typeof zh;

/** 从 URL 中解析当前语言（/en/... → en，其余 → 默认语言） */
export function getLangFromUrl(url: URL): Lang {
	const [, segment] = url.pathname.split("/");
	if (segment && segment in languages) return segment as Lang;
	return defaultLang;
}

/** 返回翻译函数 t(key)，缺失时回退到默认语言 */
export function useTranslations(lang: Lang) {
	return function t<K extends MessageKey>(key: K): (typeof zh)[K] {
		return dictionaries[lang][key] ?? zh[key];
	};
}

/** 去掉路径中的语言前缀：/en/projects → /projects */
export function delocalizePath(path: string): string {
	for (const lang of Object.keys(languages)) {
		if (lang === defaultLang) continue;
		if (path === `/${lang}`) return "/";
		if (path.startsWith(`/${lang}/`)) return path.slice(lang.length + 1);
	}
	return path;
}

/** 给路径加上语言前缀（默认语言不加）：/projects + en → /en/projects */
export function localizePath(path: string, lang: Lang): string {
	const clean = delocalizePath(path);
	if (lang === defaultLang) return clean;
	return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

/** 替换 "{name}" 形式的占位符 */
export function format(template: string, params: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
