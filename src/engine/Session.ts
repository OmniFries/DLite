import type { DrawingDocument } from './Document';
import { History } from './History';

/** Where a drawing is stored on disk (browser file handle or desktop path). */
export interface FileRef {
  handle?: unknown;
  path?: string;
}

let nextSessionId = 1;

/** One open drawing (one tab): its document, undo history, selection, view and file. */
export class DocSession {
  readonly id = nextSessionId++;
  readonly history = new History();
  readonly selection = new Set<number>();
  /** Bumped on every change (used to refresh the UI). */
  version = 0;
  /** History state at the last save/open: undoing back to it counts as saved. */
  savedState = this.history.stateId;
  /** Zoom and pan, remembered while another tab is showing. */
  view: { zoom: number; offsetX: number; offsetY: number } | null = null;
  file: FileRef = {};

  constructor(
    public doc: DrawingDocument,
    public name: string,
  ) {}

  get dirty() {
    return this.history.stateId !== this.savedState;
  }

  /** An untouched, never-saved drawing that can be replaced when opening a file. */
  get pristine() {
    return !this.dirty && !this.history.canUndo && !this.history.canRedo && !this.file.handle && !this.file.path;
  }
}
