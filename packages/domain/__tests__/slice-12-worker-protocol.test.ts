import type { WorkerMessage, WorkerResult } from '../worker-protocol.ts';
import {
  isValidWorkerMessage,
  isValidWorkerResult,
  checkRevision,
} from '../worker-protocol.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Test 1: Worker message types serialize/deserialize
const msg: WorkerMessage<string> = {
  requestId: 'req-1',
  type: 'import',
  payload: 'test payload',
};
assert(isValidWorkerMessage(msg), 'valid import message');
assert(msg.type === 'import', 'message type is import');

// Test 2: Cancel message type
const cancelMsg: WorkerMessage<null> = {
  requestId: 'req-2',
  type: 'cancel',
  payload: null,
};
assert(isValidWorkerMessage(cancelMsg), 'cancel message valid');

// Test 3: Progress result type
const progressResult: WorkerResult<null> = {
  requestId: 'req-3',
  type: 'progress',
  done: 50,
  total: 100,
  baseRevision: 10,
};
assert(isValidWorkerResult(progressResult), 'progress result valid');
assert(progressResult.done === 50 && progressResult.total === 100, 'progress values correct');

// Test 4: Stale revision rejected
assert(checkRevision(5, 5).stale === false, 'matching revisions not stale');
assert(checkRevision(5, 4).stale === true, 'mismatched revisions stale');

// Test 5: Result type
const result: WorkerResult<string> = {
  requestId: 'req-4',
  type: 'result',
  payload: 'done',
  revision: 11,
  baseRevision: 10,
};
assert(isValidWorkerResult(result), 'result message valid');
assert(result.revision === 11, 'revision correct');

// Test 6: Error type
const errorResult: WorkerResult<null> = {
  requestId: 'req-5',
  type: 'error',
  message: 'something failed',
  baseRevision: 10,
};
assert(isValidWorkerResult(errorResult), 'error result valid');

// Test 7: Cancelled type
const cancelledResult: WorkerResult<null> = {
  requestId: 'req-6',
  type: 'cancelled',
  baseRevision: 10,
};
assert(isValidWorkerResult(cancelledResult), 'cancelled result valid');

// Test 8: Invalid message rejected
assert(!isValidWorkerMessage(null), 'null is not a valid message');
assert(!isValidWorkerMessage({ requestId: 'x' }), 'missing type is invalid');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
