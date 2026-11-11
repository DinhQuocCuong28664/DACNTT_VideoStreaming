const { summariseDrop } = require('./collect');

// Page events use the recorder's clock in seconds; requests use wall-clock ms.
const DROP_WALL = 1_000_000;

const events = [
  { t: 1.0, type: 'levelSwitched', height: 480 },
  { t: 2.0, type: 'playing' },
  { t: 21.0, type: 'networkDrop', to: 'slow3g' },
  { t: 44.5, type: 'levelSwitched', height: 240 },
];

const requests = [
  { rendition: '144p', file: 'seg_00000.ts', wallMs: DROP_WALL - 20_000 },
  { rendition: '480p', file: 'seg_00000.ts', wallMs: DROP_WALL - 19_000 },
  { rendition: '480p', file: 'seg_00004.ts', wallMs: DROP_WALL - 1_000 },
  { rendition: '480p', file: 'seg_00005.ts', wallMs: DROP_WALL + 2_000 },
  { rendition: '240p', file: 'seg_00006.ts', wallMs: DROP_WALL + 9_500 },
];

describe('summariseDrop', () => {
  test('reports the rung before, when a lower rung was requested and when it was shown', () => {
    expect(summariseDrop(events, requests, DROP_WALL)).toEqual({
      heightBefore: 480,
      requestedHeightBefore: 480,
      downloadSwitchSec: 9.5,
      requestedHeightAfter: 240,
      displaySwitchSec: 23.5,
      heightAfter: 240,
      shownAfterDrop: [{ sec: 23.5, height: 240 }],
      stallsAfterDrop: 0,
    });
  });

  test('skips buffered content that comes on screen at a higher rung after the drop', () => {
    const upThenDown = [
      { t: 1.0, type: 'levelSwitched', height: 360 },
      { t: 21.0, type: 'networkDrop', to: 'slow3g' },
      { t: 22.8, type: 'levelSwitched', height: 480 },
      { t: 50.0, type: 'levelSwitched', height: 360 },
    ];
    const reqs = [
      { rendition: '360p', file: 'seg_00000.ts', wallMs: DROP_WALL - 15_000 },
      { rendition: '480p', file: 'seg_00002.ts', wallMs: DROP_WALL - 5_000 },
      { rendition: '480p', file: 'seg_00004.ts', wallMs: DROP_WALL + 3_000 },
      { rendition: '360p', file: 'seg_00005.ts', wallMs: DROP_WALL + 14_800 },
    ];
    const result = summariseDrop(upThenDown, reqs, DROP_WALL);
    expect(result.heightBefore).toBe(360);
    expect(result.displaySwitchSec).toBe(29);
    expect(result.heightAfter).toBe(360);
    expect(result.downloadSwitchSec).toBe(14.8);
    expect(result.requestedHeightAfter).toBe(360);
    expect(result.shownAfterDrop).toEqual([{ sec: 1.8, height: 480 }, { sec: 29, height: 360 }]);
  });

  test('counts waiting events after the drop as stalls, not those before it', () => {
    const withStalls = [...events, { t: 1.5, type: 'waiting' }, { t: 30, type: 'waiting' }, { t: 31, type: 'playing' }];
    expect(summariseDrop(withStalls, requests, DROP_WALL).stallsAfterDrop).toBe(1);
  });

  test('leaves the switch null when the player never moved down', () => {
    const noSwitch = events.filter((e) => e.height !== 240);
    const sameRung = requests.filter((r) => r.rendition !== '240p');
    const result = summariseDrop(noSwitch, sameRung, DROP_WALL);
    expect(result.displaySwitchSec).toBeNull();
    expect(result.downloadSwitchSec).toBeNull();
    expect(result.heightAfter).toBeNull();
  });

  test('returns null for a run without a drop', () => {
    expect(summariseDrop(events.filter((e) => e.type !== 'networkDrop'), requests, DROP_WALL)).toBeNull();
    expect(summariseDrop(events, requests, null)).toBeNull();
  });
});
