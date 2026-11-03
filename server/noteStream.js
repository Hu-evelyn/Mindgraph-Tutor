// Shared generation survives disconnected viewers; only validated final content is saved.
function createNoteJob(generate) {
  const listeners = new Set();
  let draft = '', status = '正在准备笔记…';
  const emit = event => {
    if (event.type === 'delta') draft += event.text;
    if (event.type === 'reset') draft = '';
    if (event.type === 'status') status = event.message;
    for (const listener of listeners) listener(event);
  };
  const promise = Promise.resolve().then(() => generate(emit));
  return { promise, subscribe(listener) {
    listeners.add(listener);
    listener({ type: 'status', message: status });
    if (draft) listener({ type: 'delta', text: draft });
    return () => listeners.delete(listener);
  } };
}
module.exports = { createNoteJob };
