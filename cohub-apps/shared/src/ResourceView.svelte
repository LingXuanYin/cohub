<script lang="ts">
import { untrack } from "svelte";
import type { ViewProps, ResourceViewLoader } from "./view-types";
let { loadView, ...props }: ViewProps & { loadView: ResourceViewLoader } =
  $props();
// A blur/change event from the departing form must never write into its successor.
const updateDraft = untrack(() => props.updateDraft);
const view = untrack(() => loadView());
</script>
{#await view then module}<module.default {...props} {updateDraft} />{/await}
