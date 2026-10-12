<script lang="ts">
import type { AppDevice } from "@neta-art/cohub";
import { Camera, Mic } from "lucide-svelte";
import { appDevicesLabel } from "$lib/features/app/app-devices";
import { getLocale } from "$lib/i18n/locale.svelte";
import { m } from "$lib/paraglide/messages.js";

const { devices, onTurnOff }: { devices: AppDevice[]; onTurnOff: () => void } =
	$props();

const locale = $derived(getLocale());
const label = $derived(appDevicesLabel(devices, locale));

function turnOff() {
	if (confirm(m.app_devices_turn_off_confirm({ devices: label }, { locale })))
		onTurnOff();
}
</script>

{#if devices.length > 0}
	<button
		type="button"
		class="inline-flex h-6 items-center gap-1 rounded-full border border-border-subtle px-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
		title={m.app_devices_active({ devices: label }, { locale })}
		aria-label={m.app_devices_active({ devices: label }, { locale })}
		onclick={turnOff}
	>
		{#if devices.includes("camera")}<Camera class="h-3.5 w-3.5" aria-hidden="true" />{/if}
		{#if devices.includes("microphone")}<Mic class="h-3.5 w-3.5" aria-hidden="true" />{/if}
	</button>
{/if}
