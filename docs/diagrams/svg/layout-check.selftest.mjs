/**
 * Tự kiểm tra bước kiểm bố cục của render.mjs.
 *
 * Bước kiểm chỉ có ích nếu nó thật sự bắt được lỗi cũ. Các tình huống dưới đây dựng lại đúng
 * những lỗi từng xuất hiện ở hình kiến trúc, và xác nhận rằng huy hiệu số xử lý được chúng.
 *
 *   node --test docs/diagrams/svg/layout-check.selftest.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { card, group, edge, text, document_, enableLayoutCheck, resetLayoutState } from './render.mjs';

const build = (draw) => {
  resetLayoutState();
  enableLayoutCheck();
  const body = draw();
  return document_({ width: 600, height: 300, body });
};

/** Hai thẻ cách nhau 36px, như khe giữa S3 Raw và SQS trong tầng xử lý. */
const twoCards = () => ({
  a: card({ x: 40, y: 80, w: 170, h: 110, title: 'Source', sub: ['one'] }),
  b: card({ x: 246, y: 80, w: 170, h: 110, title: 'Queue', sub: ['two'] }),
});

test('nhãn chữ rộng hơn khe giữa hai thẻ bị báo là đè lên thẻ', () => {
  assert.throws(
    () => build(() => {
      const { a, b } = twoCards();
      return a.svg + b.svg + edge([[a.box.r, a.box.cy], [b.box.x, b.box.cy]], { label: '7  event notification' });
    }),
    /nhãn ".*" đè lên thẻ/,
  );
});

test('cùng khe đó, huy hiệu số được đặt lọt mà không đè gì', () => {
  const svg = build(() => {
    const { a, b } = twoCards();
    return a.svg + b.svg + edge([[a.box.r, a.box.cy], [b.box.x, b.box.cy]], { badge: 7 });
  });
  assert.match(svg, /<circle [^>]*r="13"/);
});

test('tiêu đề khung rộng hơn khung bị báo', () => {
  assert.throws(
    () => build(() => group({ x: 20, y: 20, w: 120, h: 100, label: 'Client and third-party services' }).svg),
    /tiêu đề khung .* rộng hơn chính khung/,
  );
});

test('cạnh đi xuyên một thẻ không liên quan bị báo', () => {
  assert.throws(
    () => build(() => {
      const { a, b } = twoCards();
      const wall = card({ x: 120, y: 220, w: 100, h: 60, title: 'Wall' });
      return a.svg + b.svg + wall.svg + edge([[a.box.cx, a.box.cy], [a.box.cx, 250], [400, 250]], { label: 'x' });
    }),
    /đi xuyên thẻ/,
  );
});

test('cạnh cắt tiêu đề khung bị báo', () => {
  assert.throws(
    () => build(() => {
      const g = group({ x: 20, y: 20, w: 300, h: 200, label: 'Zone' });
      return g.svg + edge([[60, 5], [60, 100]], { label: 'x' }) + text('', 0, 0);
    }),
    /cắt tiêu đề khung/,
  );
});
