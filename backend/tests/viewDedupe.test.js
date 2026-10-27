const mongoose = require('mongoose');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');
jest.mock('../src/models/ViewMark', () => require('./helpers/fakeViewMark'));

const Video = require('../src/models/Video');
const ViewMark = require('../src/models/ViewMark');
const videoService = require('../src/services/videoService');

const { claimViewSlot, VIEW_DEDUPE_WINDOW_MS } = videoService;

/**
 * The view dedupe window lives in MongoDB (viewmarks) so that every Lambda
 * instance sees the same marks. Before, each instance kept its own Map and a
 * viewer whose reloads reached different instances was counted on each.
 */
describe('claimViewSlot', () => {
  const T0 = new Date('2026-10-27T12:00:00Z');
  const at = (ms) => new Date(T0.getTime() + ms);

  beforeEach(() => ViewMark.reset());

  it('counts the first view and not a repeat inside the window', async () => {
    expect(await claimViewSlot('v1:ip:a', T0)).toBe(true);
    expect(await claimViewSlot('v1:ip:a', at(60 * 1000))).toBe(false);
  });

  it('counts again once the window has ended, even if the mark lingers', async () => {
    await claimViewSlot('v1:ip:a', T0);

    expect(await claimViewSlot('v1:ip:a', at(VIEW_DEDUPE_WINDOW_MS))).toBe(true);
  });

  it('does not extend the window with repeated views', async () => {
    await claimViewSlot('v1:ip:a', T0);
    await claimViewSlot('v1:ip:a', at(10 * 60 * 1000));

    expect(await claimViewSlot('v1:ip:a', at(VIEW_DEDUPE_WINDOW_MS))).toBe(true);
  });

  it('keeps viewers and videos apart', async () => {
    await claimViewSlot('v1:ip:a', T0);

    expect(await claimViewSlot('v1:ip:b', T0)).toBe(true);
    expect(await claimViewSlot('v2:ip:a', T0)).toBe(true);
  });

  it('sends one upsert that renews only an expired mark', async () => {
    await claimViewSlot('v1:u:42', T0);

    expect(ViewMark.updateOne).toHaveBeenCalledWith(
      { _id: 'v1:u:42', expiresAt: { $lte: T0 } },
      { $set: { expiresAt: at(VIEW_DEDUPE_WINDOW_MS) } },
      { upsert: true }
    );
  });

  it('passes on database errors other than the duplicate key', async () => {
    ViewMark.updateOne.mockRejectedValueOnce(Object.assign(new Error('not primary'), { code: 10107 }));

    await expect(claimViewSlot('v1:ip:a', T0)).rejects.toThrow('not primary');
  });
});

describe('registerView keeps no view state of its own', () => {
  const videoId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    ViewMark.reset();
    jest.clearAllMocks();
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: videoId, user: ownerId, status: 'READY', views: 10 }),
    });
    Video.findByIdAndUpdate.mockResolvedValue({ views: 11 });
  });

  it('decides from the database mark alone, which every instance shares', async () => {
    const first = await videoService.registerView(videoId, null, '203.0.113.9');
    const repeat = await videoService.registerView(videoId, null, '203.0.113.9');

    // Without the mark the same viewer counts again: nothing else remembered it.
    ViewMark.marks.clear();
    const afterMarkGone = await videoService.registerView(videoId, null, '203.0.113.9');

    expect([first.counted, repeat.counted, afterMarkGone.counted]).toEqual([true, false, true]);
    expect([...ViewMark.marks.keys()]).toEqual([`${videoId}:ip:203.0.113.9`]);
  });
});
