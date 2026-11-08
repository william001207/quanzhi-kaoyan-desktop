import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchScheduler } from '../src/components/search/search-scheduler.ts';
test('rapid typing submits only final trimmed text', t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];const s=createSearchScheduler(x=>calls.push(x));s.change('牙');t.mock.timers.tick(100);s.change(' 牙髓 ');t.mock.timers.tick(199);assert.deepEqual(calls,[]);t.mock.timers.tick(1);assert.deepEqual(calls,['牙髓']);
});
test('Enter flushes and cancels pending debounce', t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];const s=createSearchScheduler(x=>calls.push(x));s.change('牙');s.flush('牙');t.mock.timers.tick(500);assert.deepEqual(calls,['牙']);
});
test('clear is immediate and cannot be overwritten by pending input',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];const s=createSearchScheduler(x=>calls.push(x));s.change('牙');s.change('');assert.deepEqual(calls,['']);t.mock.timers.tick(500);assert.deepEqual(calls,['']);
});
test('IME composition cancels pending search and blocks Enter until commit',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];const s=createSearchScheduler(x=>calls.push(x));s.change('ya');s.compositionStart();s.change('yachi');s.flush('yachi');t.mock.timers.tick(500);assert.deepEqual(calls,[]);s.compositionEnd('牙齿');s.change('牙齿');t.mock.timers.tick(200);assert.deepEqual(calls,['牙齿']);
});
test('unmount cancellation stops pending search',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[];const s=createSearchScheduler(x=>calls.push(x));s.change('牙');s.cancel();t.mock.timers.tick(500);assert.deepEqual(calls,[]);
});
