import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceNotice} from '../lib/reference.mjs';
import {validateNotice,rankedPrices,lowerForExpected,evaluateAmount,historyBefore} from '../lib/domain.mjs';
test('official public result: all prices, selections, draw counts and bidders reconcile',()=>{
 const n=validateNotice(referenceNotice),r=n.result;
 assert.equal(r.expectedPriceWon,68807250);assert.equal(r.participants.length,115);assert.equal(r.participants.filter(p=>p.eligible).length,109);
 assert.deepEqual(r.prices.filter(p=>p.selected).map(p=>p.drawNo),[11,12,14,15]);assert.deepEqual(rankedPrices(n).filter(p=>p.selected).map(p=>p.rank),[7,9,12,15]);
 assert.equal(r.prices.reduce((sum,p)=>sum+p.drawCount,0),230);assert.equal(lowerForExpected(r.expectedPriceWon,n.price),62857388);
 assert.equal(evaluateAmount(62857388,n).first,true);assert.equal(evaluateAmount(68807251,n).status,'above-expected');
});
test('collected result is unavailable before first observation and outside six-month opening window',()=>{
 const n=validateNotice(referenceNotice);assert.equal(n.result.officialPublishedAt,null);
 assert.equal(historyBefore([n],'전주','2026-05-08T00:00:00Z').length,0);
 assert.equal(historyBefore([n],'전주','2026-11-05T07:00:00Z').length,1);
 assert.equal(historyBefore([n],'전주','2026-12-01T00:00:00Z').length,0);
});
