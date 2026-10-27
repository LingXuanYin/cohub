/** The two languages this App draws. The host's locale picks one; nothing else is supported. */
export type Language = "zh" | "en";

/**
 * Every string the App's own frame draws, in both languages. `{name}` is the score file's name.
 * One word for the thing throughout: "score file" / 乐谱文件.
 */
export const FRAME_COPY = {
  opening: { zh: "正在打开 {name}…", en: "Opening {name}…" },
  scoreFileTag: { zh: "乐谱文件", en: "Score file" },
  generatedScoreTag: { zh: "生成的乐谱", en: "Generated score" },
  noPermissionTitle: { zh: "无法打开 {name}", en: "Can't open {name}" },
  noPermissionBody: {
    zh: "申请这个 Space 的权限。需要查看和编辑权限，才能打开并保存。",
    en: "Ask for view and edit access to this Space to open this score file and save it.",
  },
  revokedTitle: { zh: "{name} 的权限已被收回", en: "Access to {name} was removed" },
  revokedBody: {
    zh: "这个乐谱文件现在不能读取或写入。",
    en: "This score file can't be read or written right now.",
  },
  goneTitle: { zh: "{name} 不在了", en: "{name} is gone" },
  goneBody: {
    zh: "它被删除或移动了。没有改动任何内容。",
    en: "It was deleted or moved. Nothing was changed.",
  },
  failedTitle: { zh: "打不开 {name}", en: "Couldn't open {name}" },
  failedBody: { zh: "没有改动任何内容。再试一次。", en: "Nothing was changed. Try again." },
  editsKept: {
    zh: "修改还在。现在无法存回这个乐谱文件。",
    en: "Your changes are still here. They can't be saved to this score file right now.",
  },
  readOnlyBody: {
    zh: "你可以查看这个乐谱文件。申请编辑权限后才能修改。",
    en: "You can view this score file. Ask for edit access to change it.",
  },
  readOnlyGeneratedBody: {
    zh: "你可以查看这次生成的乐谱。申请编辑权限后才能修改。",
    en: "You can view this generated score. Ask for edit access to change it.",
  },
  generatedNoPermissionBody: {
    zh: "申请这个 Space 的查看和编辑权限，才能打开这次生成的乐谱，并把改动留在它的草稿里。",
    en: "Ask for view and edit access to this Space to open this generated score and keep your edits in its draft.",
  },
  accessNotGiven: { zh: "没有获得权限。", en: "Access was not given." },
  askAccess: { zh: "申请权限", en: "Ask for access" },
  askEdit: { zh: "申请编辑权限", en: "Ask for edit access" },
  retry: { zh: "再试一次", en: "Try again" },
  saveAsNew: { zh: "另存为新文件", en: "Save as a new file" },
  saveAsFailed: {
    zh: "没能另存为乐谱文件。没有改动任何内容。再试一次。",
    en: "Couldn't save a copy as a score file. Nothing was changed. Try again.",
  },
  noFileTitle: { zh: "打开乐谱文件", en: "Open a score file" },
  noFileBody: {
    zh: "在 Space 里打开一个 .abc 乐谱文件，它就会出现在这里。",
    en: "Open a .abc score file in a Space and it opens here.",
  },
  startupFailedTitle: { zh: "没有连接到 Cohub", en: "Cohub didn't answer" },
  startupFailedBody: { zh: "没有改动任何内容。再试一次。", en: "Nothing was changed. Try again." },
  noHostTitle: { zh: "在 Space 里打开这个 App", en: "Open this App from a Space" },
  noHostBody: {
    zh: "在 Space 里用这个 App 打开一份乐谱文件。",
    en: "Open a score file in a Space with this App.",
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

export function fillCopy(template: string, values: { readonly name: string }): string {
  return template.replaceAll("{name}", values.name);
}
