<script lang="ts">
let { value }: { value: unknown } = $props();
const text = $derived(
  typeof value === "string" ? value : JSON.stringify(value, null, 2),
);
</script>
<pre>{text?.slice(0, 100_000) ?? "—"}{text && text.length > 100_000 ? "\n…" : ""}</pre>
