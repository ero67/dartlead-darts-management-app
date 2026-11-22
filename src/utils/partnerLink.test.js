// Run with: node --test src/utils/partnerLink.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerLink } from './partnerLink.js';

const UTM = 'utm_source=dartlead&utm_medium=app&utm_campaign=partner';

test('partnerLink adds the UTM params to a bare shop URL', () => {
  assert.equal(partnerLink('https://darteg.sk'), `https://darteg.sk/?${UTM}`);
});

test('partnerLink keeps existing query params and the hash', () => {
  assert.equal(partnerLink('https://darteg.sk/sipky?cat=2#top'), `https://darteg.sk/sipky?cat=2&${UTM}#top`);
});

test('partnerLink replaces a utm_source the shop URL already had', () => {
  const link = partnerLink('https://darteg.sk/?utm_source=fb');
  assert.equal(link.match(/utm_source=/g).length, 1);
  assert.ok(link.includes('utm_source=dartlead'));
  assert.ok(!link.includes('utm_source=fb'));
});

test('partnerLink returns null for something that is not a URL', () => {
  assert.equal(partnerLink('not a url'), null);
  assert.equal(partnerLink(''), null);
  assert.equal(partnerLink(null), null);
});
