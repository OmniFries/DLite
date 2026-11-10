import { describe, expect, it } from 'vitest';
import { floodMask, dilate } from '../src/engine/tools/floodFill';
import { History } from '../src/engine/History';
import { Smoother } from '../src/engine/brush/Smoother';
import { Viewport } from '../src/engine/Viewport';
import { outlineToSvgPath } from '../src/engine/vector/VectorItem';

function img(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fill(x, y), (y * w + x) * 4);
  return d;
}

describe('floodMask', () => {
  it('fills only the region bounded by a wall', () => {
    // 10x5 white with a black vertical wall at x=4
    const d = img(10, 5, (x) => (x === 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const m = floodMask(d, 10, 5, 1, 1, 10)!;
    const filled = [...m].reduce((a, b) => a + b, 0);
    expect(filled).toBe(4 * 5);
    expect(m[5]).toBe(0);
  });
  it('respects tolerance', () => {
    const d = img(4, 1, (x) => [x * 20, 0, 0, 255]);
    expect([...floodMask(d, 4, 1, 0, 0, 25)!]).toEqual([1, 1, 0, 0]);
    expect([...floodMask(d, 4, 1, 0, 0, 60)!]).toEqual([1, 1, 1, 1]);
  });
  it('returns null outside the image and dilates by one pixel', () => {
    expect(floodMask(new Uint8ClampedArray(16), 2, 2, 5, 5, 0)).toBeNull();
    const m = new Uint8Array(9);
    m[4] = 1;
    expect([...dilate(m, 3, 3)]).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
  });
});

describe('History', () => {
  it('undoes, redoes and drops the redo branch', () => {
    const log: string[] = [];
    const h = new History();
    const e = (n: string) => ({ label: n, bytes: 1, undo: () => log.push('-' + n), redo: () => log.push('+' + n) });
    h.push(e('a'));
    h.push(e('b'));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(e('c'));
    expect(h.canRedo).toBe(false);
    h.undo();
    h.undo();
    expect(h.canUndo).toBe(false);
    expect(log).toEqual(['-b', '-c', '-a']);
  });
  it('evicts old entries past the memory budget', () => {
    const h = new History(100);
    for (let i = 0; i < 5; i++) h.push({ label: '' + i, bytes: 40, undo() {}, redo() {} });
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(2);
  });
});

describe('Smoother', () => {
  it('reduces jitter and catches up at the end', () => {
    const s = new Smoother(0.6);
    const out = [];
    for (let i = 0; i < 20; i++) out.push(s.push({ x: i * 5, y: i % 2 ? 4 : -4, p: 1 }));
    const maxDev = Math.max(...out.slice(5).map((p) => Math.abs(p.y)));
    expect(maxDev).toBeLessThan(4);
    const tail = s.finish();
    const last = tail[tail.length - 1];
    expect(Math.hypot(last.x - 95, last.y - 4)).toBeLessThan(1);
  });
  it('passes points through when strength is 0', () => {
    const s = new Smoother(0);
    s.push({ x: 0, y: 0, p: 1 });
    expect(s.push({ x: 10, y: 5, p: 1 })).toMatchObject({ x: 10, y: 5 });
  });
});

describe('Viewport', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const v = new Viewport();
    v.offsetX = 30;
    v.offsetY = 40;
    const before = v.toDoc(200, 150);
    v.zoomAt(3, 200, 150);
    const after = v.toDoc(200, 150);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });
});

describe('outlineToSvgPath', () => {
  it('builds a closed quadratic path', () => {
    const d = outlineToSvgPath([[0, 0], [10, 0], [10, 10]]);
    expect(d.startsWith('M0.00,0.00 Q')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});

import { traceMask, signedArea } from '../src/engine/vector/fillRegion';
import { VectorStroke } from '../src/engine/vector/VectorItem';

describe('traceMask', () => {
  it('traces a ring as an outer loop and a hole with opposite winding', () => {
    // 5x5 square with the center pixel empty
    const w = 5, h = 5;
    const m = new Uint8Array(w * h).fill(1);
    m[2 * w + 2] = 0;
    const loops = traceMask(m, w, h);
    expect(loops).toHaveLength(2);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(-1); // hole
    expect(areas[1]).toBeCloseTo(25); // outer
    // collinear points removed: outer square has 4 corners
    expect(loops.find((l) => Math.abs(signedArea(l)) === 25)!.length).toBe(4);
  });
  it('returns separate loops for separate blobs', () => {
    const m = new Uint8Array([1, 0, 1]);
    expect(traceMask(m, 3, 1)).toHaveLength(2);
  });
});

describe('VectorStroke.transformed', () => {
  const style = { color: '#000', size: 10, opacity: 1, thinning: 0, simulatePressure: false };
  it('moves points and scales width by the area factor', () => {
    const s = new VectorStroke([[0, 0, 1], [10, 0, 0.5]], style);
    const t = s.transformed([2, 0, 0, 2, 5, 1]);
    expect(t.points).toEqual([[5, 1, 1], [25, 1, 0.5]]);
    expect(t.style.size).toBeCloseTo(20);
    expect(t.id).toBe(s.id);
    expect(s.points[1]).toEqual([10, 0, 0.5]); // original untouched
  });
  it('keeps width under rotation and mirroring', () => {
    const s = new VectorStroke([[1, 0, 1]], style);
    expect(s.transformed([0, 1, -1, 0, 0, 0]).style.size).toBeCloseTo(10);
    expect(s.transformed([-1, 0, 0, 1, 0, 0]).style.size).toBeCloseTo(10);
  });
});

import { openLite, LiteFormatError } from '../src/engine/io/liteFormat';
import { strToU8, zipSync } from 'fflate';

describe('openLite rejects bad files', () => {
  const zipWith = (manifest: unknown) => zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) });
  it('rejects non-zip data', async () => {
    await expect(openLite(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(LiteFormatError);
  });
  it('rejects a zip without a manifest', async () => {
    await expect(openLite(zipSync({ 'a.txt': strToU8('hi') }))).rejects.toThrow(/no manifest/);
  });
  it('rejects other formats, newer versions and bad sizes', async () => {
    await expect(openLite(zipWith({ format: 'other' }))).rejects.toThrow(/isn't a DLite/);
    await expect(openLite(zipWith({ format: 'dlite', version: 99, width: 10, height: 10, layers: [{}] }))).rejects.toThrow(/newer version/);
    await expect(openLite(zipWith({ format: 'dlite', version: 1, width: 0, height: 10, layers: [{}] }))).rejects.toThrow(/canvas size/);
    await expect(openLite(zipWith({ format: 'dlite', version: 1, width: 10, height: 10, layers: [] }))).rejects.toThrow(/no layers/);
  });
});

describe('History.stateId', () => {
  it('returns to the saved id after undo and changes after a new edit', () => {
    const h = new History();
    const e = () => ({ label: '', bytes: 1, undo() {}, redo() {} });
    const start = h.stateId;
    h.push(e());
    const saved = h.stateId;
    expect(saved).not.toBe(start);
    h.push(e());
    h.undo();
    expect(h.stateId).toBe(saved);
    h.undo();
    expect(h.stateId).toBe(start);
    h.redo();
    h.push(e()); // branch: different from anything before
    expect([start, saved]).not.toContain(h.stateId);
  });
});

import { embedUrl, parseYouTube } from '../src/ui/youtube';

describe('parseYouTube', () => {
  const id = 'dQw4w9WgXcQ';
  it('understands common link shapes', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${id}`,
      `youtube.com/watch?v=${id}&feature=share`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/embed/${id}`,
      id,
    ]) expect(parseYouTube(link)?.video, link).toBe(id);
  });
  it('keeps start time and playlist', () => {
    expect(parseYouTube(`https://youtu.be/${id}?t=1m30s`)).toEqual({ video: id, start: 90 });
    const p = parseYouTube('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')!;
    expect(p.list).toBe('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
    expect(embedUrl(p)).toContain('/embed/videoseries?');
  });
  it('rejects other sites and junk', () => {
    expect(parseYouTube('https://vimeo.com/123')).toBeNull();
    expect(parseYouTube('https://evil.com/watch?v=' + id)).toBeNull();
    expect(parseYouTube('hello world')).toBeNull();
    expect(parseYouTube('https://www.youtube.com/watch?v=short')).toBeNull();
  });
  it('builds a privacy-enhanced embed URL', () => {
    expect(embedUrl({ video: id, start: 5 })).toBe(`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&start=5`);
  });
});
