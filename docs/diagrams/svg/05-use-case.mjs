/**
 * Figure 3.1 - use case diagram of viewers.
 *
 * Three human actors and one external system:
 * - "Viewer" is the general actor of what anyone can do without an account (browse, search, watch,
 *   unlock, open a channel, share). "Anonymous visitor" and "Registered user" specialise it, drawn as
 *   UML actor generalisation (hollow triangle). Before, both actors were linked to the same six use
 *   cases, which doubled the lines and left the reader to compare two fans to see they were equal.
 * - "Google Identity" is a supporting actor of signing in: an external system the use case calls,
 *   like the "Credit card system" of the textbook example the owner chose.
 *
 * Each actor stands next to its own block of rows and its lines fan out to the left vertices of the
 * ellipses, so no line crosses another line or an ellipse.
 *
 * Canvas 1180 px printed at about 147 mm: 1 px = 0.125 mm, so 18 px type prints at 6.3 pt.
 */
import { document_, write } from './render.mjs';
import { defs, boundary, useCase, actor, assoc, rel, gen, note, labels } from './usecase-kit.mjs';

const SIZE = 18;
const W = 1180;
const H = 1462;
const p = [defs()];

const UC_X = 490;
const RX = 155;
const RY = 36;
const ROW = 84;
const FIRST = 118;
const at = (i) => FIRST + i * ROW;

p.push(boundary({ x: 250, y: 30, w: 760, h: 1325, title: 'Video sharing platform', size: SIZE }));

const uc = {};
const place = (key, i, label) => {
  uc[key] = useCase({ cx: UC_X, cy: at(i), rx: RX, ry: RY, label, size: SIZE });
  p.push(uc[key].svg);
};

// Anonymous visitor only
place('register', 0, 'Register an account');
place('login', 1, ['Sign in with a password', 'or with Google']);
// Any viewer
place('home', 2, 'Browse the home feed');
place('search', 3, ['Search videos and', 'channels']);
place('watch', 4, ['Watch a video', 'with adaptive bitrate']);
place('unlock', 5, ['Unlock a password-', 'protected video']);
place('channel', 6, 'Open a channel page');
place('share', 7, ['Share a link or', 'embed the player']);
// Registered user only
place('verify', 8, 'Verify the e-mail address');
place('reset', 9, ['Reset or change', 'the password']);
place('interact', 10, ['Like, comment', 'and reply']);
place('subscribe', 11, 'Subscribe to a channel');
place('member', 12, ['Join a channel', 'membership tier']);
place('library', 13, ['Keep history, watch', 'later and playlists']);
place('notify', 14, 'Read notifications');

const count = useCase({ cx: 860, cy: at(4), rx: 115, ry: RY, label: ['Resume and count', 'a view after 30 s'], size: SIZE });
p.push(count.svg);

const visitor = actor({ cx: 100, cy: at(0.5), label: ['Anonymous', 'visitor'], size: SIZE });
const viewer = actor({ cx: 100, cy: at(4.5), label: 'Viewer', size: SIZE });
const user = actor({ cx: 100, cy: at(11), label: ['Registered', 'user'], size: SIZE });
const google = actor({ cx: 1100, cy: at(1), label: ['Google', 'Identity'], size: SIZE });
p.push(visitor.svg, viewer.svg, user.svg, google.svg);

['register', 'login'].forEach((k) => p.push(assoc(visitor.r, uc[k].l)));
['home', 'search', 'watch', 'unlock', 'channel', 'share'].forEach((k) => p.push(assoc(viewer.r, uc[k].l)));
['verify', 'reset', 'interact', 'subscribe', 'member', 'library', 'notify'].forEach((k) => p.push(assoc(user.r, uc[k].l)));
p.push(assoc(google.l, uc.login.r));

p.push(gen([100, visitor.bottom + 6], [100, viewer.top - 2]));
p.push(gen([100, user.top - 6], [100, viewer.bottom + 2]));

p.push(rel([uc.watch.r, count.l], { kind: 'include', size: SIZE, dy: -17 }));

p.push(labels());
p.push(note(
  ['An anonymous visitor and a registered user are both viewers (hollow arrow: generalisation), so both',
   'can do the use cases of the middle block. Uploading and the creator studio are in Figure 3.2,',
   'moderation in Figure 3.3.'],
  40, 1398, SIZE));

const out = write('05-use-case', document_({ width: W, height: H, body: p.join('\n') }), 3);
console.log(`05-use-case -> ${(out.bytes / 1024).toFixed(0)} KB`);
