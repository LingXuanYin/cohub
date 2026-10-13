<script lang="ts">
const { size = 32 }: { size?: number } = $props();
</script>

<svg
  class="pixel-companion"
  width={size}
  height={size * 1.2}
  viewBox="0 0 48 58"
  shape-rendering="crispEdges"
  aria-hidden="true"
>
  <path class="companion-head" fill="var(--ink)" d="M4 6H10V10H38V6H44V28H40V34H8V28H4Z" />
  <path fill="var(--paper)" d="M10 16H38V30H10Z" />
  <g class="companion-eyes" fill="var(--ink)"><path d="M16 20H20V26H16Z M28 20H32V26H28Z" /></g>
  <path fill="var(--ink)" d="M14 34H34V44H14Z M17 44H21V54H17Z M27 44H31V54H27Z" />
  <path fill="var(--paper)" d="M18 36H30V42H18Z" />
</svg>
