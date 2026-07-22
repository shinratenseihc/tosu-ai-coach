const test = require('node:test');
const assert = require('node:assert/strict');
const { createRunTracker, difficultyAt, summarizeRunIncidents } = require('../lib/run-analysis.js');

function frame(time, hits = {}) {
  return { beatmap: { time: { live: time, firstObject: 1000, lastObject: 11000 } }, play: { hits } };
}

test('le tracker date les augmentations de miss et de slider break', () => {
  const tracker = createRunTracker();
  tracker.start(frame(1000, { 0: 0, sliderBreaks: 0 }));
  tracker.update(frame(6000, { 0: 1, sliderBreaks: 0 }));
  const incidents = tracker.finish(frame(9000, { 0: 1, sliderBreaks: 1 }));
  assert.deepEqual(incidents.map(item => [item.timeMs, item.misses || 0, item.sliderBreaks || 0]), [[6000, 1, 0], [9000, 0, 1]]);
});

test('difficultyAt classe relativement le segment observé', () => {
  assert.equal(difficultyAt([1, 2, 9, 3], 0.55).level, 'high');
  assert.equal(difficultyAt([1, 2, 9, 3], 0.05).level, 'low');
});

test('le résumé distingue les pics observés sans affirmer leur cause', () => {
  const summary = summarizeRunIncidents([{ timeMs: 6000, progress: 0.55, misses: 1 }], [1, 2, 9, 3]);
  assert.equal(summary.interpretation, 'errors_on_observed_peaks');
  assert.equal(summary.confidence, 'medium');
  assert.match(summary.caveat, /ne prouve pas/i);
});

test('sans profil osu! le résumé conserve seulement les positions', () => {
  const summary = summarizeRunIncidents([{ timeMs: 3000, progress: 0.2, hit100: 1 }]);
  assert.equal(summary.interpretation, 'positions_only');
  assert.equal(summary.confidence, 'low');
});
