import { pushState, replaceState } from "$app/navigation";
import { page } from "$app/state";

/** Where focus returns when the layer closes: the entry that opened it. */
let opener: HTMLElement | null = null;
/** Computed once by the workspace page; the entries never work it out themselves. */
let editable = $state(false);

/**
 * The one score editor layer of the app. It is open exactly while the current history entry says so,
 * which makes the browser's back (and a phone's back gesture) close it without leaving the page,
 * and closing by any other means pops the same entry, so the next back behaves as before.
 */
export const scoreEditorLayer = {
	get taskRunId(): string | null {
		return page.state.scoreEditor?.taskRunId ?? null;
	},
	get open(): boolean {
		return page.state.scoreEditor !== undefined;
	},
	get opener(): HTMLElement | null {
		return opener;
	},
	get editable(): boolean {
		return editable;
	},
	setEditable(value: boolean) {
		editable = value;
	},
	/** Opens the layer for a generation task; `from` is the entry that was used. */
	show(taskRunId: string, from: HTMLElement | null) {
		const state = { ...page.state, scoreEditor: { taskRunId } };
		if (page.state.scoreEditor) {
			replaceState("", state);
			return;
		}
		opener = from;
		pushState("", state);
	},
	close() {
		if (page.state.scoreEditor) history.back();
	},
};
