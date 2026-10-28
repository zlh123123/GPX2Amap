export const STEPS = Object.freeze([
  'CHECK_PAGE', 'ENTER_ROUTE_PLANNER', 'SELECT_BICYCLING', 'SET_START',
  'VERIFY_START', 'SET_END', 'VERIFY_END', 'ADD_WAYPOINT',
  'VERIFY_WAYPOINT', 'WAIT_ROUTE_RESULT', 'VERIFY_ROUTE', 'DONE'
]);
export function nextStep(step) {
  const index = STEPS.indexOf(step);
  return index >= 0 && index + 1 < STEPS.length ? STEPS[index + 1] : null;
}
export function canTransition(from, to) {
  return from === to || nextStep(from) === to || to === 'FAILED' || to === 'NEED_USER_ACTION';
}
