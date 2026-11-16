// Shortest path on the walkway graph + step text. Pure functions: no DOM, no fetch.
export const WALKING_SPEED_M_PER_MIN = 80;

export function buildGraph(data) {
  const nodes = new Map();
  data.places.forEach((p) => nodes.set(p.placeId, { ...p, kind: 'place' }));
  data.junctions.forEach((j) => nodes.set(j.junctionId, { ...j, kind: 'junction' }));
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const e of data.edges) {
    if (!nodes.has(e.fromId) || !nodes.has(e.toId)) throw new Error(`Edge ${e.fromId} - ${e.toId} references a missing node`);
    if (!(e.distanceMeters > 0)) throw new Error(`Edge ${e.fromId} - ${e.toId} needs a positive distance`);
    const stepFree = e.stepFree !== false;
    adj.get(e.fromId).push({ to: e.toId, meters: e.distanceMeters, text: e.instruction, stepFree });
    adj.get(e.toId).push({
      to: e.fromId, meters: e.distanceMeters, stepFree,
      text: e.reverseInstruction ?? `Walk ${e.distanceMeters} m to ${nodes.get(e.fromId).name}`,
    });
  }
  return { nodes, adj };
}

const fail = (error, message) => ({ ok: false, error, message });
const better = (d, h, o) => !o || d < o.d || (d === o.d && h < o.h); // smaller distance, then fewer steps

export function findRoute(graph, startId, endId, { stepFree = false } = {}) {
  if (!startId || !endId) return fail('missing', 'Choose both a start and a destination.');
  if (startId === endId) return fail('same', 'Start and destination must be different.');
  if (!graph.nodes.has(startId) || !graph.nodes.has(endId)) return fail('unknown', 'One of the selected places is not on the campus map.');

  const best = new Map([[startId, { d: 0, h: 0, prev: null, edge: null }]]);
  const done = new Set();
  for (;;) {
    let cur = null;
    for (const [id, b] of best) {
      if (!done.has(id) && (!cur || b.d < cur.b.d || (b.d === cur.b.d && b.h < cur.b.h))) cur = { id, b };
    }
    if (!cur || cur.id === endId) break;
    done.add(cur.id);
    for (const e of graph.adj.get(cur.id)) {
      if (stepFree && !e.stepFree) continue;
      const d = cur.b.d + e.meters, h = cur.b.h + 1;
      if (better(d, h, best.get(e.to))) best.set(e.to, { d, h, prev: cur.id, edge: e });
    }
  }
  if (!best.has(endId)) return fail('no-route', 'No walkway connects these two places.');

  const nodeIds = [], steps = [];
  for (let id = endId; id; id = best.get(id).prev) {
    nodeIds.unshift(id);
    const e = best.get(id).edge;
    if (e) steps.unshift({ text: e.text, meters: e.meters });
  }
  const totalMeters = best.get(endId).d;
  return {
    ok: true, startId, endId, nodeIds, steps, totalMeters, stepFree,
    minutes: Math.max(1, Math.round(totalMeters / WALKING_SPEED_M_PER_MIN)),
  };
}
