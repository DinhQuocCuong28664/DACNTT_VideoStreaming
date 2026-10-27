/**
 * In-memory stand-in for the ViewMark model, answering updateOne the way
 * MongoDB answers the upsert in videoService.claimViewSlot:
 * - no mark: insert, upsertedCount 1
 * - expired mark: the filter matches, the mark is renewed, modifiedCount 1
 * - mark still in its window: the filter misses, the insert collides on _id,
 *   duplicate key error 11000
 *
 * Use from a test file:
 *   jest.mock('../src/models/ViewMark', () => require('./helpers/fakeViewMark'));
 */
const marks = new Map();

const updateOne = jest.fn(async (filter, update, options) => {
  const expiresAt = update.$set.expiresAt;
  const existing = marks.get(filter._id);
  if (existing === undefined) {
    if (!options || !options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    marks.set(filter._id, expiresAt);
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
  }
  if (existing <= filter.expiresAt.$lte) {
    marks.set(filter._id, expiresAt);
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }
  const error = new Error(`E11000 duplicate key error collection: viewmarks index: _id_ dup key: { _id: "${filter._id}" }`);
  error.code = 11000;
  throw error;
});

const reset = () => {
  marks.clear();
  updateOne.mockClear();
};

module.exports = { updateOne, reset, marks };
