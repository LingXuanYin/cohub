import { type RelayTarget, readRelayTarget, withRelayTarget } from "$lib/relay";

export function createRelayComposerController(options: {
	getInput: () => string;
	setInput: (value: string) => void;
	getSpaceId: () => string | null;
	getSessionId: () => string | null;
	isAgentMode: () => boolean;
	focus: () => void;
}) {
	const target = $derived(
		options.isAgentMode()
			? readRelayTarget(options.getInput(), {
					spaceId: options.getSpaceId(),
					sessionId: options.getSessionId(),
				})
			: null,
	);

	return {
		get target() {
			return target;
		},
		replyTo(chat: Required<RelayTarget>) {
			options.setInput(withRelayTarget(options.getInput(), chat));
			options.focus();
		},
	};
}
