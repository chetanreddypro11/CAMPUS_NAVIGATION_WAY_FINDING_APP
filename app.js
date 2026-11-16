import {
  loadData, getPlaces, getCategories, getPlaceById, getNode, getStats, getCampusName,
  searchPlaces, filterByCategory, getRoute,
} from './placesApi.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const isPhone = () => window.matchMedia('(max-width: 991.98px)').matches;
const toLatLng = (n) => [100 - n.y, n.x]; // map = 0-100 percentages, y runs top to bottom
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const state = { query: '', category: 'all', selectedId: null, route: null, favs: [], recent: [] };
const KEYS = { favs: 'campusway.favourites', recent: 'campusway.recent' };
const markers = new Map();
let map, markerLayer, routeLayer, view = 'places', mapFitted = false;

/* ---------- messages, toast ---------- */
function showAlert(box, parts, type = 'info') {
  box.replaceChildren();
  if (!parts) return;
  box.append(el('div', { className: `alert alert-${type} mb-2`, role: type === 'danger' ? 'alert' : 'status' }, ...parts));
}
function toast(text) {
  const t = el('div', { className: 'toast text-bg-dark', role: 'status' }, el('div', { className: 'toast-body', textContent: text }));
  $('#toasts').append(t);
  t.addEventListener('hidden.bs.toast', () => t.remove());
  new bootstrap.Toast(t, { delay: 2500 }).show();
}

/* ---------- LocalStorage (optional favourites + recent searches) ---------- */
function storageProblem() {
  const retry = el('button', { type: 'button', className: 'btn btn-sm btn-dark ms-2', textContent: 'Try again' });
  const reset = el('button', { type: 'button', className: 'btn btn-sm btn-outline-dark ms-2', textContent: 'Reset saved data' });
  retry.addEventListener('click', () => { showAlert($('#storage-alert'), null); loadSaved(); render(); });
  reset.addEventListener('click', () => {
    try { Object.values(KEYS).forEach((k) => localStorage.removeItem(k)); } catch { /* still blocked */ }
    state.favs = []; state.recent = []; showAlert($('#storage-alert'), null); render();
  });
  showAlert($('#storage-alert'), ['Saved places and recent searches could not be read or saved in this browser.', retry, reset], 'warning');
}
function readList(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
  catch { storageProblem(); return []; }
}
function writeList(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch { storageProblem(); } }
function loadSaved() {
  state.favs = readList(KEYS.favs).filter((id) => getPlaceById(id));
  state.recent = readList(KEYS.recent).filter((q) => typeof q === 'string').slice(0, 5);
}
function rememberSearch(q) {
  q = q.trim();
  if (q.length < 2) return;
  state.recent = [q, ...state.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5);
  writeList(KEYS.recent, state.recent);
}
function toggleFav(id) {
  state.favs = state.favs.includes(id) ? state.favs.filter((f) => f !== id) : [...state.favs, id];
  writeList(KEYS.favs, state.favs);
  render();
}

/* ---------- places list, filters ---------- */
const categoryLabel = (id) => getCategories().find((c) => c.categoryId === id)?.label ?? id;

function visiblePlaces() {
  const base = state.category === 'saved' ? state.favs.map(getPlaceById).filter(Boolean) : filterByCategory(state.category);
  const ids = new Set(base.map((p) => p.placeId));
  return searchPlaces(state.query).filter((p) => ids.has(p.placeId));
}

function renderList() {
  const places = visiblePlaces();
  const total = getPlaces().length;
  $('#count').textContent = places.length === total ? `${plural(total, 'place')}` : `${places.length} of ${plural(total, 'place')}`;
  $('#place-list').replaceChildren(...places.map((p) => {
    const b = el('button', { type: 'button', className: 'list-group-item list-group-item-action place-item' },
      el('span', { textContent: p.name }), el('br'), el('span', { className: 'place-cat', textContent: categoryLabel(p.category) }));
    if (p.placeId === state.selectedId) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => selectPlace(p.placeId, { fromList: true }));
    return el('li', { className: 'list-group-item p-0 border-0' }, b);
  }));
  if (places.length) { showAlert($('#message'), null); return; }
  if (state.category === 'saved' && !state.query && !state.favs.length) {
    showAlert($('#message'), ['You have not saved any places yet. Select a place and choose "Save place".']);
    return;
  }
  const reset = el('button', { type: 'button', className: 'btn btn-sm btn-dark ms-2', textContent: 'Clear search and filter' });
  reset.addEventListener('click', clearFilters);
  showAlert($('#message'), ['Nothing matched your search. Clear it or browse by category.', reset]);
}

function renderRecent() {
  const box = $('#recent');
  box.replaceChildren();
  if (!state.recent.length) return;
  const clear = el('button', { type: 'button', className: 'btn btn-link btn-sm', textContent: 'Clear recent' });
  clear.addEventListener('click', () => { state.recent = []; writeList(KEYS.recent, []); renderRecent(); });
  box.append(el('span', { className: 'small text-secondary me-1', textContent: 'Recent:' }),
    ...state.recent.map((q) => {
      const c = el('button', { type: 'button', className: 'chip chip-dark me-1 mb-1', textContent: q });
      c.addEventListener('click', () => { state.query = q; $('#search').value = q; render(); });
      return c;
    }), clear);
}

function clearFilters() {
  state.query = ''; state.category = 'all';
  $('#search').value = ''; $('#category').value = 'all';
  render();
}

/* ---------- selection + details card ---------- */
function renderCard() {
  const card = $('#place-card');
  const p = state.selectedId && getPlaceById(state.selectedId);
  if (!p || !visiblePlaces().some((v) => v.placeId === p.placeId)) { card.hidden = true; return; }
  const saved = state.favs.includes(p.placeId);
  const save = el('button', { type: 'button', className: 'btn btn-outline-secondary', textContent: saved ? 'Saved' : 'Save place' });
  save.setAttribute('aria-pressed', String(saved));
  save.addEventListener('click', () => toggleFav(p.placeId));
  const from = el('button', { type: 'button', className: 'btn btn-outline-secondary', textContent: 'Start from here' });
  from.addEventListener('click', () => setRouteEnds({ start: p.placeId }));
  const to = el('button', { type: 'button', className: 'btn btn-primary', textContent: 'Directions to here' });
  to.addEventListener('click', () => setRouteEnds({ end: p.placeId }));
  card.replaceChildren(el('div', { className: 'card-body' },
    el('h2', { className: 'h5 card-title', textContent: p.name }),
    el('span', { className: 'badge badge-cat mb-2', textContent: categoryLabel(p.category) }),
    el('p', { className: 'mb-2', textContent: p.description }),
    el('p', { className: 'mb-1' }, el('strong', { textContent: 'Entrance: ' }), p.entranceNote),
    el('p', { className: 'mb-3', textContent: p.accessible ? 'Step-free access available.' : 'Step-free access not confirmed.' }),
    el('div', { className: 'd-flex flex-wrap gap-2' }, to, from, save)));
  card.hidden = false;
}

function selectPlace(id, { fromList = false } = {}) {
  state.selectedId = id;
  if (state.query) rememberSearch(state.query);
  render();
  if (fromList && isPhone()) setView('map');
  else if (map && !state.route) map.panTo(toLatLng(getNode(id)));
}

/* ---------- map ---------- */
const fitCampus = () => map.fitBounds([[0, 0], [100, 100]]);
function fitRoute() {
  const line = routeLayer.getLayers().find((l) => l.getBounds);
  if (line) map.fitBounds(line.getBounds(), { padding: [48, 48] });
}

function initMap() {
  map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, zoomSnap: 0.25, scrollWheelZoom: false });
  L.imageOverlay('assets/campus-map.svg', [[0, 0], [100, 100]]).addTo(map);
  map.setMaxBounds([[-15, -15], [115, 115]]);
  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  for (const p of getPlaces()) {
    const m = L.marker(toLatLng(p), {
      title: p.name,
      icon: L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [44, 44], iconAnchor: [22, 22] }),
    }).bindTooltip(p.name, { direction: 'top', offset: [0, -14] });
    m.on('click', () => selectPlace(p.placeId));
    markers.set(p.placeId, m);
  }
  if (!isPhone()) { fitCampus(); mapFitted = true; }
}

function renderPins() {
  const r = state.route;
  const show = new Set(visiblePlaces().map((p) => p.placeId));
  if (r) { show.add(r.startId); show.add(r.endId); }
  markers.forEach((m, id) => {
    if (show.has(id)) { if (!markerLayer.hasLayer(m)) markerLayer.addLayer(m); } else markerLayer.removeLayer(m);
    const n = m.getElement();
    if (n) {
      n.classList.toggle('pin-selected', id === state.selectedId);
      n.classList.toggle('pin-start', !!r && id === r.startId);
      n.classList.toggle('pin-end', !!r && id === r.endId);
      n.setAttribute('aria-label', `${getPlaceById(id).name}, ${categoryLabel(getPlaceById(id).category)}`);
    }
    m.setZIndexOffset(id === state.selectedId || (r && (id === r.startId || id === r.endId)) ? 1000 : 0);
  });
}

function drawRoute() {
  routeLayer.clearLayers();
  if (!state.route) return;
  const pts = state.route.nodeIds.map((id) => toLatLng(getNode(id)));
  L.polyline(pts, { color: '#FFFFFF', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
  L.polyline(pts, { color: '#D6293E', weight: 5, dashArray: '10 8', lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer);
  if (!isPhone() || view === 'map') fitRoute();
}

/* ---------- views ---------- */
function setView(v) {
  if (v === 'map' && !isPhone()) v = 'places';
  view = v;
  for (const n of ['places', 'route', 'map']) {
    $(`#pane-${n}`).classList.toggle('is-active', n === v);
    const t = $(`#tab-${n}`);
    t.classList.toggle('active', n === v);
    t.setAttribute('aria-pressed', String(n === v));
  }
  if (v === 'map') {
    setTimeout(() => {
      map.invalidateSize();
      if (!mapFitted) { fitCampus(); mapFitted = true; }
      if (state.route) fitRoute();
      else if (state.selectedId) map.setView(toLatLng(getNode(state.selectedId)), Math.max(map.getZoom(), 2), { animate: false });
    }, 0);
  }
}

/* ---------- route planner ---------- */
function fillSelect(sel, placeholder) {
  sel.replaceChildren(el('option', { value: '', textContent: placeholder }));
  for (const c of getCategories()) {
    const g = el('optgroup', { label: c.label });
    getPlaces().filter((p) => p.category === c.categoryId).sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => g.append(el('option', { value: p.placeId, textContent: p.name })));
    if (g.children.length) sel.append(g);
  }
}
function fieldError(id, msg) {
  const f = $(`#${id}`);
  f.classList.toggle('is-invalid', !!msg);
  f.setAttribute('aria-invalid', String(!!msg));
  $(`#${id}-error`).textContent = msg || '';
}
function clearErrors() { fieldError('start', ''); fieldError('end', ''); showAlert($('#route-message'), null); }

function setRouteEnds({ start, end }) {
  if (start !== undefined) $('#start').value = start;
  if (end !== undefined) $('#end').value = end;
  if ($('#start').value && $('#start').value === $('#end').value) (start !== undefined ? $('#end') : $('#start')).value = '';
  setView('route');
  clearErrors();
  if ($('#start').value && $('#end').value) submitRoute();
  else (!$('#start').value ? $('#start') : $('#end')).focus();
}

function submitRoute(e) {
  if (e) e.preventDefault();
  const s = $('#start').value, d = $('#end').value, sf = $('#stepfree').checked;
  clearErrors();
  if (!s) fieldError('start', 'Choose a starting point.');
  if (!d) fieldError('end', 'Choose a destination.');
  else if (s === d) fieldError('end', 'Destination must be different from the start.');
  if (!s || !d || s === d) { clearRoute({ keepForm: true }); (!s ? $('#start') : $('#end')).focus(); return; }

  const r = getRoute(s, d, { stepFree: sf });
  if (!r.ok) {
    clearRoute({ keepForm: true });
    const a = getPlaceById(s).name, b = getPlaceById(d).name;
    const msg = r.error === 'no-route'
      ? (sf ? `No step-free route connects ${a} and ${b}. Turn off "Step-free route only" to see the shortest route.` : `No walkway connects ${a} and ${b}.`)
      : r.message;
    showAlert($('#route-message'), [msg], 'danger');
    return;
  }
  state.route = r;
  renderRoute(); drawRoute(); renderPins();
  try { history.replaceState(null, '', `?from=${s}&to=${d}${sf ? '&stepFree=1' : ''}`); } catch { /* ignore */ }
  $('#route-title').focus();
}

function renderRoute() {
  const r = state.route, box = $('#route-result');
  if (!r) { box.hidden = true; return; }
  const a = getPlaceById(r.startId), b = getPlaceById(r.endId);
  $('#route-title').textContent = `${a.name} to ${b.name}`;
  const stat = (t) => el('span', { className: 'stat', textContent: t });
  $('#route-stats').replaceChildren(stat(`${r.totalMeters} m`), stat(`About ${r.minutes} min walk`), stat(plural(r.steps.length, 'step')), ...(r.stepFree ? [stat('Step-free')] : []));
  $('#route-steps').replaceChildren(...r.steps.map((s) => el('li', {}, el('span', { textContent: s.text }))));
  $('#route-arrival').textContent = `You have arrived at ${b.name}. ${b.entranceNote}`;
  $('#route-status').textContent = `Route ready: ${plural(r.steps.length, 'step')}, ${r.totalMeters} metres, about ${r.minutes} minutes.`;
  box.hidden = false;
}

function clearRoute({ keepForm = false } = {}) {
  state.route = null;
  $('#route-result').hidden = true;
  $('#route-status').textContent = '';
  if (routeLayer) { routeLayer.clearLayers(); renderPins(); }
  if (!keepForm) {
    clearErrors();
    try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
  }
}

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast('Route link copied'); }
  catch { showAlert($('#route-message'), [`Copy this link: ${location.href}`]); }
}

function routeFromUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has('from') && !q.has('to')) return;
  const [s, d] = [q.get('from'), q.get('to')];
  setView('route');
  if (!getPlaceById(s) || !getPlaceById(d)) {
    showAlert($('#route-message'), ['This route link refers to a place that is not on the campus map. Choose a start and destination below.'], 'danger');
    return;
  }
  $('#start').value = s; $('#end').value = d; $('#stepfree').checked = q.get('stepFree') === '1';
  submitRoute();
}

/* ---------- render + start ---------- */
function render() { renderList(); renderRecent(); renderPins(); renderCard(); }

function setupStatic() {
  const pop = $('#popular');
  pop.replaceChildren(...['p01', 'p02', 'p04', 'p06', 'p09', 'p11', 'p13'].map(getPlaceById).filter(Boolean).map((p) => {
    const b = el('button', { type: 'button', className: 'chip', textContent: p.name });
    b.addEventListener('click', () => { setView('places'); selectPlace(p.placeId, { fromList: true }); $('#explore').scrollIntoView(); });
    return el('li', {}, b);
  }));
  $('#category').append(...getCategories().map((c) => el('option', { value: c.categoryId, textContent: c.label })), el('option', { value: 'saved', textContent: 'Saved places' }));
  fillSelect($('#start'), 'Choose a starting point');
  fillSelect($('#end'), 'Choose a destination');
  const s = getStats();
  $('#stats').textContent = `${s.places} places, ${s.junctions} junctions and ${s.walkways} walkways.`;
  document.title = `CampusWay | ${getCampusName()}`;
}

async function start() {
  showAlert($('#message'), [el('span', { className: 'spinner-border spinner-border-sm me-2' }), 'Loading campus data...']);
  try { await loadData(); }
  catch (err) {
    const retry = el('button', { type: 'button', className: 'btn btn-sm btn-dark ms-2', textContent: 'Try again' });
    retry.addEventListener('click', start);
    showAlert($('#message'), [`The campus data could not be read (${err.message}). If you opened the file directly, run it through a local server.`, retry], 'danger');
    return;
  }
  if (!getPlaces().length) {
    const reload = el('button', { type: 'button', className: 'btn btn-sm btn-dark ms-2', textContent: 'Reload sample data' });
    reload.addEventListener('click', () => loadData(true).then(() => location.reload()).catch(start));
    showAlert($('#message'), ['No places were loaded.', reload]);
    return;
  }
  if (!map) { setupStatic(); initMap(); }
  loadSaved();
  render();
  routeFromUrl();
}

$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); rememberSearch(state.query); renderRecent(); });
$('#search').addEventListener('input', (e) => { state.query = e.target.value; if (map) render(); });
$('#category').addEventListener('change', (e) => { state.category = e.target.value; if (map) render(); });
$('#route-form').addEventListener('submit', submitRoute);
$('#swap').addEventListener('click', () => {
  const s = $('#start'), d = $('#end');
  [s.value, d.value] = [d.value, s.value];
  clearErrors();
  if (state.route) submitRoute();
});
$('#clear-route').addEventListener('click', () => { $('#start').value = ''; $('#end').value = ''; $('#stepfree').checked = false; clearRoute(); });
$('#stepfree').addEventListener('change', () => { if (state.route) submitRoute(); });
$('#copy-link').addEventListener('click', copyLink);
$('#print-route').addEventListener('click', () => window.print());
$('#view-on-map').addEventListener('click', () => setView('map'));
for (const n of ['places', 'route', 'map']) $(`#tab-${n}`).addEventListener('click', () => setView(n));
document.querySelectorAll('[data-view]').forEach((a) => a.addEventListener('click', () => {
  setView(a.dataset.view);
  const c = bootstrap.Collapse.getInstance($('#nav'));
  if (c) c.hide();
}));
window.addEventListener('resize', () => { if (map) { map.invalidateSize(); setView(view); } });
start();
