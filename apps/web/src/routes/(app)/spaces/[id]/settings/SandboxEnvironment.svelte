<script lang="ts">
import type { SandboxImageId, SandboxPreferenceStatus, SandboxPreferenceSource } from "@cohub/protocol/sandbox";
import { getLocale } from "$lib/i18n/locale.svelte";
import * as m from "$lib/paraglide/messages.js";

const { status, disabled, onChange } = $props<{
	status: SandboxPreferenceStatus;
	disabled: boolean;
	onChange: (patch: { image?: SandboxImageId | null; spec?: null }) => void;
}>();
const locale = $derived(getLocale());
const errors = $derived(status.sources.filter((source: SandboxPreferenceSource) => source.error));
const sources = $derived(status.sources.filter((source: SandboxPreferenceSource) => source.preferences.image || source.preferences.spec));
const imageLabel = (image: SandboxImageId) => image === "game"
	? m.sandbox_image_game({}, { locale }) : m.sandbox_image_default({}, { locale });
</script>

<div class="py-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0">
			<label for="sandbox-image" class="text-[13px] text-text-primary">{m.sandbox_environment({}, { locale })}</label>
			<p class="mt-1 max-w-prose text-[12px] leading-5 text-text-tertiary">{status.applicable ? m.sandbox_environment_hint({}, { locale }) : m.sandbox_environment_local({}, { locale })}</p>
		</div>
		<select id="sandbox-image" value={status.overrides.image ?? "auto"}
			disabled={disabled || !status.applicable}
			onchange={(event) => onChange({ image: event.currentTarget.value === "auto" ? null : event.currentTarget.value as SandboxImageId })}
			class="h-11 max-w-full shrink-0 rounded-[5px] border border-border-subtle bg-bg-input px-3 text-[12px] text-text-primary focus-visible:outline-brand disabled:opacity-50 sm:h-9">
			<option value="auto">{m.sandbox_follow_config({}, { locale })}</option>
			{#each status.images as image (image)}<option value={image}>{imageLabel(image)}</option>{/each}
		</select>
	</div>
	{#if status.applicable}
		{#if status.overrides.spec}
			<button type="button" disabled={disabled} onclick={() => onChange({ spec: null })} class="mt-2 min-h-11 text-left text-[12px] text-brand hover:underline disabled:opacity-50 sm:min-h-8">{m.sandbox_follow_spec({}, { locale })}</button>
		{/if}
		{#if status.pendingRestart}<p class="mt-2 text-[12px] text-text-secondary" role="status">{m.space_restart_to_apply({}, { locale })}</p>{/if}
		{#each status.warnings as warning (warning)}
			<p class="mt-2 text-[12px] text-text-secondary">{warning === "image_unavailable" ? m.sandbox_image_unavailable({}, { locale }) : m.sandbox_spec_limited({}, { locale })}</p>
		{/each}
		{#each errors as source (source.source)}
			<p class="mt-2 break-words text-[12px] text-error-soft">{m.sandbox_config_invalid({ source: source.source }, { locale })}</p>
		{/each}
		<details class="mt-2 text-[12px] text-text-tertiary">
			<summary class="w-fit cursor-pointer py-2 text-text-secondary">{m.sandbox_environment_details({}, { locale })}</summary>
			<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 py-2">
				<dt>{m.sandbox_environment_requested({}, { locale })}</dt><dd class="break-words">{imageLabel(status.requested.image)} · {status.requested.spec}</dd>
				<dt>{m.sandbox_environment_effective({}, { locale })}</dt><dd class="break-words">{imageLabel(status.effective.image)} · {status.effective.spec}</dd>
				<dt>{m.sandbox_environment_applied({}, { locale })}</dt><dd class="break-words">{status.applied.image ? imageLabel(status.applied.image) : "—"} · {status.applied.spec ?? "—"}</dd>
			</dl>
			<p class="mt-2">{m.sandbox_environment_sources({}, { locale })}</p>
			<ul class="mt-1 space-y-1">
				{#each sources as source (source.source)}
					<li class="break-all font-mono">{source.source}: {source.preferences.image ?? "—"} / {source.preferences.spec ?? "—"}</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>
