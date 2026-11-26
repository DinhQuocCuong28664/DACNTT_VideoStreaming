/**
 * Figure 3.3 - use case diagram of moderation and operation.
 *
 * Two columns inside the boundary: on the left what users or the screening start, on the right the
 * work of staff. The actors of each column stand on its side, so no line crosses the other column.
 *
 * Changes against the earlier version, for UML correctness:
 * - The "Processing system" actor is gone: the screening is part of the platform (an actor must be
 *   outside the subject, UML 2.5.1, 18.1.3). Its supporting actor is Amazon Rekognition, the
 *   external service it calls; the screening itself is included in transcoding (Figure 3.2).
 * - "An administrator can do everything an operator or an auditor can" was only a note. It is now
 *   actor generalisation (hollow triangles), which says exactly that in UML. The arrow to the
 *   operator runs in a lane right of the auditor so it does not cross the auditor's figure.
 *
 * Canvas 1180 px printed at about 147 mm: 18 px type prints at 6.3 pt.
 */
import { document_, write } from './render.mjs';
import { defs, boundary, useCase, actor, assoc, rel, gen, note, labels } from './usecase-kit.mjs';

const SIZE = 18;
const W = 1180;
const H = 1300;
const p = [defs()];

const LX = 330;
const LRX = 125;
const RXC = 800;
const RRX = 140;
const RY = 36;
const R0 = 190;
const PITCH = 92;
const ry = (i) => R0 + i * PITCH;

p.push(boundary({ x: 170, y: 40, w: 800, h: 1136, title: 'Moderation and operation', size: SIZE }));

const right = {};
const placeR = (key, i, label) => {
  right[key] = useCase({ cx: RXC, cy: ry(i), rx: RRX, ry: RY, label, size: SIZE });
  p.push(right[key].svg);
};
// Operator
placeR('decide', 0, ['Approve or remove a video,', 'with a reason']);
placeR('confirm', 1, ['Confirm a removal', 'the machine made']);
placeR('appeal', 2, ['Resolve an appeal', 'with a note']);
placeR('label', 3, ['Label a video of', 'an audit sample']);
placeR('comment', 4, ['Dismiss or remove', 'a reported comment']);
// Auditor
placeR('rates', 5, ['Read the error rates', 'with their intervals']);
placeR('log', 6, 'Read the decision log');
// Administrator
placeR('sample', 7, ['Draw a random', 'audit sample']);
placeR('roles', 8, ['Assign or change', "a user's role"]);
placeR('overview', 9, ['Read the system', 'overview']);
placeR('switches', 10, ['Switch screening or', 'automatic captions']);

const left = {};
const placeL = (key, cy, label) => {
  left[key] = useCase({ cx: LX, cy, rx: LRX, ry: RY, label, size: SIZE });
  p.push(left[key].svg);
};
placeL('screen', 112, ['Screen frames of', 'an uploaded video']);
placeL('report', ry(0), 'Report a video');
placeL('appealOwn', ry(2), ['Appeal the removal or', "hold of one's own video"]);
placeL('reportComment', ry(4), 'Report a comment');

const rekognition = actor({ cx: 78, cy: 112, label: ['Amazon', 'Rekognition'], size: SIZE });
const user = actor({ cx: 78, cy: ry(2) + 18, label: ['Registered', 'user'], size: SIZE });
const operator = actor({ cx: 1090, cy: ry(2), label: 'Operator', size: SIZE });
const auditor = actor({ cx: 1090, cy: Math.round((ry(5) + ry(6)) / 2), label: 'Auditor', size: SIZE });
const admin = actor({ cx: 1090, cy: Math.round((ry(7) + ry(10)) / 2), label: 'Administrator', size: SIZE });
p.push(rekognition.svg, user.svg, operator.svg, auditor.svg, admin.svg);

p.push(assoc(rekognition.r, left.screen.l));
['report', 'appealOwn', 'reportComment'].forEach((k) => p.push(assoc(user.r, left[k].l)));
['decide', 'confirm', 'appeal', 'label', 'comment'].forEach((k) => p.push(assoc(operator.l, right[k].r)));
['rates', 'log'].forEach((k) => p.push(assoc(auditor.l, right[k].r)));
['sample', 'roles', 'overview', 'switches'].forEach((k) => p.push(assoc(admin.l, right[k].r)));

p.push(gen([1090, admin.top - 6], [1090, auditor.bottom + 4]));
p.push(gen([admin.r[0] + 4, admin.cy], [1162, admin.cy], [1162, operator.cy], [operator.r[0] + 2, operator.cy]));

p.push(labels());
p.push(note(
  ['Reporting and appealing are open to every signed-in user. An administrator is also an operator and an',
   'auditor (hollow arrows: generalisation). What screening holds back, what viewers report and what',
   "owners appeal reaches an operator's queue. Screening is included in transcoding (Figure 3.2)."],
  40, 1222, SIZE));

const out = write('10-use-case-staff', document_({ width: W, height: H, body: p.join('\n') }), 3);
console.log(`10-use-case-staff -> ${(out.bytes / 1024).toFixed(0)} KB`);
