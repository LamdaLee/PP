const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (userId) => `pp_memo_draft_v1:${userId}`;
export function browserDraftStorage() {
  try { return window.localStorage; } catch { return null; }
}
export function readMemoDraft(storage, userId) {
  const empty = { text: "", requestId: "" };
  try {
    const raw = storage.getItem(key(userId));
    if (!raw) return empty;
    const draft = JSON.parse(raw);
    if (draft?.version !== 1 || typeof draft.text !== "string") return empty;
    return {
      text: draft.text,
      requestId: UUID.test(draft.requestId || "") ? draft.requestId : "",
    };
  } catch {
    return empty;
  }
}
export function writeMemoDraft(storage, userId, text, requestId = "") {
  try {
    if (!text) storage.removeItem(key(userId));
    else storage.setItem(key(userId), JSON.stringify({ version: 1, text, requestId }));
    return true;
  } catch {
    return false;
  }
}
