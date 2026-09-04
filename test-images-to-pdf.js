#!/usr/bin/env node
// Test script for images-to-pdf endpoint.
// Usage: node test-images-to-pdf.js [base-url]
// Default base URL: http://localhost:3001

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const BASE_URL = process.argv[2] || 'http://localhost:3001';
const TMP      = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));

// ── Minimal PNG builder (no external deps) ───────────────────────────────────

const zlib = require('zlib');

function createPng(width, height, r, g, b) {
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw pixel data
  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const off = y * rowSize + 1 + x * 3;
      raw[off]   = r + ((x * 3 + y * 7) & 0x1f); // slight variation so image isn't flat
      raw[off+1] = g + ((x * 5 + y * 3) & 0x1f);
      raw[off+2] = b + ((x * 7 + y * 5) & 0x1f);
    }
  }
  const compressed = zlib.deflateSync(raw);

  function crc32(buf) {
    const table = crc32.table || (crc32.table = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c;
      }
      return t;
    })());
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf    = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput  = Buffer.concat([typeBytes, data]);
    const crcBuf    = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function doRequest(method, urlStr, body, contentType) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method,
      headers: contentType ? { 'Content-Type': contentType, 'Content-Length': body.length } : {},
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function buildMultipart(files) {
  const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
  const parts = [];
  for (const { name, filename, data, mime } of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
    ));
    parts.push(data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function poll(jobId, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 800));
    const { body } = await doRequest('GET', `${BASE_URL}/api/jobs/${jobId}`);
    if (body.status === 'completed') return body;
    if (body.status === 'failed') throw new Error('Job failed: ' + body.error);
  }
  throw new Error('Timeout waiting for job');
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

async function runTest(label, count, options = {}) {
  const { widths, heights, formats } = options;
  process.stdout.write(`  ${label} ... `);
  const start = Date.now();
  const memBefore = process.memoryUsage().heapUsed;

  const fileEntries = [];
  const tmpFiles = [];
  for (let i = 0; i < count; i++) {
    const w = widths ? widths[i % widths.length] : 400 + (i * 37) % 600;
    const h = heights ? heights[i % heights.length] : 300 + (i * 53) % 400;
    const r = (i * 50) % 200 + 30;
    const g = (i * 80) % 200 + 30;
    const b = (i * 110) % 200 + 30;
    const png = createPng(w, h, r, g, b);
    const fname = `test_${i}_${w}x${h}.png`;
    const fpath = path.join(TMP, fname);
    fs.writeFileSync(fpath, png);
    tmpFiles.push(fpath);
    fileEntries.push({ name: 'files', filename: fname, data: png, mime: 'image/png' });
  }

  try {
    const { body: uploadResp, contentType } = buildMultipart(fileEntries);
    const { status, body } = await doRequest('POST', `${BASE_URL}/api/pdf/images-to-pdf`, uploadResp, contentType);

    if (status !== 200 || !body.jobId) {
      throw new Error(`Upload failed (${status}): ${JSON.stringify(body)}`);
    }

    const result = await poll(body.jobId);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const memDelta = Math.round((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024);

    if (!result.result || !result.result.size) throw new Error('Result missing size');

    console.log(`PASS  ${elapsed}s  PDF=${Math.round(result.result.size/1024)}KB  mem+${memDelta}MB`);
    passed++;
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`FAIL  ${elapsed}s  ${err.message}`);
    failed++;
  } finally {
    for (const f of tmpFiles) try { fs.unlinkSync(f); } catch {}
  }
}

async function runInvalidTest(label, data, mime, filename) {
  process.stdout.write(`  ${label} ... `);
  const start = Date.now();
  const { body: uploadResp, contentType } = buildMultipart([{ name: 'files', filename, data: Buffer.from(data), mime }]);
  try {
    const { status, body } = await doRequest('POST', `${BASE_URL}/api/pdf/images-to-pdf`, uploadResp, contentType);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    // expect either a 400 at upload time or a failed job — either is a correct error response
    if (status === 400) {
      console.log(`PASS  ${elapsed}s  Rejected at upload (${body.error || status})`);
      passed++;
    } else if (status === 200 && body.jobId) {
      try {
        await poll(body.jobId, 30000);
        // If it somehow succeeded with garbage data, that's suspicious
        console.log(`FAIL  ${elapsed}s  Accepted invalid file without error`);
        failed++;
      } catch (pollErr) {
        console.log(`PASS  ${elapsed}s  Job failed as expected: ${pollErr.message}`);
        passed++;
      }
    } else {
      console.log(`PASS  ${elapsed}s  Rejected (${status})`);
      passed++;
    }
  } catch (err) {
    console.log(`FAIL  ${elapsed}s  ${err.message}`);
    failed++;
  }
}

// ── Concurrent user simulation ────────────────────────────────────────────────

async function runConcurrentTest(label, batches) {
  process.stdout.write(`  ${label} ... `);
  const start = Date.now();
  const results = await Promise.allSettled(
    batches.map(count => runTestSilent(count))
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const allOk = results.every(r => r.status === 'fulfilled' && r.value === true);
  if (allOk) {
    console.log(`PASS  ${elapsed}s  All ${batches.length} concurrent requests completed`);
    passed++;
  } else {
    const failures = results.filter(r => r.status === 'rejected' || r.value === false).length;
    console.log(`FAIL  ${elapsed}s  ${failures}/${batches.length} concurrent requests failed`);
    failed++;
  }
}

async function runTestSilent(count) {
  const fileEntries = [];
  for (let i = 0; i < count; i++) {
    const png = createPng(200 + i * 10, 150 + i * 7, i * 30 % 200, i * 50 % 200, i * 70 % 200);
    fileEntries.push({ name: 'files', filename: `img_${i}.png`, data: png, mime: 'image/png' });
  }
  const { body: uploadResp, contentType } = buildMultipart(fileEntries);
  const { status, body } = await doRequest('POST', `${BASE_URL}/api/pdf/images-to-pdf`, uploadResp, contentType);
  if (status !== 200 || !body.jobId) return false;
  try {
    const result = await poll(body.jobId, 120000);
    return !!(result.result && result.result.size);
  } catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nImages-to-PDF test suite`);
  console.log(`Target: ${BASE_URL}\n`);

  // Check server is up
  try {
    const { status } = await doRequest('GET', `${BASE_URL}/api/views`);
    if (status !== 200) throw new Error(`Status ${status}`);
    console.log('Server reachable.\n');
  } catch (e) {
    console.error(`Cannot reach server at ${BASE_URL}: ${e.message}`);
    console.error('Start the server first, then re-run this script.\n');
    process.exit(1);
  }

  console.log('── Batch size tests ────────────────────────────────────────────');
  await runTest('1 image  (small 400×300)',  1);
  await runTest('10 images (mixed sizes)',   10, { widths: [300,500,800,1200,200,600,900,400,700,1000], heights: [200,400,600,800,150,500,700,300,550,900] });
  await runTest('20 images (mixed sizes)',   20);
  await runTest('30 images (mixed sizes)',   30);
  await runTest('40 images (mixed sizes)',   40);
  await runTest('50 images (at limit)',      50);

  console.log('\n── Format / size stress tests ──────────────────────────────────');
  await runTest('5 large images (1920×1080)',  5,  { widths: [1920], heights: [1080] });
  await runTest('10 large images (1920×1080)', 10, { widths: [1920], heights: [1080] });
  await runTest('20 tall portrait images',    20, { widths: [600],  heights: [1400] });
  await runTest('30 square images (800×800)', 30, { widths: [800],  heights: [800]  });

  console.log('\n── Invalid input tests ─────────────────────────────────────────');
  await runInvalidTest('Corrupted PNG (random bytes)', 'this is not an image at all !!!', 'image/png', 'corrupt.png');
  await runInvalidTest('Empty file', '', 'image/png', 'empty.png');

  console.log('\n── Concurrent user tests ───────────────────────────────────────');
  await runConcurrentTest('3 users × 10 images each (simultaneous)', [10, 10, 10]);
  await runConcurrentTest('2 users × 20 images each (simultaneous)', [20, 20]);
  await runConcurrentTest('2 users × 30 images each (simultaneous)', [30, 30]);

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('');

  // Cleanup
  try { fs.rmdirSync(TMP); } catch {}
  process.exit(failed > 0 ? 1 : 0);
})();
