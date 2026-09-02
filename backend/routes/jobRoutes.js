const express = require('express');
const router = express.Router();
const { QUEUES } = require('../queues/queues');

// GET /api/jobs/:jobId  — jobId format: "img_123", "aud_456", "vid_789"
router.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const [prefix, id] = jobId.split('_');
  const queue = QUEUES[prefix];

  if (!queue || !id) return res.status(400).json({ error: 'Invalid job ID' });

  try {
    const job = await queue.getJob(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;

    if (state === 'completed') {
      return res.json({ status: 'completed', progress: 100, result: job.returnvalue });
    }

    if (state === 'failed') {
      return res.json({ status: 'failed', error: job.failedReason || 'Job failed' });
    }

    // waiting / active / delayed / prioritized
    let position = null;
    if (state === 'waiting') {
      const waiting = await queue.getWaiting();
      position = waiting.findIndex(j => j.id === id) + 1;
    }

    return res.json({ status: state, progress, position: position || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
