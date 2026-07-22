const test = require('node:test');
const assert = require('node:assert/strict');
const { communityMood, plainText } = require('../lib/community-mood.js');

test('les commentaires salés deviennent une ambiance sans citation brute', () => {
  const mood = communityMood([{ message: 'this map is trash' }, { message: 'what a shit map' }, { message: 'normal comment' }]);
  assert.equal(mood.kind, 'salty');
  assert.match(mood.report, /sel|débat|dents|diplomatie/i);
  assert.doesNotMatch(mood.report, /trash|shit/i);
});

test('les balises et liens sont retirés avant analyse', () => {
  assert.equal(plainText('<b>Hello</b> https://example.test/me'), 'Hello');
});

test('trop peu de commentaires ne produit pas de température', () => {
  assert.equal(communityMood([{ message: 'great' }]), null);
});
