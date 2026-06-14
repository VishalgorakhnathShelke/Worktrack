import assert from "node:assert/strict";
import test from "node:test";

import { canCaptureVisibleTab, stateVisibleToSender } from "../src/core/tab-policy.mjs";

const state = { tabId: 7, phase: "recording" };

test("only exposes active recording state to its selected content tab", () => {
  assert.equal(stateVisibleToSender(state, 8), null);
  assert.equal(stateVisibleToSender(state, 7), state);
  assert.equal(stateVisibleToSender(state, undefined), state);
});

test("only permits screenshots when the recorded tab is foregrounded", () => {
  assert.equal(canCaptureVisibleTab(state, { id: 7, active: true }), true);
  assert.equal(canCaptureVisibleTab(state, { id: 7, active: false }), false);
  assert.equal(canCaptureVisibleTab(state, { id: 8, active: true }), false);
});
