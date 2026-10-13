<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowUpRight,
    Check,
    ChevronRight,
    CircleHelp,
    Expand,
    Hand,
    Layers,
    Leaf,
    LoaderCircle,
    Moon,
    MousePointer2,
    Pause,
    Play,
    Plus,
    Redo2,
    Sparkles,
    SquarePen,
    Sun,
    Undo2,
    X,
  } from 'lucide-svelte';
  import type { BoardDocument } from '@neta-art/cohub/board';
  import { WorldController, type WorldView } from './controller';
  import { cards, kindLabel, kinds, seed, sanitizeImported, type Card, type Kind } from './world';
  import { DraftStore, download, DRAFT_KEY } from './storage';
  import { authorize, context, createCloudSave, createStory } from './cohub';
  import * as m from './paraglide/messages.js';
  import { getLocale, setLocale } from './paraglide/runtime.js';

  let host: HTMLDivElement;
  let upload: HTMLInputElement;
  let controller = $state<WorldController | null>(null);
  let view = $state.raw<WorldView | null>(null);
  let notice = $state('');
  let error = $state(false);
  let saved = $state(true);
  let dark = $state(false);
  let paused = $state(false);
  let indexOpen = $state(false);
  let dismissed = $state('');
  let offer = $state<string[]>([]);
  let form = $state<'idea' | 'edit' | 'fusion' | null>(null);
  let editing = $state.raw<Card | null>(null);
  let title = $state('');
  let body = $state('');
  let kind = $state<Kind>('idea');
  let intent = $state('');
  let ai = $state(false);
  let spaceId = $state<string | undefined>();
  let runtime = $state(false);
  let busy = $state(false);
  let cloudBusy = $state(false);
  let tool = $state<'select' | 'hand'>('select');
  let viewportWidth = $state(1200);
  let formReady = $state(false);
  const FORM_KEY = 'neta-world:form:v1';
  let draft: DraftStore;
  let pendingCreation: { key: string; card: Card } | null = null;
  let request: AbortController | null = null;
  let cloudOperation: ReturnType<typeof createCloudSave> | null = null;
  let cloudSnapshot: BoardDocument | null = null;
  $effect(() => {
    if (!formReady) return;
    const snapshot = {
      form,
      title,
      body,
      kind,
      intent,
      editing: editing?.id,
      sources: selectionKey ? selectionKey.split(':') : [],
    };
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify(snapshot));
    } catch {
      show(m.save_failed(), true);
    }
  });
  const all = $derived(view ? cards(view.document) : []);
  const selected = $derived(view?.selected ?? []);
  const selectionKey = $derived(selected.map((c) => c.id).join(':'));
  const chosen = $derived(selected[0]);
  const panel = $derived(!form && chosen && selectionKey !== dismissed);
  const suggestions = $derived(
    chosen
      ? [
          {
            title: m.suggest_secret({ name: chosen.title }),
            body: m.suggest_secret_body(),
            kind: 'clue' as Kind,
          },
          {
            title: m.suggest_voice({ name: chosen.title }),
            body: m.suggest_voice_body(),
            kind: 'story' as Kind,
          },
          {
            title: m.suggest_next({ name: chosen.title }),
            body: m.suggest_next_body(),
            kind: 'idea' as Kind,
          },
        ]
      : [],
  );
  const words = $derived(
    selected
      .flatMap((c) => [
        c.title,
        kindLabel(c.kind),
        ...c.body
          .split(/[，。！？,.!?:：\s]+/)
          .filter((s) => s.length > 1)
          .map((s) => s.slice(0, 9)),
      ])
      .slice(0, 9),
  );
  const placement = $derived.by(() => {
    if (!view || !controller || !chosen) return null;
    void view.zoom;
    return controller.overlay(chosen.id, { width: 294, height: 396 });
  });
  const locale = getLocale();
  function show(text: string, failure = false) {
    notice = text;
    error = failure;
  }
  function persist(document: BoardDocument) {
    try {
      draft.save(document);
      saved = true;
    } catch {
      saved = false;
      show(m.save_failed(), true);
    }
  }
  function inspect(ids: string[]) {
    controller?.select(ids);
    dismissed = '';
    indexOpen = false;
  }
  function setTool(next: 'select' | 'hand') {
    tool = next;
    if (controller) controller.editor.tool = next;
  }
  function toggleTheme() {
    dark = !dark;
    controller?.setTheme(dark);
  }
  function togglePause() {
    paused = !paused;
    controller?.pause(paused);
  }
  function selectCard(id: string, additive = false) {
    if (!controller) return;
    if (additive)
      controller.select(
        selected.some((c) => c.id === id)
          ? selected.filter((c) => c.id !== id).map((c) => c.id)
          : [...selected.map((c) => c.id), id],
      );
    else {
      controller.focus(id);
      dismissed = '';
      indexOpen = false;
    }
  }
  function startEdit() {
    if (busy || !chosen) return;
    editing = chosen;
    form = 'edit';
    title = chosen.title;
    body = chosen.body;
    kind = chosen.kind;
  }
  function startIdea() {
    if (busy) return;
    editing = null;
    form = 'idea';
    title = '';
    body = '';
    kind = 'idea';
    indexOpen = false;
  }
  function startFusion() {
    if (busy) return;
    form = 'fusion';
    intent ||= m.default_intent();
    indexOpen = false;
  }
  async function addIdea(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      show(m.input_required(), true);
      return;
    }
    if (!controller || busy) return;
    busy = true;
    try {
      if (form === 'edit' && editing)
        await controller.update({ ...editing, title: title.trim(), body: body.trim(), kind });
      else
        await controller.add({
          id: crypto.randomUUID(),
          title: title.trim(),
          body: body.trim(),
          kind,
          sources: [],
          createdAt: new Date().toISOString(),
        });
      form = null;
      dismissed = controller
        .selected()
        .map((c) => c.id)
        .join(':');
      if (saved) show(m.saved());
    } catch {
      show(m.save_failed(), true);
    } finally {
      busy = false;
    }
  }
  async function accept(index: number) {
    const suggestion = suggestions[index];
    if (!controller || !chosen || !suggestion || busy) return;
    busy = true;
    try {
      await controller.add({
        id: crypto.randomUUID(),
        ...suggestion,
        sources: [chosen.id],
        prompt: suggestion.title,
        body: `${suggestion.body}\n\n${chosen.body}`,
        createdAt: new Date().toISOString(),
      });
      dismissed = controller
        .selected()
        .map((c) => c.id)
        .join(':');
      if (saved) show(m.status_born());
    } catch {
      show(m.save_failed(), true);
    } finally {
      busy = false;
    }
  }
  async function enableAI() {
    if (ai) {
      ai = false;
      return;
    }
    try {
      spaceId = await authorize(['session.prompt.readonly'], m.ai_permission(), spaceId);
      ai = true;
    } catch {
      show(runtime ? m.ai_failed() : m.cloud_unavailable(), true);
    }
  }
  async function fuse(event: SubmitEvent) {
    event.preventDefault();
    if (!controller || busy || !selected.length) return;
    const sources = [...selected];
    const prompt = intent.trim() || m.default_intent();
    busy = true;
    const abort = new AbortController();
    request = abort;
    try {
      const key = JSON.stringify({ sources, prompt, ai, spaceId });
      if (!pendingCreation || pendingCreation.key !== key) {
        const story =
          ai && spaceId
            ? await createStory(spaceId, sources, prompt, abort.signal)
            : {
                body: m.local_story({
                  names: sources.map((c) => c.title).join(' / '),
                  intent: prompt,
                }),
                prompt,
                raw: undefined,
              };
        if (abort.signal.aborted) return;
        pendingCreation = {
          key,
          card: {
            id: crypto.randomUUID(),
            kind: 'story',
            title: prompt.length > 32 ? m.story_title() : prompt,
            ...story,
            sources: sources.map((c) => c.id),
            sourceSnapshots: sources.map(({ id, title, body, kind }) => ({
              id,
              title,
              body,
              kind,
            })),
            createdAt: new Date().toISOString(),
          },
        };
        try {
          draft.recordCreation(pendingCreation.card.id, pendingCreation.card);
        } catch {
          saved = false;
          show(m.save_failed(), true);
        }
      }
      await controller.add(pendingCreation.card);
      pendingCreation = null;
      form = null;
      intent = '';
      dismissed = controller
        .selected()
        .map((c) => c.id)
        .join(':');
      if (saved) show(m.status_born());
    } catch {
      if (!abort.signal.aborted) show(m.ai_failed(), true);
    } finally {
      busy = false;
      request = null;
    }
  }
  function closeForm() {
    request?.abort();
    form = null;
  }
  async function saveCloud() {
    if (!view || cloudBusy) return;
    cloudBusy = true;
    try {
      spaceId = await authorize(['file.edit', 'file.view'], m.write_permission(), spaceId);
      if (!cloudOperation || cloudSnapshot !== view.document) {
        cloudSnapshot = view.document;
        cloudOperation = createCloudSave(view.document);
      }
      const result = await cloudOperation(spaceId);
      show(m.cloud_saved({ path: result.path }));
      cloudOperation = null;
    } catch {
      show(runtime ? m.cloud_failed() : m.cloud_unavailable(), true);
    } finally {
      cloudBusy = false;
    }
  }
  function exportBoard() {
    if (view) download('neta-world.board.json', JSON.stringify(view.document, null, 2));
  }
  async function importBoard(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !controller || busy) return;
    try {
      const content = await file.text();
      const { document, paused: scriptsPaused } = sanitizeImported(JSON.parse(content));
      draft.recordImport(file.name, content);
      draft.backup(controller.editor.document);
      draft.save(document);
      controller.editor.loadDocument(document, crypto.randomUUID());
      controller.fit();
      dismissed = '';
      form = null;
      saved = true;
      show(scriptsPaused ? m.import_scripts() : m.import_ok());
    } catch {
      show(m.import_failed(), true);
    } finally {
      input.value = '';
    }
  }
  function keydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement)?.closest('input,textarea,select,button') || !controller)
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      controller.editor.spaceHeld = true;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) controller.editor.redo();
      else controller.editor.undo();
    }
    if (event.key === 'Escape') {
      closeForm();
      dismissed = selectionKey;
      controller.editor.clearSelection();
    }
    if (event.key.toLowerCase() === 'f') controller.fit();
    if (event.key.toLowerCase() === 'v') setTool('select');
    if (event.key.toLowerCase() === 'h') setTool('hand');
  }
  onMount(() => {
    let initial = seed();
    try {
      draft = new DraftStore(localStorage);
      initial = draft.read() ?? initial;
    } catch {
      saved = false;
      show(m.save_failed(), true);
    }
    controller = new WorldController(host, initial, {
      change: (next) => {
        view = next;
      },
      save: persist,
      inspect,
      near: (ids) => {
        if (!busy && !form) {
          offer = ids;
          show(m.status_near());
        }
      },
      suggest: (ids) => {
        if (!busy && !form) offer = ids;
      },
      error: () => show(m.boot_failed(), true),
    });
    if (saved) persist(initial);
    try {
      const raw = sessionStorage.getItem(FORM_KEY);
      if (raw) {
        const draftForm = JSON.parse(raw);
        title = typeof draftForm.title === 'string' ? draftForm.title : '';
        body = typeof draftForm.body === 'string' ? draftForm.body : '';
        intent = typeof draftForm.intent === 'string' ? draftForm.intent : '';
        if (kinds.includes(draftForm.kind)) kind = draftForm.kind;
        editing = cards(initial).find((card) => card.id === draftForm.editing) ?? null;
        if (
          ['idea', 'fusion', 'edit'].includes(draftForm.form) &&
          (draftForm.form !== 'edit' || editing)
        )
          form = draftForm.form;
        if (Array.isArray(draftForm.sources) && form)
          controller.select(
            draftForm.sources.filter(
              (id: unknown): id is string => typeof id === 'string' && Boolean(initial.items[id]),
            ),
          );
      }
      formReady = true;
    } catch {
      show(m.save_failed(), true);
    }
    let alive = true;
    void context.then((value) => {
      if (alive) runtime = Boolean(value);
    });
    const storage = (event: StorageEvent) => {
      if (event.key === DRAFT_KEY) {
        saved = false;
        show(m.recovery(), true);
      }
    };
    const blur = () => {
      if (controller) controller.editor.spaceHeld = false;
    };
    const visibility = () => controller?.stage.setActive(!document.hidden);
    window.addEventListener('storage', storage);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      request?.abort();
      controller?.destroy();
      window.removeEventListener('storage', storage);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  onkeydown={keydown}
  onkeyup={(e) => {
    if (e.code === 'Space' && controller) controller.editor.spaceHeld = false;
  }}
/>
<div class="app" class:dark>
  <header class="topbar">
    <button class="brand" onclick={() => controller?.fit()} aria-label="NETA World"
      ><span class="brand-mark"><Leaf size={19} strokeWidth={2.3} /></span><strong
        >NETA<span>WORLD</span></strong
      ></button
    >
    <div class="world-name"><span class="live-dot"></span>{m.world_title()}</div>
    <nav class="header-actions" aria-label={m.board_tab()}>
      <button class="icon-button" title={m.theme()} aria-label={m.theme()} onclick={toggleTheme}
        >{#if dark}<Sun size={17} />{:else}<Moon size={17} />{/if}</button
      >
      <button class="locale" onclick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
        >{m.language()}</button
      >
      <button
        class="save-button"
        aria-label={m.save_cloud()}
        disabled={cloudBusy}
        onclick={saveCloud}
        >{#if cloudBusy}<LoaderCircle size={15} class="spin" />{:else}<ArrowUpRight
            size={15}
          />{/if}<span>{m.save_cloud()}</span></button
      >
    </nav>
  </header>
  <div class="workspace">
    <aside class:mobile-open={indexOpen}>
      <div class="aside-top">
        <span class="eyebrow">NETA / 01</span><button
          class="mobile-only icon-button"
          aria-label={m.close()}
          onclick={() => (indexOpen = false)}><X size={18} /></button
        >
      </div>
      <div class="intro">
        <span class="eyebrow">{m.intro_eyebrow()}</span>
        <h1>{m.intro_title()}</h1>
        <p>{m.intro_body()}</p>
        <p class="quiet">{m.intro_hint()}</p>
      </div>
      <button class="new-idea" disabled={busy} onclick={startIdea}
        ><Plus size={17} />{m.add()}<span>↗</span></button
      >
      <div class="catalog-heading">
        <span>{m.index_tab()}</span><span>{all.length.toString().padStart(2, '0')}</span>
      </div>
      <div class="catalog">
        {#each all as card (card.id)}
          <div class="catalog-row" class:selected={selected.some((c) => c.id === card.id)}>
            <input
              type="checkbox"
              aria-label={`${m.choose_card()} · ${card.title}`}
              checked={selected.some((c) => c.id === card.id)}
              onchange={() => selectCard(card.id, true)}
            />
            <button onclick={() => selectCard(card.id)}
              ><i class={`kind-dot ${card.kind}`}></i><span
                >{card.title}<small>{kindLabel(card.kind)}</small></span
              ><ChevronRight size={13} /></button
            >
          </div>
        {/each}
      </div>
      {#if selected.length > 1}<button
          class="primary aside-fuse"
          disabled={busy}
          onclick={startFusion}><Sparkles size={16} />{m.fuse()} · {selected.length}</button
        >{/if}
      <footer class="aside-footer">
        <div class="save-state" class:failed={!saved}>
          {#if saved}<Check size={13} />{:else}<CircleHelp size={13} />{/if}{saved
            ? m.saved()
            : m.local()}
        </div>
        <p>{m.draft_note()}</p>
        <div class="file-actions">
          <button onclick={exportBoard}><ArrowDownToLine size={14} />{m.export_board()}</button
          ><button onclick={() => upload.click()}
            ><ArrowUpFromLine size={14} />{m.import_board()}</button
          >
        </div>
      </footer>
    </aside>
    <main class="board-area" inert={indexOpen && viewportWidth <= 760}>
      <div class="board-top">
        <div class="segmented">
          <button class:active={!indexOpen} onclick={() => (indexOpen = false)}
            ><Layers size={14} />{m.board_tab()}</button
          ><button
            class="mobile-only"
            class:active={indexOpen}
            onclick={() => (indexOpen = !indexOpen)}>{m.index_tab()} · {all.length}</button
          >
        </div>
        <span class="board-caption">{m.app_subtitle()}</span><button
          class="icon-button"
          title={paused ? m.resume() : m.pause()}
          aria-label={paused ? m.resume() : m.pause()}
          onclick={togglePause}
          >{#if paused}<Play size={16} />{:else}<Pause size={16} />{/if}</button
        >
      </div>
      <div class="canvas-host" bind:this={host}></div>
      {#if panel && chosen}
        <section
          class="thought-panel"
          aria-label={m.suggestions()}
          style:left={viewportWidth > 760 && placement ? `${placement.position.x}px` : undefined}
          style:top={viewportWidth > 760 && placement ? `${placement.position.y}px` : undefined}
        >
          <header>
            <span
              ><Sparkles size={15} />{selected.length > 1
                ? m.fusion_title()
                : m.suggestions()}</span
            ><button
              class="icon-button"
              aria-label={m.close()}
              onclick={() => (dismissed = selectionKey)}><X size={16} /></button
            >
          </header>
          {#key selectionKey}<div class="word-cloud" aria-hidden="true">
              {#each words as word, i}<span style:--i={i} class:large={i < 2}>{word}</span>{/each}
            </div>{/key}
          {#if selected.length > 1}<div class="fusion-preview">
              <p>{selected.map((c) => c.title).join(' + ')}</p>
              <small>{m.fusion_hint()}</small><button
                class="primary"
                disabled={busy}
                onclick={startFusion}><Sparkles size={16} />{m.fuse()}</button
              >
            </div>
          {:else}
            <div class="suggestion-list">
              {#each suggestions as suggestion, i}<button
                  disabled={busy}
                  onclick={() => accept(i)}
                  class:recommended={i === 0}
                  ><span class="suggestion-number">0{i + 1}</span><span
                    ><strong>{suggestion.title}</strong><small
                      >{i === 0 ? m.recommend() : kindLabel(suggestion.kind)}</small
                    ></span
                  ><ArrowUpRight size={15} /></button
                >{/each}
            </div>
            <button class="write-own" disabled={busy} onclick={startEdit}
              >{m.edit_card()}<SquarePen size={14} /></button
            >
            <button class="write-own" disabled={busy} onclick={startFusion}
              >{m.intent()}<ChevronRight size={14} /></button
            >
          {/if}
        </section>
      {/if}
      {#if form}
        <section
          class="compose-panel"
          aria-label={form === 'fusion'
            ? m.fusion_title()
            : form === 'edit'
              ? m.edit_card()
              : m.new_title()}
        >
          <header>
            <div>
              <span class="eyebrow">{form === 'idea' ? m.card_idea() : m.sources()}</span>
              <h2>
                {form === 'fusion'
                  ? m.fusion_title()
                  : form === 'edit'
                    ? m.edit_card()
                    : m.new_title()}
              </h2>
            </div>
            <button class="icon-button" aria-label={m.close()} onclick={closeForm}
              ><X size={19} /></button
            >
          </header>
          {#if form !== 'fusion'}
            <form onsubmit={addIdea}>
              <label
                >{m.kind_label()}<select bind:value={kind}
                  >{#each kinds as k}<option value={k}>{kindLabel(k)}</option>{/each}</select
                ></label
              ><label
                >{m.title_label()}<input
                  bind:value={title}
                  maxlength="100"
                  placeholder={m.title_placeholder()}
                  required
                /></label
              ><label
                >{m.body_label()}<textarea
                  bind:value={body}
                  rows="5"
                  placeholder={m.body_placeholder()}
                  required></textarea></label
              ><button class="primary" disabled={busy}
                >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Plus
                    size={16}
                  />{/if}{form === 'edit' ? m.save_changes() : m.create()}</button
              >
            </form>
          {:else}
            <form onsubmit={fuse}>
              <div class="source-chips">
                {#each selected as card}<span>{card.title}</span>{/each}
              </div>
              <p class="quiet">{m.fusion_hint()}</p>
              <label
                >{m.intent()}<textarea
                  bind:value={intent}
                  rows="4"
                  placeholder={m.intent_placeholder()}
                  disabled={busy}></textarea></label
              ><button
                class="ai-toggle"
                type="button"
                aria-pressed={ai}
                disabled={busy}
                onclick={enableAI}
                ><span class:enabled={ai}></span>{ai ? m.ai_mode() : m.draft_mode()}<span
                  >{ai ? '✓' : '+'}</span
                ></button
              >
              <p class="quiet ai-hint">{m.ai_hint()}</p>
              <button class="primary" disabled={busy || !selected.length}
                >{#if busy}<LoaderCircle size={16} class="spin" />{:else}<Sparkles
                    size={16}
                  />{/if}{busy ? m.creating() : m.create()}</button
              >
            </form>
          {/if}
        </section>
      {/if}
      {#if offer.length && !form && !panel}<div class="offer">
          <span>{m.status_offer()}</span><button
            onclick={() => {
              inspect(offer);
              offer = [];
            }}>{m.offer()}<ArrowUpRight size={14} /></button
          ><button class="icon-button" aria-label={m.dismiss()} onclick={() => (offer = [])}
            ><X size={14} /></button
          >
        </div>{/if}
      <div class="board-bottom">
        <div class="tools">
          <button
            class:active={tool === 'select'}
            aria-label={m.select()}
            title={m.select()}
            onclick={() => setTool('select')}><MousePointer2 size={17} /></button
          ><button
            class:active={tool === 'hand'}
            aria-label={m.pan()}
            title={m.pan()}
            onclick={() => setTool('hand')}><Hand size={17} /></button
          ><i></i><button
            disabled={!view?.canUndo}
            aria-label={m.undo()}
            title={m.undo()}
            onclick={() => controller?.editor.undo()}><Undo2 size={17} /></button
          ><button
            disabled={!view?.canRedo}
            aria-label={m.redo()}
            title={m.redo()}
            onclick={() => controller?.editor.redo()}><Redo2 size={17} /></button
          ><i></i><button aria-label={m.fit()} title={m.fit()} onclick={() => controller?.fit()}
            ><Expand size={17} /></button
          ><span>{Math.round((view?.zoom ?? 1) * 100)}%</span>
        </div>
        <p>{viewportWidth > 760 ? m.help() : m.mobile_help()}</p>
        <button
          class="mobile-only mobile-add"
          disabled={busy}
          aria-label={m.add()}
          onclick={startIdea}><Plus size={20} /></button
        >
      </div>
    </main>
  </div>
  {#if notice}<div class="notice" class:error role="status">
      <span>{notice}</span><button
        class="icon-button"
        aria-label={m.close()}
        onclick={() => (notice = '')}><X size={15} /></button
      >
    </div>{/if}
  <input
    class="file-input"
    type="file"
    accept=".json,.board"
    bind:this={upload}
    onchange={importBoard}
  />
</div>
