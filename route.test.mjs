import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setData, getRoute } from '../js/placesApi.js';
import { buildGraph, findRoute } from '../js/routeFinder.js';

const data = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'));
setData(data);
const dist = (a, b) => data.edges.find((e) => (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a)).distanceMeters;

test('1. adjacent places: Main Gate to Admissions Office', () => {
  const r = getRoute('p01', 'p02');
  assert.ok(r.ok);
  assert.deepEqual(r.nodeIds, ['p01', 'j01', 'p02']);
  assert.equal(r.totalMeters, dist('p01', 'j01') + dist('j01', 'p02'));
  assert.equal(r.steps.length, 2);
  assert.match(r.steps[0].text, /^Walk \d+ m north to Gate Plaza$/);
  assert.match(r.steps[1].text, /^Walk \d+ m .* to the Admissions Office entrance$/);
});

test('2. far places: Hostel Block A to Basketball Courts takes the shortest path', () => {
  const r = getRoute('p11', 'p15');
  assert.deepEqual(r.nodeIds, ['p11', 'j06', 'j03', 'j08', 'p15']);
  assert.equal(r.steps.length, 4);
  assert.equal(r.totalMeters, r.steps.reduce((s, x) => s + x.meters, 0));
  assert.equal(r.minutes, Math.max(1, Math.round(r.totalMeters / 80)));
});

test('3. same place and empty fields are rejected', () => {
  assert.equal(getRoute('p01', 'p01').error, 'same');
  assert.equal(getRoute('', 'p01').error, 'missing');
  assert.equal(getRoute('p01', '').error, 'missing');
  assert.equal(getRoute('p01', 'zzz').error, 'unknown');
});

test('4. unreachable: disconnected graph and step-free to Seminar Hall', () => {
  const g = buildGraph({
    places: [{ placeId: 'a', name: 'A', x: 0, y: 0 }, { placeId: 'b', name: 'B', x: 1, y: 1 }],
    junctions: [], edges: [],
  });
  assert.equal(findRoute(g, 'a', 'b').error, 'no-route');
  assert.ok(getRoute('p01', 'p16').ok);
  assert.equal(getRoute('p01', 'p16', { stepFree: true }).error, 'no-route');
});

test('5. step-free route avoids stair edges and is longer than the normal route', () => {
  const normal = getRoute('p19', 'p11');
  const free = getRoute('p19', 'p11', { stepFree: true });
  const hasEdge = (r, a, b) => r.nodeIds.some((n, i) => n === a && r.nodeIds[i + 1] === b);
  assert.ok(hasEdge(normal, 'j04', 'j06'));
  assert.ok(!hasEdge(free, 'j04', 'j06'));
  assert.ok(free.totalMeters > normal.totalMeters);
});

test('6. ties are broken by fewer steps', () => {
  const g = buildGraph({
    places: [{ placeId: 'A', name: 'A' }, { placeId: 'B', name: 'B' }],
    junctions: [{ junctionId: 'J', name: 'J' }, { junctionId: 'K', name: 'K' }, { junctionId: 'L', name: 'L' }],
    edges: [
      { fromId: 'A', toId: 'K', distanceMeters: 5, instruction: 'x', stepFree: true },
      { fromId: 'K', toId: 'L', distanceMeters: 5, instruction: 'x', stepFree: true },
      { fromId: 'L', toId: 'B', distanceMeters: 10, instruction: 'x', stepFree: true },
      { fromId: 'A', toId: 'J', distanceMeters: 10, instruction: 'x', stepFree: true },
      { fromId: 'J', toId: 'B', distanceMeters: 10, instruction: 'x', stepFree: true },
    ],
  });
  assert.deepEqual(findRoute(g, 'A', 'B').nodeIds, ['A', 'J', 'B']);
});

test('7. every pair of places is routable, symmetric and matches Floyd-Warshall', () => {
  const ids = [...data.places.map((p) => p.placeId), ...data.junctions.map((j) => j.junctionId)];
  const d = Object.fromEntries(ids.map((a) => [a, Object.fromEntries(ids.map((b) => [b, a === b ? 0 : Infinity]))]));
  for (const e of data.edges) d[e.fromId][e.toId] = d[e.toId][e.fromId] = e.distanceMeters;
  for (const k of ids) for (const i of ids) for (const j of ids) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
  for (const a of data.places) for (const b of data.places) {
    if (a.placeId === b.placeId) continue;
    const r = getRoute(a.placeId, b.placeId);
    assert.ok(r.ok, `${a.placeId}-${b.placeId}`);
    assert.equal(r.totalMeters, d[a.placeId][b.placeId], `${a.placeId}-${b.placeId}`);
    assert.equal(r.totalMeters, getRoute(b.placeId, a.placeId).totalMeters);
    assert.equal(r.steps.length, r.nodeIds.length - 1);
  }
});

test('8. the same pair always returns the same result (derived values are not stored)', () => {
  assert.deepEqual(getRoute('p04', 'p13'), getRoute('p04', 'p13'));
  assert.ok(!('minutes' in data.places[0]) && !('totalMeters' in data.edges[0]));
});
