export class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; }
  acquire() {
    if (this.active >= this.limit) throw new Error('managed target concurrency limit reached');
    this.active += 1;
    let released = false;
    return () => { if (!released) { released = true; this.active -= 1; } };
  }
}
