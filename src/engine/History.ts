export interface HistoryEntry {
  label: string;
  /** Approximate memory held by this entry. */
  bytes: number;
  undo(): void;
  redo(): void;
}

/** Linear undo/redo stack with a memory budget. Oldest entries are dropped first. */
export class History {
  private entries: HistoryEntry[] = [];
  private index = 0; // number of applied entries
  private bytes = 0;
  constructor(public maxBytes = 512 * 1024 * 1024, public maxEntries = 200) {}

  push(e: HistoryEntry) {
    // Drop the redo branch.
    for (const dropped of this.entries.splice(this.index)) this.bytes -= dropped.bytes;
    this.entries.push(e);
    this.bytes += e.bytes;
    this.index = this.entries.length;
    while (this.entries.length > 1 && (this.bytes > this.maxBytes || this.entries.length > this.maxEntries)) {
      const old = this.entries.shift()!;
      this.bytes -= old.bytes;
      this.index--;
    }
  }

  get canUndo() {
    return this.index > 0;
  }
  get canRedo() {
    return this.index < this.entries.length;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo) return null;
    const e = this.entries[--this.index];
    e.undo();
    return e;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo) return null;
    const e = this.entries[this.index++];
    e.redo();
    return e;
  }

  clear() {
    this.entries = [];
    this.index = 0;
    this.bytes = 0;
  }
}
