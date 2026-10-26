/** The two languages this App draws. The host's locale picks one; nothing else is supported. */
export type Language = "zh" | "en";

/** Every string the App's own frame draws, in both languages. */
export const FRAME_COPY = {
  opening: { zh: "正在打开乐谱…", en: "Opening the score…" },
  scoreFileTag: { zh: "乐谱文件", en: "Score file" },
  path: { zh: "路径", en: "Path" },
  noPermissionTitle: { zh: "无法打开这份乐谱", en: "You can't open this score" },
  noPermissionBody: {
    zh: "请先获得这个 Space 的查看和编辑权限，再打开这个文件。",
    en: "Ask for view and edit access to this Space, then open the file again.",
  },
  revokedTitle: { zh: "权限已被收回", en: "Access was removed" },
  revokedBody: {
    zh: "这个 App 不能再读写这个文件了。重新获得权限后刷新窗口。",
    en: "This App can no longer read or write this file. Ask for access again, then reload the window.",
  },
  goneTitle: { zh: "文件不在了", en: "This file is gone" },
  goneBody: {
    zh: "它被删除或移动了。关掉这个窗口，从新位置打开。",
    en: "It was deleted or moved. Close this window and open it from its new place.",
  },
  failedTitle: { zh: "打不开这份乐谱", en: "The score couldn't be opened" },
  failedBody: { zh: "没有改动任何内容。再试一次。", en: "Nothing was changed. Try again." },
  retry: { zh: "再试一次", en: "Try again" },
  noHostTitle: { zh: "要在 Space 里打开这个 App", en: "Open this App from a Space" },
  noHostBody: {
    zh: "从一个 Space 里的文件打开它，或从任务里的「乐谱」打开。",
    en: "Open a file in a Space with this App, or use the score entry in a task.",
  },
} as const;

export type FrameCopy = { readonly [K in keyof typeof FRAME_COPY]: string };

/** `zh*` is Chinese, everything else English — the host's locale is a language tag, not a list. */
export function languageFor(locale: string | null | undefined): Language {
  return typeof locale === "string" && locale.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** One language at a time, flattened for the renderer. */
export function frameCopy(language: Language): FrameCopy {
  const copy = {} as Record<keyof typeof FRAME_COPY, string>;
  for (const key of Object.keys(FRAME_COPY) as Array<keyof typeof FRAME_COPY>) {
    copy[key] = FRAME_COPY[key][language];
  }
  return copy as FrameCopy;
}
