import type { Editor } from '../Editor';

export interface PointerInfo {
  /** Document coordinates. */
  x: number;
  y: number;
  /** Screen (CSS px) coordinates relative to the canvas. */
  sx: number;
  sy: number;
  /** Pressure 0..1 (mouse reports 1). */
  p: number;
  pointerType: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export interface Tool {
  readonly id: string;
  cursor(ed: Editor): string;
  down(ed: Editor, e: PointerInfo): void;
  move(ed: Editor, e: PointerInfo): void;
  up(ed: Editor, e: PointerInfo): void;
  /** Called on pointer move when no button is pressed. */
  hover?(ed: Editor, e: PointerInfo): void;
  /** Abort an in-progress action (e.g. tool switch, Escape). */
  cancel?(ed: Editor): void;
  /** Delete key pressed; return true if the tool handled it. */
  onDelete?(ed: Editor): boolean;
  /** Pointer left the canvas. */
  leave?(ed: Editor): void;
  /** Draw on top of everything in screen space. */
  drawScreen?(ctx: CanvasRenderingContext2D, ed: Editor): void;
}
