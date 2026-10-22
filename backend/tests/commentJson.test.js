const mongoose = require('mongoose');
const Comment = require('../src/models/Comment');

// The real model, no database: building a document and serialising it needs
// no connection.
describe('Comment JSON sent to viewers', () => {
  const build = () =>
    new Comment({
      video: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      content: 'Nice video',
      replyCount: 2,
      openReports: 3,
    });

  it('leaves out the open report count', () => {
    const json = JSON.parse(JSON.stringify(build()));

    expect(json).not.toHaveProperty('openReports');
    expect(json).not.toHaveProperty('__v');
  });

  it('keeps the fields the comment list needs', () => {
    const json = JSON.parse(JSON.stringify(build()));

    expect(json).toMatchObject({ content: 'Nice video', replyCount: 2, parentComment: null });
  });

  it('still has the count on the document itself, for the staff queue', () => {
    expect(build().toObject().openReports).toBe(3);
  });
});
