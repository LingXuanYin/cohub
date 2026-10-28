import type { HomeActions } from "../src/app/home-view.ts";

/** A DOM node small enough for the view seams; one copy for every view/home test. */
export class FakeElement {
  className = "";
  hidden = false;
  disabled = false;
  textContent = "";
  title = "";
  type = "";
  dateTime = "";
  tabIndex = 0;
  scrollTop = 0;
  readonly style = { setProperty() {}, removeProperty() {} };
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  onclick: (() => void) | null = null;

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(): void {}

  focus(): void {
    (globalThis.document as unknown as { activeElement?: FakeElement }).activeElement = this;
  }

  querySelector(selector: string): FakeElement | null {
    const match = /^\[data-focus-key="(.*)"\]$/.exec(selector);
    if (!match) return null;
    const key = match[1];
    if (this.dataset.focusKey === key) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  remove(): void {}
}

export const homeActions: HomeActions = {
  newScore() {},
  pickSpace() {},
  backToContext() {},
  backToWorking() {},
  openSong() {},
  openFile() {},
  copySong() {},
  copyFile() {},
  loadMoreSongs() {},
  showMoreFiles() {},
  retrySongs() {},
  retryFiles() {},
  retryAll() {},
  retryRefresh() {},
  askSongs() {},
  askFiles() {},
  askAll() {},
  askEdit() {},
  cancelCheck() {},
};
