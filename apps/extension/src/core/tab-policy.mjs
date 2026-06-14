export function stateVisibleToSender(state, senderTabId) {
  if (senderTabId == null) return state;
  return state?.tabId === senderTabId ? state : null;
}

export function canCaptureVisibleTab(state, senderTab) {
  return Boolean(
    state
      && state.phase === "recording"
      && senderTab?.active
      && senderTab.id === state.tabId,
  );
}
