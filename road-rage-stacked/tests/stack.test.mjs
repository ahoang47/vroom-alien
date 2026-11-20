import { selfTest } from '../js/stack.js';
import { buildGarage, facesForward } from '../js/art.js';

const result = selfTest();
let failed = 0;
for (const check of result.checks) {
  const mark = check.pass ? 'ok' : 'FAIL';
  console.log(`${mark}  ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  if (!check.pass) failed++;
}

const garage = buildGarage();
if (!facesForward(garage.player)) {
  console.log('FAIL  player art faces forward');
  failed++;
} else {
  console.log('ok  player art faces forward');
}
for (const sheet of garage.rivals) {
  if (!facesForward(sheet)) {
    console.log('FAIL  a rival sheet faces backward');
    failed++;
    break;
  }
}
for (const sheet of garage.traffic) {
  if (!facesForward(sheet)) {
    console.log('FAIL  a traffic sheet faces backward');
    failed++;
    break;
  }
}

if (failed) {
  console.error(`${failed} sprite-stack check(s) failed`);
  process.exit(1);
}
console.log(`all ${result.checks.length + 1} checks passed`);
