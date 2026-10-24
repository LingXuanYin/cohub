<script lang="ts">
import {
	type MediaVariantSize,
	mediaPreviewCandidates,
} from "@neta-art/cohub/media";
import type { Snippet } from "svelte";
import type { HTMLVideoAttributes } from "svelte/elements";
import { SvelteSet } from "svelte/reactivity";

type Props = Omit<HTMLVideoAttributes, "src" | "poster" | "children"> & {
	src: string;
	poster?: string | null;
	naturalWidth?: number | null;
	naturalHeight?: number | null;
	size: MediaVariantSize;
	element?: HTMLVideoElement | null;
	children?: Snippet;
};

let {
	src,
	poster: cover = null,
	naturalWidth = null,
	naturalHeight = null,
	size,
	element = $bindable(null),
	preload,
	children,
	...rest
}: Props = $props();

const failed = new SvelteSet<string>();
const poster = $derived(
	mediaPreviewCandidates(
		{
			type: "video",
			url: src,
			previewUrl: cover,
			width: naturalWidth,
			height: naturalHeight,
		},
		{ size },
	).find((url) => !failed.has(url)),
);

// `poster` reports no errors, so a probe moves a failed still to the next candidate.
$effect(() => {
	const url = poster;
	if (!url) return;
	const probe = new Image();
	probe.onerror = () => failed.add(url);
	probe.src = url;
	return () => {
		probe.onerror = null;
	};
});
</script>

<video
	bind:this={element}
	{...rest}
	{src}
	{poster}
	preload={preload ?? (poster ? "none" : "metadata")}
>
	{@render children?.()}
</video>
