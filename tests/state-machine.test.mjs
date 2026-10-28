import test from 'node:test'; import assert from 'node:assert/strict'; import { STEPS, nextStep, canTransition } from '../src/core/state-machine.mjs';
import { buildAmapUrl, selectWaypoints } from '../src/core/gpx-route.mjs';
test('P0 steps are ordered and terminal', () => { assert.equal(nextStep('CHECK_PAGE'), 'ENTER_ROUTE_PLANNER'); assert.equal(nextStep('DONE'), null); assert.equal(canTransition('VERIFY_END','ADD_WAYPOINT'), true); assert.equal(canTransition('SET_END','SET_START'), false); assert.equal(canTransition('SET_END','FAILED'), true); });
test('waypoint selection respects the Amap limit and preserves order', () => {
  const points = Array.from({ length: 500 }, (_, i) => ({ lat: 31 + i * 0.0001, lon: 121 + Math.sin(i / 15) * 0.002 }));
  const waypoints = selectWaypoints(points, 16);
  assert.ok(waypoints.length <= 16);
  assert.ok(waypoints.every((point, i) => point === points.slice(1, -1).find((candidate) => candidate === point)));
  assert.match(buildAmapUrl(points), /^https:\/\/www\.amap\.com\/ssr\/dir\?/);
});
