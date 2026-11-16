import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setData, getPlaces, getPlaceById, searchPlaces, filterByCategory, getCategories } from '../js/placesApi.js';

const data = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8'));
setData(data);

test('dataset has 15-25 places and unique ids', () => {
  const ids = [...data.places.map((p) => p.placeId), ...data.junctions.map((j) => j.junctionId)];
  assert.ok(data.places.length >= 15 && data.places.length <= 25);
  assert.equal(new Set(ids).size, ids.length);
});

test('every place has all required fields, a valid category and 0-100 coordinates', () => {
  const cats = new Set(data.categories.map((c) => c.categoryId));
  for (const p of data.places) {
    for (const f of ['placeId', 'name', 'category', 'description', 'entranceNote']) assert.ok(p[f], `${p.placeId}.${f}`);
    assert.equal(typeof p.accessible, 'boolean');
    assert.ok(cats.has(p.category), p.placeId);
    assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, p.placeId);
  }
});

test('every edge references existing nodes and has a positive distance', () => {
  const nodes = new Set([...data.places.map((p) => p.placeId), ...data.junctions.map((j) => j.junctionId)]);
  for (const e of data.edges) {
    assert.ok(nodes.has(e.fromId) && nodes.has(e.toId), `${e.fromId}-${e.toId}`);
    assert.ok(e.distanceMeters > 0);
    assert.ok(e.instruction && e.reverseInstruction);
  }
});

test('getPlaces, getPlaceById and getCategories', () => {
  assert.equal(getPlaces().length, data.places.length);
  assert.equal(getPlaceById('p04').name, 'Main Library');
  assert.equal(getPlaceById('nope'), null);
  assert.equal(getCategories().length, 5);
});

test('searchPlaces is case-insensitive and matches partial names and categories', () => {
  assert.deepEqual(searchPlaces('LIB').map((p) => p.name), ['Main Library']);
  assert.equal(searchPlaces('food').length, 3);
  assert.equal(searchPlaces('zzz').length, 0);
  assert.equal(searchPlaces('  ').length, data.places.length);
});

test('filterByCategory', () => {
  assert.equal(filterByCategory('hostel').length, 2);
  assert.equal(filterByCategory('all').length, data.places.length);
  assert.equal(filterByCategory('unknown').length, 0);
});
