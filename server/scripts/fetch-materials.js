const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const BASE = path.join(__dirname, '..');
async function fetchMaterials(id = 'machine-learning') {
    if (!/^[a-z0-9-]+$/.test(id))
        throw new Error('无效资料集 ID');
    const catalog = JSON.parse(await fs.readFile(path.join(BASE, 'datasets', id + '.json'), 'utf8'));
    const dir = path.join(BASE, 'materials', id);
    await fs.mkdir(dir, { recursive: true });
    const receipts = [];
    for (const doc of catalog.documents) {
        const dest = path.join(dir, doc.file);
        let bytes = await fs.readFile(dest).catch(() => null);
        if (!bytes) {
            try {
                const response = await fetch(doc.source, { signal: AbortSignal.timeout(120000) });
                if (!response.ok)
                    throw new Error(doc.id + ': HTTP ' + response.status);
                bytes = Buffer.from(await response.arrayBuffer());
                if (doc.format === 'pdf' ? bytes.subarray(0, 5).toString() !== '%PDF-' : !bytes.toString('utf8').trimStart().startsWith('#'))
                    throw new Error(doc.id + ': 下载内容格式不符');
                await fs.writeFile(dest + '.tmp', bytes);
                await fs.rename(dest + '.tmp', dest);
            }
            catch (error) {
                if (!doc.optional)
                    throw error;
                console.warn(doc.id + ': optional download unavailable: ' + error.message);
                receipts.push({ id: doc.id, status: 'unavailable', source: doc.source });
                continue;
            }
        }
        receipts.push({ id: doc.id, file: doc.file, source: doc.source, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
        console.log(doc.id + ': ' + bytes.length + ' bytes');
    }
    await fs.writeFile(path.join(dir, 'receipts.json'), JSON.stringify({ retrievedAt: new Date().toISOString(), documents: receipts }, null, 2));
    return receipts;
}
module.exports = { fetchMaterials };
if (require.main === module)
    fetchMaterials(process.argv[2]).catch(e => { console.error(e.message); process.exitCode = 1; });
