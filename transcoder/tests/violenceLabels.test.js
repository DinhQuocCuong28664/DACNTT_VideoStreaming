const { evaluateFrames } = require('../src/moderation');
const { isViolenceLabel } = require('../src/dbHandler');

/**
 * The violence warning against the real Rekognition moderation taxonomy (v7,
 * https://docs.aws.amazon.com/rekognition/latest/dg/moderation-api.html), run
 * through the same frame evaluation the transcoder uses, so the labels look
 * exactly as they are stored on the video.
 */

const SETTINGS = { interval: 5, maxFrames: 120, reviewConfidence: 60, blockConfidence: 90, minCoverage: 0.8, concurrency: 3 };
const label = (Name, Confidence, ParentName, TaxonomyLevel) => ({ Name, Confidence, ParentName, TaxonomyLevel });
const storedLabels = (labels) => evaluateFrames([{ timestamp: 2.5, labels, contentTypes: [] }], { ...SETTINGS, framesPlanned: 1 }).labels;

const L3_UNDER_GRAPHIC_VIOLENCE = ['Weapon Violence', 'Physical Violence', 'Self-Harm', 'Blood & Gore', 'Explosions and Blasts'];

describe('isViolenceLabel on stored moderation labels', () => {
  it.each(L3_UNDER_GRAPHIC_VIOLENCE)('flags "%s" returned without its parents', (name) => {
    const labels = storedLabels([label(name, 95, 'Graphic Violence', 3)]);

    expect(labels.map((l) => l.name)).toEqual([name]);
    expect(labels.some(isViolenceLabel)).toBe(true);
    // The rule it replaces looked for parent "Violence" only.
    const previousRule = (l) => l.name === 'Violence' || l.name === 'Graphic Violence' || l.parentName === 'Violence';
    expect(labels.some(previousRule)).toBe(false);
  });

  it('flags the full hierarchy Rekognition usually returns', () => {
    const labels = storedLabels([
      label('Violence', 97, '', 1),
      label('Graphic Violence', 96, 'Violence', 2),
      label('Blood & Gore', 94, 'Graphic Violence', 3),
    ]);

    expect(labels.some(isViolenceLabel)).toBe(true);
  });

  it('does not flag a visible weapon alone, which moderation ignores', () => {
    expect(storedLabels([label('Violence', 92, '', 1), label('Weapons', 92, 'Violence', 2)]).some(isViolenceLabel)).toBe(false);
  });

  it('does not flag labels from other branches', () => {
    const labels = storedLabels([
      label('Drugs & Tobacco', 93, '', 1),
      label('Drugs & Tobacco Paraphernalia & Use', 93, 'Drugs & Tobacco', 2),
      label('Smoking', 93, 'Drugs & Tobacco Paraphernalia & Use', 3),
      label('Visually Disturbing', 91, '', 1),
      label('Death and Emaciation', 91, 'Visually Disturbing', 2),
    ]);

    expect(labels.some(isViolenceLabel)).toBe(false);
  });
});
