/**
 * Figure 3.2 - use case diagram of creators.
 *
 * The earlier version had a "Processing system" actor. UML defines an actor as a role played by an
 * entity outside the subject (UML 2.5.1, 18.1.3), and the transcoding workflow is part of the
 * platform itself, so it cannot be an actor of the platform. The processing use cases are now tied
 * to the outside world the way UML allows:
 * - every upload «include»s the transcoding, which in turn «include»s screening and previews;
 * - notifying subscribers and automatic captions «extend» the transcoding (only when the video
 *   becomes public; captions only when the plan has them);
 * - "Time" is the actor of the scheduled publication, the usual way to model a clock trigger;
 * - Stripe, Amazon Rekognition and Amazon Transcribe are supporting actors: external systems the
 *   use cases call.
 *
 * Canvas 1180 px printed at about 147 mm: 18 px type prints at 6.3 pt.
 */
import { document_, write } from './render.mjs';
import { defs, boundary, useCase, actor, assoc, rel, note, labels } from './usecase-kit.mjs';

const SIZE = 18;
const W = 1180;
const H = 1372;
const p = [defs()];

const UC_X = 490;
const OFF_X = 860;
const RX = 155;
const OFF_RX = 115;
const RY = 36;
const ROW = 84;
const FIRST = 118;
const at = (i) => FIRST + i * ROW;

p.push(boundary({ x: 250, y: 30, w: 760, h: 1227, title: 'Video sharing platform', size: SIZE }));

const uc = {};
const place = (key, i, label, x = UC_X, rx = RX) => {
  uc[key] = useCase({ cx: x, cy: at(i), rx, ry: RY, label, size: SIZE });
  p.push(uc[key].svg);
};

// Creator
place('edit', 0, ['Edit details and', 'the thumbnail']);
place('captions', 1, ['Add captions', 'and chapters']);
place('schedule', 2, ['Schedule the', 'publication']);
place('analytics', 3, ['Read channel and', 'video analytics']);
place('profile', 4, ['Customise the', 'channel profile']);
place('tiers', 5, ['Manage membership', 'tiers']);
place('delete', 6, 'Delete a video');
place('plan', 7, ['Buy, change or', 'cancel a plan']);
place('upload', 8, ['Upload a video directly', 'to storage']);
place('visibility', 8, ['Set visibility', 'and audience'], OFF_X, OFF_RX);

// Started by events, not by a person
place('transcode', 9.6, ['Transcode to', 'encrypted HLS']);
place('screen', 9.6, ['Screen frames and', 'make previews'], OFF_X, OFF_RX);
place('notify', 11.2, ['Notify subscribers', 'of a new video']);
place('autocap', 11.2, ['Caption speech', 'automatically'], OFF_X, OFF_RX);
place('publish', 12.8, ['Publish at the', 'scheduled time']);

const creator = actor({ cx: 100, cy: at(4), label: 'Creator', size: SIZE });
const time = actor({ cx: 100, cy: at(12.8), label: 'Time', size: SIZE });
const stripe = actor({ cx: 1100, cy: 690, label: ['Payment', 'provider'], size: SIZE });
const rekognition = actor({ cx: 1100, cy: 850, label: ['Amazon', 'Rekognition'], size: SIZE });
const transcribe = actor({ cx: 1100, cy: 1100, label: ['Amazon', 'Transcribe'], size: SIZE });
p.push(creator.svg, time.svg, stripe.svg, rekognition.svg, transcribe.svg);

['edit', 'captions', 'schedule', 'analytics', 'profile', 'tiers', 'delete', 'plan', 'upload']
  .forEach((k) => p.push(assoc(creator.r, uc[k].l)));
p.push(assoc(time.r, uc.publish.l));
p.push(assoc(stripe.l, uc.plan.r));
p.push(assoc(rekognition.l, uc.screen.r));
p.push(assoc(transcribe.l, uc.autocap.r));

p.push(rel([uc.upload.r, uc.visibility.l], { kind: 'include', size: SIZE, dy: -17 }));
p.push(rel([uc.upload.b, uc.transcode.t], { kind: 'include', size: SIZE }));
p.push(rel([uc.transcode.r, uc.screen.l], { kind: 'include', size: SIZE, dy: -17 }));
p.push(rel([uc.notify.t, uc.transcode.b], { kind: 'extend', size: SIZE }));
p.push(rel([uc.autocap.l, uc.transcode.r], { kind: 'extend', size: SIZE }));
p.push(rel([uc.publish.t, uc.notify.b], { kind: 'include', size: SIZE }));

p.push(labels());
p.push(note(
  ['Transcoding has no actor of its own: every upload includes it, and it starts when the file reaches',
   'storage. Subscribers are notified, and speech is captioned if the plan allows it, when the video',
   'becomes public, after transcoding or at the scheduled time. The creator is the registered user of Figure 3.1.'],
  40, 1300, SIZE));

const out = write('20-use-case-creator', document_({ width: W, height: H, body: p.join('\n') }), 3);
console.log(`20-use-case-creator -> ${(out.bytes / 1024).toFixed(0)} KB`);
