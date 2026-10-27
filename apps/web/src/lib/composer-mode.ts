export type ComposerMode = "agent" | "create" | "note";

export const COMPOSER_MODES: readonly ComposerMode[] = [
	"agent",
	"create",
	"note",
];

export function parseComposerModeCommand(value: string): ComposerMode | null {
	const command = value.trim();
	if (!command.startsWith(":")) return null;
	return COMPOSER_MODES.find((mode) => mode === command.slice(1)) ?? null;
}
