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

const entryKey = (userId) => `pp_entry_draft_v1:${userId}`;
export function readEntryDraft(storage, userId) {
  try {
    const draft = JSON.parse(storage?.getItem(entryKey(userId)) || "null");
    if (draft?.version !== 1 || !draft.fields || typeof draft.fields.title !== "string") return null;
    const fields = draft.fields;
    if (!["title", "kind", "amount", "date", "method"].every((name) => typeof fields[name] === "string")) return null;
    return { fields, requestId: UUID.test(draft.requestId || "") ? draft.requestId : "" };
  } catch { return null; }
}
export function writeEntryDraft(storage, userId, draft) {
  try {
    if (!draft) storage.removeItem(entryKey(userId));
    else storage.setItem(entryKey(userId), JSON.stringify({ version: 1, ...draft }));
    return true;
  } catch { return false; }
}
export function readLegacyDrafts(storage) {
  try {
    const text = storage?.getItem("pp_draft_text") || "";
    const raw = storage?.getItem("pp_cooling_off_items");
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return { text, items: [], invalid: true };
    return { text, items, invalid: false };
  } catch { return { text: "", items: [], invalid: true }; }
}
export function removeLegacyDraft(storage, key, expectedValue) {
  try {
    if (storage.getItem(key) !== expectedValue) return false;
    storage.removeItem(key);
    return true;
  } catch { return false; }
}
