// Data module: the only place the UI reads campus data from.
import { buildGraph, findRoute } from './routeFinder.js';

const DATA_URL = new URL('../data/places.json', import.meta.url);
let data = null;
let graph = null;

export async function loadData(force = false) {
  if (data && !force) return data;
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Could not read places.json (HTTP ${res.status})`);
  setData(await res.json());
  return data;
}

// Lets tests (Node) supply the data without fetch.
export function setData(d) { data = d; graph = buildGraph(d); }

function need() {
  if (!data) throw new Error('Data not loaded. Call loadData() first.');
  return data;
}

export const getCampusName = () => need().campus;
export const getCategories = () => [...need().categories];
export const getPlaces = () => [...need().places];
export const getPlaceById = (placeId) => need().places.find((p) => p.placeId === placeId) ?? null;
export const getNode = (id) => { need(); return graph.nodes.get(id) ?? null; }; // place or junction
export const getStats = () => ({ places: need().places.length, junctions: need().junctions.length, walkways: need().edges.length });

export function filterByCategory(categoryId) {
  if (!categoryId || categoryId === 'all') return getPlaces();
  return need().places.filter((p) => p.category === categoryId);
}

// Case-insensitive; matches any part of the name or the category (id or label).
export function searchPlaces(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return getPlaces();
  const labels = new Map(need().categories.map((c) => [c.categoryId, c.label.toLowerCase()]));
  return need().places.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    (labels.get(p.category) ?? '').includes(q));
}

// Returns { ok:true, nodeIds, steps, totalMeters, minutes } or { ok:false, error, message }.
export function getRoute(startId, endId, options = {}) {
  need();
  return findRoute(graph, startId, endId, options);
}
