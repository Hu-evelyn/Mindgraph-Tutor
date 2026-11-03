const fs = require('node:fs/promises');
const path = require('node:path');
// Keep only the latest response per stage/attempt; exclude requests, credentials and document bodies.
async function saveOutputDiagnostic({ stage, attempt, response, error, sourceCount }, directory = path.join(__dirname, '../tmp/ai-output-diagnostics')) {
  const choice = response?.choices?.[0];
  const safeStage = String(stage).replace(/[^a-z-]/g, '');
  const file = path.join(directory, safeStage + '-' + attempt + '.json');
  await fs.mkdir(directory, { recursive: true });
  const report = {
    timestamp: new Date().toISOString(), stage, attempt,
    model: response?.model || null, finishReason: choice?.finish_reason || null,
    sourceCount, errorCode: error.code || null, error: error.message,
    parseDetails: error.parseDetails || null,
    rawContent: choice?.message?.content ?? null,
  };
  const temporary = file + '.' + require('node:crypto').randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(report, null, 2), { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return file;
}
module.exports = { saveOutputDiagnostic };
