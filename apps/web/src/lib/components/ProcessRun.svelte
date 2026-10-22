<script lang="ts">
import type {
	MessageToolCallsFile,
	SessionTurnRecord,
	StoredIntermediateMessage,
} from "@cohub/protocol/model";
import IntermediateMessageBubble from "$lib/components/IntermediateMessageBubble.svelte";
import ToolSummaryRow from "$lib/components/ToolSummaryRow.svelte";
import {
	buildToolCallViewModels,
	summarizeToolCalls,
} from "$lib/components/tool-call-format";
import { getLocale } from "$lib/i18n/locale.svelte";
import type { ModelCatalogItem } from "$lib/model-catalog";
import { m } from "$lib/paraglide/messages.js";
import type { OpenWorkspaceFileTarget } from "$lib/workspace-file-links";

type Props = {
	turn: SessionTurnRecord;
	messages: StoredIntermediateMessage[];
	modelsCatalog?: ModelCatalogItem[];
	onLoadToolCalls?: (input: {
		turn: SessionTurnRecord;
		message: StoredIntermediateMessage;
	}) => Promise<MessageToolCallsFile | null>;
	onOpenFile?: (target: OpenWorkspaceFileTarget) => void;
	onOpenUrl?: (href: string, event: MouseEvent) => void | Promise<void>;
};

const {
	turn,
	messages,
	modelsCatalog,
	onLoadToolCalls,
	onOpenFile,
	onOpenUrl,
}: Props = $props();

const locale = $derived(getLocale());
let open = $state(false);
const tools = $derived(
	buildToolCallViewModels({
		content: messages.flatMap((message) => message.content),
	}),
);
const summary = $derived(summarizeToolCalls(tools));
const label = $derived(
	[
		messages.length > 1
			? m.process_steps_many({ count: messages.length }, { locale })
			: m.process_steps_one({ count: 1 }, { locale }),
		tools.length > 1
			? m.process_tools_many({ count: tools.length }, { locale })
			: tools.length === 1
				? m.process_tools_one({ count: 1 }, { locale })
				: "",
	]
		.filter(Boolean)
		.join(" · "),
);
</script>

<div class="px-[var(--chat-msg-inset)]">
	<ToolSummaryRow {label} {summary} {open} onToggle={() => (open = !open)} />
</div>
{#if open}
	<div class="ml-[calc(var(--chat-msg-inset)+3px)] flex flex-col gap-2 border-l border-border-subtle/70 pl-[11px] [--chat-msg-inset:0px]">
		{#each messages as message}
			<IntermediateMessageBubble {message} showMeta={false} {modelsCatalog} onLoadToolCalls={onLoadToolCalls ? () => onLoadToolCalls({ turn, message }) : undefined} {onOpenFile} {onOpenUrl} />
		{/each}
	</div>
{/if}
