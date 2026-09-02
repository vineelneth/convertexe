class InMemoryJob {
  constructor(id, data) {
    this.id = id;
    this.data = data;
    this.progress = 0;
    this._state = 'waiting';
    this.returnvalue = null;
    this.failedReason = null;
  }
  async updateProgress(n) { this.progress = n; }
  async getState() { return this._state; }
}

class InMemoryQueue {
  constructor(name) {
    this.name = name;
    this._jobs = new Map();
    this._counter = 0;
    this._waiting = [];
    this._active = 0;
    this._concurrency = 1;
    this._processor = null;
    this._failedHandlers = [];
    _registry.set(name, this);
  }

  async add(name, data) {
    const id = String(++this._counter);
    const job = new InMemoryJob(id, data);
    this._jobs.set(id, job);
    this._waiting.push(job);
    setImmediate(() => this._drain());
    return job;
  }

  async getJob(id) { return this._jobs.get(id) || null; }
  async getWaiting() { return this._waiting.slice(); }

  _setProcessor(processor, concurrency) {
    this._processor = processor;
    this._concurrency = concurrency;
    setImmediate(() => this._drain());
  }

  _drain() {
    while (this._active < this._concurrency && this._waiting.length > 0 && this._processor) {
      const job = this._waiting.shift();
      this._run(job);
    }
  }

  async _run(job) {
    this._active++;
    job._state = 'active';
    try {
      job.returnvalue = await this._processor(job);
      job._state = 'completed';
      job.progress = 100;
    } catch (err) {
      job._state = 'failed';
      job.failedReason = err.message;
      this._failedHandlers.forEach(h => h(job, err));
    } finally {
      this._active--;
      this._drain();
      setTimeout(() => this._jobs.delete(job.id), 30 * 60 * 1000);
    }
  }

  on(event, handler) {
    if (event === 'failed') this._failedHandlers.push(handler);
    return this;
  }
}

class InMemoryWorker {
  constructor(queueName, processor, { concurrency = 1 } = {}) {
    const queue = _registry.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);
    queue._setProcessor(processor, concurrency);
    this._queue = queue;
  }
  on(event, handler) {
    this._queue.on(event, handler);
    return this;
  }
}

const _registry = new Map();

const imageQueue = new InMemoryQueue('img');
const audioQueue = new InMemoryQueue('aud');
const pdfQueue   = new InMemoryQueue('pdf');
const QUEUES = { img: imageQueue, aud: audioQueue, pdf: pdfQueue };

module.exports = { imageQueue, audioQueue, pdfQueue, QUEUES, Worker: InMemoryWorker };
