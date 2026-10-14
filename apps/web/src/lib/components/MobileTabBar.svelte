<script lang="ts">
import { page } from "$app/state";
import { APP_AREA_ICONS, appAreaLabel } from "$lib/components/app-area";
import UserAvatar from "$lib/components/UserAvatar.svelte";
import { getLocale } from "$lib/i18n/locale.svelte";
import { requestListScrollTop } from "$lib/layout/list-scroll-top";
import { APP_AREAS, appAreaHref, resolveAppArea } from "$lib/mobile-nav";
import { m } from "$lib/paraglide/messages.js";
import { authStore } from "$lib/stores/auth.svelte";

const locale = $derived(getLocale());
const activeArea = $derived(resolveAppArea(page.url.pathname));
const profile = $derived(authStore.userUuid ? authStore.profile : null);

function onTabClick(event: MouseEvent, href: string) {
	if (page.url.pathname !== href) return;
	event.preventDefault();
	requestListScrollTop();
}
</script>

<nav
  class="flex h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0 items-stretch border-t border-border-subtle/70 bg-bg-primary pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
  aria-label={m.nav_tabs_aria({}, { locale })}
>
  {#each APP_AREAS as area (area)}
    {@const active = activeArea === area}
    {@const Icon = APP_AREA_ICONS[area]}
    {@const href = appAreaHref(area)}
    <a
      {href}
      onclick={(event) => onTabClick(event, href)}
      class="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[8px] px-1 transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 {active ? 'text-brand-muted-fg' : 'text-text-tertiary hover:text-text-secondary'}"
      aria-current={active ? "page" : undefined}
    >
      <span class="tab-indicator relative isolate flex h-7 w-12 items-center justify-center rounded-[8px]" data-active={active || undefined}>
        {#if area === "account" && profile}
          <UserAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} seed={authStore.userUuid} size="xs" class="h-[22px] w-[22px] border-0" />
        {:else}
          <Icon class="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2 : 1.75} />
        {/if}
      </span>
      <span class="max-w-full truncate text-[11px] leading-none {active ? 'font-medium' : ''}">
        {appAreaLabel(area, locale)}
      </span>
    </a>
  {/each}
</nav>

<style>
  .tab-indicator::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--color-brand-muted);
    opacity: 0;
    scale: 0.6 1;
    transition:
      opacity 160ms ease-out,
      scale 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tab-indicator[data-active]::before {
    opacity: 1;
    scale: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-indicator::before {
      transition: none;
    }
  }
</style>
