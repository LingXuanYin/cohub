import {
	type AppDevice,
	type AppDevicesStatus,
	parseAppDevices,
} from "@cohub/protocol/app-devices";
import { untrack } from "svelte";
import {
	clearAppDeviceConsent,
	grantedAppDevices,
	readAppDeviceConsent,
	writeAppDeviceConsent,
} from "$lib/features/app/app-devices";
import { authStore } from "$lib/stores/auth.svelte";

// A frame gains or loses devices only when it loads, so consent changes remount it.
export function createAppDeviceAccess(input: {
	appId: string;
	declared: () => unknown;
	supported: boolean;
	reply: (requestId: string, status: AppDevicesStatus) => void;
}) {
	const declared = $derived(parseAppDevices(input.declared()));
	const devicesFor = (consent: readonly AppDevice[]) =>
		input.supported ? grantedAppDevices(declared, consent) : [];

	let consent = $state<AppDevice[]>(
		readAppDeviceConsent(input.appId, authStore.userUuid),
	);
	const allowed = $derived(devicesFor(consent));
	let loaded = untrack(() => allowed);
	let reloadKey = $state(0);
	let pending = $state<{ requestId: string; devices: AppDevice[] } | null>(
		null,
	);

	function reload() {
		loaded = devicesFor(consent);
		reloadKey += 1;
	}

	$effect(() => {
		const viewerUuid = authStore.userUuid;
		void authStore.ensureLoaded();
		const stored = readAppDeviceConsent(input.appId, viewerUuid);
		untrack(() => {
			if (stored.join() === consent.join()) return;
			consent = stored;
			if (devicesFor(stored).join() !== loaded.join()) reload();
		});
	});

	return {
		get allowed() {
			return allowed;
		},
		get pending() {
			return pending;
		},
		get reloadKey() {
			return reloadKey;
		},
		request(requestId: string, devices: AppDevice[]) {
			const wanted = declared.filter((device) => devices.includes(device));
			if (!input.supported || wanted.length === 0)
				return input.reply(requestId, "unavailable");
			if (wanted.every((device) => loaded.includes(device)))
				return input.reply(requestId, "granted");
			if (pending) input.reply(pending.requestId, "denied");
			pending = { requestId, devices: wanted };
		},
		allow() {
			if (!pending) return;
			consent = [...consent, ...pending.devices];
			writeAppDeviceConsent(input.appId, authStore.userUuid, consent);
			pending = null;
			reload();
		},
		deny() {
			if (!pending) return;
			input.reply(pending.requestId, "denied");
			pending = null;
		},
		turnOff() {
			clearAppDeviceConsent(input.appId, authStore.userUuid);
			consent = [];
			reload();
		},
	};
}

export type AppDeviceAccess = ReturnType<typeof createAppDeviceAccess>;
