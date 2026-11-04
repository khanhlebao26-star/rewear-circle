import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Offline checks: render every review screen and exercise state changes without
// connecting to the project's server, database, authentication, or payment APIs.
const source = readFileSync(fileURLToPath(new URL('./app.js', import.meta.url)), 'utf8');
const listeners = {};
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', open: false,
    classList: { add() {}, remove() {} }, focus() {}, scrollIntoView() {}, addEventListener() {},
    showModal() { this.open = true; }, close() { this.open = false; } });
  return elements.get(key);
}
class TestFormData {
  constructor(form) { this.values = Object.entries(form.values || {}); }
  entries() { return this.values.values(); }
  getAll(key) { return this.values.filter(([k]) => k === key).map(([, v]) => v); }
  has(key) { return this.values.some(([k]) => k === key); }
}
let pageHash = '';
const context = vm.createContext({
  document: { querySelector: element, activeElement: null, addEventListener(name, fn) { listeners[name] = fn; } },
  window: { addEventListener() {}, scrollTo() {} },
  location: { get hash() { return pageHash; }, set hash(value) { pageHash = value && !value.startsWith('#') ? '#' + value : value; }, reload() {} },
  history: { replaceState() {} }, setTimeout() { return 0; }, clearTimeout() {},
  FormData: TestFormData, TextEncoder, URL, Intl, console,
});
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);
const screenList = run('screens');
for (const [, route, label, role] of screenList) {
  context.testRoute = route;
  context.testRole = role;
  run(`setRole(testRole); [state.route,state.id] = testRoute.split('/'); render();`);
  const html = element('#app').innerHTML;
  assert.ok(html.includes('id="main"'), label);
  assert.ok(!/\bundefined\b|\bNaN\b/.test(html), `${label}: invalid text`);
}
function submit(kind, values = {}, id) {
  const form = { dataset: { form: kind, id }, values };
  listeners.submit({ preventDefault() {}, target: { closest() { return form; } } });
}
run(`setRole('GUEST');state.route='home';state.id=null;render();`);
assert.ok(element('#app').innerHTML.includes('Sơ mi linen dáng rộng'), 'guests can browse public products');
assert.equal(run('state.route'), 'home', 'browsing does not redirect to login');
const homeMarkup = element('#app').innerHTML;
assert.equal((homeMarkup.match(/<article class="card">/g) || []).length, 8, 'home shows eight products');
const groups = homeMarkup.split('<section class="home-products"').slice(1);
assert.equal(groups.length, 2, 'home has two product sections');
assert.ok(groups.every(group => (group.match(/<article class="card">/g) || []).length === 4), 'each home section has four cards');
assert.equal(new Set([...homeMarkup.matchAll(/href="#\/detail\/([^"]+)"/g)].map(match => match[1])).size, 8, 'home sections do not repeat products');
assert.ok(!homeMarkup.includes('data-form="filters"'), 'home does not contain search or filters');
assert.ok(!homeMarkup.includes('class="pagination"'), 'home has no listing pagination');
const categoryTarget = { dataset: { category: 'Quần' } };
listeners.click({ preventDefault() {}, target: { closest(selector) {
  return selector === '[data-category]' ? categoryTarget : null;
} } });
run(`readRoute();render();`);
assert.equal(run('state.route'), 'listings', 'category navigation opens the listing page');
assert.equal(run('state.role'), 'GUEST', 'category browsing keeps guest role');
assert.equal(run('state.filters.category'), 'Quần', 'guests can filter by category');
assert.ok(element('#app').innerHTML.includes('Quần jeans xanh ống đứng'), 'category results are shown');
assert.equal(element('#modal').open, false, 'category browsing does not prompt login');
run(`state.filters={};`);
submit('filters', { q: 'linen', size: 'M', condition: '', minPrice: '100000', maxPrice: '200000' });
assert.equal(run('state.role'), 'GUEST', 'search keeps guest role');
assert.equal(run('state.filters.q'), 'linen', 'guests can search');
assert.ok(element('#app').innerHTML.includes('Sơ mi linen dáng rộng'), 'matching search result is shown');
assert.ok(!element('#app').innerHTML.includes('Quần jeans xanh ống đứng'), 'unmatched products are filtered out');
assert.equal(element('#modal').open, false, 'search does not prompt login');
assert.equal((run('home()').match(/<article class="card">/g) || []).length, 8, 'listing filters do not shrink home sections');
const allProductsTarget = { dataset: { category: '' } };
listeners.click({ preventDefault() {}, target: { closest(selector) {
  return selector === '[data-category]' ? allProductsTarget : null;
} } });
run(`readRoute();render();`);
assert.equal(Object.keys(run('state.filters')).length, 0, 'view all clears earlier listing filters');
assert.equal((element('#app').innerHTML.match(/<article class="card">/g) || []).length, 12, 'view all opens the complete listing');
run(`state.filters={};`);
run(`state.route='detail';state.id='L01';render();`);
assert.ok(element('#app').innerHTML.includes('Một chút về món đồ'), 'guests can read product details');
assert.equal(run('state.route'), 'detail', 'details do not redirect to login');
run(`state.route='cart';state.id=null;render();`);
assert.equal(run('state.route'), 'login', 'cart requires login');
run(`setRole('USER'); state.route='checkout'; state.cart=['L01','L02'];`);
submit('checkout', { fullName: 'Người nhận mẫu', phone: '0900000000', address: 'Địa chỉ minh họa trong prototype' });
assert.equal(run(`orders.filter(o=>o.createdInPrototype).length`), 2, 'split orders by seller');
assert.equal(run(`state.cart.length`), 0, 'clear checked-out items');
assert.equal(run(`getProduct('L01').status`), 'SOLD', 'COD closes buying rights');
assert.equal(run(`orders[0].payment`), 'UNPAID', 'COD does not imply collected');
run(`state.testOrder=orders.find(o=>o.createdInPrototype&&o.items.includes('L01')); getProduct('L01').title='Changed title';`);
assert.notEqual(run(`orderProduct(state.testOrder,'L01').title`), 'Changed title', 'order snapshot remains immutable');
submit('receipt', {}, 'RC-1042');
assert.equal(run(`getOrder('RC-1042').received`), false, 'active Case blocks receipt');
submit('cancel-order', {}, run('state.testOrder.id'));
assert.equal(run('state.testOrder.status'), 'CANCELLED', 'unshipped COD can cancel');
assert.equal(run(`getProduct('L01').status`), 'AVAILABLE', 'cancel releases eligible item');
submit('collection', { amount: 1 }, 'RC-2008');
assert.equal(run(`getOrder('RC-2008').payment`), 'UNPAID', 'reject wrong COD amount');
submit('collection', { amount: run(`total(getOrder('RC-2008'))`), note: 'Mẫu' }, 'RC-2008');
assert.equal(run(`getOrder('RC-2008').payment`), 'COLLECTED', 'seller records COD');
assert.equal(run(`getOrder('RC-2008').received`), false, 'collection does not imply receipt');
run(`setRole('ADMIN');`);
submit('assignment', { supportId: '' }, 'VV-0081');
assert.equal(run(`getCase('VV-0081').assigned`), null, 'unassign revokes Support visibility');
run(`setRole('SUPPORT'); state.route='supportCase';state.id='VV-0081';render();`);
assert.ok(element('#app').innerHTML.includes('Không thể xem vụ việc này'), 'Support loses read access');
run(`setRole('ADMIN');`);
submit('review', { decision: 'Từ chối phiên bản', reason: '' }, 'M02');
assert.equal(run(`getProduct('M02').pending`), true, 'rejection requires reason');
submit('review', { decision: 'Từ chối phiên bản', reason: 'Cần mô tả rõ lỗi' }, 'M02');
assert.equal(run(`getProduct('M02').review`), 'REJECTED', 'store moderation decision');
run(`setRole('USER');`);
submit('complaint', { reason: 'Chưa nhận được hàng', details: 'Nội dung bổ sung minh họa khác bản đầu.' }, 'RC-1042');
assert.equal(run(`getCase('VV-0081').records.length`), 2, 'retain separate complaint originals');
assert.notEqual(run(`getCase('VV-0081').records[0].details`), 'Nội dung bổ sung minh họa khác bản đầu.', 'do not overwrite first complaint');
run(`getCase('VV-0081').status='CLOSED';getCase('VV-0081').closedInPrototype=true;`);
assert.equal(run(`canComplain(getOrder('RC-1042'))`), false, 'closed case cooldown blocks immediate resubmission');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(source), 'no real server writes');
console.log(`PASS: ${screenList.length} screens render; COD, Case holds, permissions, snapshots, moderation, and offline boundaries verified.`);
