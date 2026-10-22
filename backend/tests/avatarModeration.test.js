const fs = require('fs');
const path = require('path');
const avatarModeration = require('../src/services/avatarModeration');

/** Reads the LABEL_POLICY object literal of the transcoder as plain text. */
const transcoderPolicy = () => {
  const source = fs.readFileSync(path.join(__dirname, '../../transcoder/src/moderation.js'), 'utf8');
  const block = source.slice(source.indexOf('const LABEL_POLICY = {'), source.indexOf('};', source.indexOf('const LABEL_POLICY = {')));
  const policy = {};
  for (const match of block.matchAll(/^\s*(?:'([^']+)'|([A-Za-z]+)):\s*'(block|review|ignore)'/gm)) {
    policy[match[1] || match[2]] = match[3];
  }
  return policy;
};

const fakeClient = (impl) => ({ send: jest.fn(impl) });

describe('Avatar screening', () => {
  const target = { bucket: 'static-bucket', key: 'avatars/u1/1790000000000.png' };
  const originalFlag = process.env.AVATAR_MODERATION_ENABLED;

  afterEach(() => {
    process.env.AVATAR_MODERATION_ENABLED = originalFlag;
    avatarModeration.setClientForTests(undefined);
  });

  it('uses the same label policy as the transcoder', () => {
    const fromTranscoder = transcoderPolicy();
    expect(Object.keys(fromTranscoder).length).toBeGreaterThan(10);
    expect(avatarModeration.LABEL_POLICY).toEqual(fromTranscoder);
  });

  it('reads the image from S3 with the avatar threshold', async () => {
    const client = fakeClient(async () => ({ ModerationLabels: [] }));
    avatarModeration.setClientForTests(client);

    const verdict = await avatarModeration.checkAvatar(target);

    expect(verdict).toEqual({ allowed: true, labels: [] });
    const input = client.send.mock.calls[0][0].input;
    expect(input).toEqual({
      Image: { S3Object: { Bucket: 'static-bucket', Name: 'avatars/u1/1790000000000.png' } },
      MinConfidence: 60,
    });
  });

  it('refuses a picture with a label the video policy would remove or review', async () => {
    avatarModeration.setClientForTests(
      fakeClient(async () => ({
        ModerationLabels: [
          { Name: 'Violence', ParentName: '', Confidence: 91 },
          { Name: 'Graphic Violence', ParentName: 'Violence', Confidence: 88 },
        ],
      }))
    );

    const verdict = await avatarModeration.checkAvatar(target);

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('labels');
    expect(verdict.labels).toContain('Graphic Violence');
  });

  it('holds review-level labels to the same bar as block-level ones', async () => {
    avatarModeration.setClientForTests(
      fakeClient(async () => ({
        ModerationLabels: [{ Name: 'Non-Explicit Nudity', ParentName: '', Confidence: 75 }],
      }))
    );
    expect((await avatarModeration.checkAvatar(target)).allowed).toBe(false);
  });

  it('accepts a parent label whose children are all ignored, such as a bare male chest', async () => {
    avatarModeration.setClientForTests(
      fakeClient(async () => ({
        ModerationLabels: [
          { Name: 'Non-Explicit Nudity', ParentName: '', Confidence: 80 },
          { Name: 'Exposed Male Nipple', ParentName: 'Non-Explicit Nudity', Confidence: 80 },
        ],
      }))
    );
    expect((await avatarModeration.checkAvatar(target)).allowed).toBe(true);
  });

  it('accepts ignored labels and labels below the threshold', () => {
    expect(
      avatarModeration.violatingLabels([
        { Name: 'Weapons', ParentName: 'Violence', Confidence: 99 },
        { Name: 'Explicit Nudity', ParentName: 'Explicit', Confidence: 40 },
        { Name: 'Alcohol', ParentName: 'Drugs & Tobacco & Alcohol', Confidence: 99 },
      ])
    ).toEqual([]);
  });

  it('refuses a file that Rekognition cannot read', async () => {
    for (const name of ['InvalidImageFormatException', 'ImageTooLargeException', 'InvalidParameterException']) {
      avatarModeration.setClientForTests(
        fakeClient(async () => {
          throw Object.assign(new Error('bad image'), { name });
        })
      );
      expect(await avatarModeration.checkAvatar(target)).toEqual({ allowed: false, reason: 'unreadable', labels: [] });
    }
  });

  it('fails closed with 503 when the service is unavailable', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    avatarModeration.setClientForTests(
      fakeClient(async () => {
        throw Object.assign(new Error('slow down'), { name: 'ThrottlingException' });
      })
    );

    await expect(avatarModeration.checkAvatar(target)).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'AVATAR_CHECK_UNAVAILABLE',
    });
    spy.mockRestore();
  });

  it('can be switched off for local development only by an explicit false', async () => {
    const client = fakeClient(async () => ({ ModerationLabels: [] }));
    avatarModeration.setClientForTests(client);

    process.env.AVATAR_MODERATION_ENABLED = 'false';
    expect(await avatarModeration.checkAvatar(target)).toEqual({ allowed: true, labels: [] });
    expect(client.send).not.toHaveBeenCalled();

    process.env.AVATAR_MODERATION_ENABLED = '';
    await avatarModeration.checkAvatar(target);
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
