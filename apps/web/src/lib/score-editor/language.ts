import type { Language } from "@neta-art/score-editor";
import type { Locale } from "$lib/i18n/locale";

/** The editor ships `zh` and `en`; each interface locale maps to one of them. */
export function scoreEditorLanguage(locale: Locale): Language {
	switch (locale) {
		case "zh-CN":
			return "zh";
		case "en":
			return "en";
	}
}
