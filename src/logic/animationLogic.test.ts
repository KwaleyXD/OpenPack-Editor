import { describe, expect, it } from "vitest";
import { DEFAULT_TEXTURES, getTextureAnimation } from "./assetManifest";
import { frameLayers, getFrameRect, onionFrameSteps, parseAnimation, readFrame, writeFrame } from "./animationLogic";

describe("animation metadata and frame layout", () => {
  it("only treats animation metadata as an animation, not tall PNGs or texture settings", () => {
    expect(parseAnimation(undefined, 16, 512)).toBeNull();
    expect(parseAnimation('{"texture":{"blur":false}}', 16, 512)).toBeNull();
    expect(getTextureAnimation("entity/creeper/creeper.png")).toBeNull();
  });

  it("handles all bundled animations at their native sizes", () => {
    const sources = DEFAULT_TEXTURES.filter(({ metadata }) => metadata && JSON.parse(metadata).animation);
    expect(sources.length).toBeGreaterThan(60);
    for (const source of sources) {
      const animation = getTextureAnimation(source.path)!;
      expect(animation).not.toBeNull();
      for (let step = 0; step < animation.frames.length; step++) {
        const rect = getFrameRect(animation, step);
        expect(rect.x + rect.width).toBeLessThanOrEqual(source.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(source.height);
      }
    }
  });

  it("reads explicit grid dimensions, playback ordering, repeat frames, and individual timing", () => {
    const animation = parseAnimation('{"animation":{"width":2,"height":1,"frametime":4,"frames":[2,{"index":0,"time":8},2,1]}}', 4, 2)!;
    expect(animation.frames).toEqual([{ index: 2, time: 4 }, { index: 0, time: 8 }, { index: 2, time: 4 }, { index: 1, time: 4 }]);
    expect(getFrameRect(animation, 0)).toEqual({ x: 0, y: 1, width: 2, height: 1 });
    expect(getFrameRect(animation, 3)).toEqual({ x: 2, y: 0, width: 2, height: 1 });
    expect(() => getFrameRect(animation, 4)).toThrow(RangeError);
  });

  it("infers horizontal/vertical square cells and supports one explicitly specified dimension", () => {
    expect(parseAnimation('{"animation":{}}', 48, 16)).toMatchObject({ width: 16, height: 16, columns: 3, rows: 1 });
    expect(parseAnimation('{"animation":{}}', 16, 48, 32, 96)).toMatchObject({ width: 32, height: 32, columns: 1, rows: 3 });
    expect(parseAnimation('{"animation":{"width":2}}', 4, 3)).toMatchObject({ width: 2, height: 3 });
    expect(parseAnimation('{"animation":{"height":2}}', 3, 4)).toMatchObject({ width: 3, height: 2 });
    expect(parseAnimation('{"animation":{"frames":[]}}', 16, 48)?.frames).toHaveLength(3);
  });

  it.each([
    '{"animation":null}', '{"animation":{"width":3}}', '{"animation":{"frametime":0}}',
    '{"animation":{"frames":"bad"}}', '{"animation":{"frames":[99]}}',
    '{"animation":{"frames":[{"index":0,"time":-1}]}}',
  ])("rejects malformed animation metadata %s", (metadata) => {
    expect(() => parseAnimation(metadata, 16, 48)).toThrow();
  });

  it("reads and writes individual cells without touching neighboring frame pixels", () => {
    const data = [["#111111", "#222222"], ["#333333", "#444444"]];
    const rect = { x: 1, y: 1, width: 1, height: 1 };
    const extracted = readFrame(data, rect);
    extracted[0][0] = "#abcdef";
    expect(data[1][1]).toBe("#444444");
    writeFrame(data, rect, extracted);
    expect(data).toEqual([["#111111", "#222222"], ["#333333", "#abcdef"]]);
    expect(() => writeFrame(data, rect, [])).toThrow();
    const layer = { id: "a", name: "Layer", visible: false, data };
    expect(frameLayers([layer], rect)).toEqual([{ ...layer, data: [["#abcdef"]] }]);
  });

  it("maps onion modes exactly and does not wrap at the playback boundaries", () => {
    expect(onionFrameSteps(1, 3, 0)).toEqual([]);
    expect(onionFrameSteps(1, 3, 1)).toEqual([0]);
    expect(onionFrameSteps(1, 3, 2)).toEqual([0, 2]);
    expect(onionFrameSteps(1, 3, 3)).toEqual([2]);
    expect(onionFrameSteps(0, 3, 1)).toEqual([]);
    expect(onionFrameSteps(2, 3, 2)).toEqual([1]);
    expect(onionFrameSteps(2, 3, 3)).toEqual([]);
    expect(() => onionFrameSteps(3, 3, 1)).toThrow(RangeError);
    expect(() => onionFrameSteps(0, 3, 4)).toThrow(RangeError);
  });
});
