export const createRuntimeHealth = ({ targetDriver, metadataDriver, targetDatabase, metadataDatabase }) => {
  if (!targetDatabase || !metadataDatabase || !targetDriver || !metadataDriver) throw new Error('Fixed readiness databases and drivers are required');
  let pending; let stopped = false;
  const probe = async (driver, database) => {
    let session; let timer;
    try {
      session = driver.session({ database, defaultAccessMode: 'READ' });
      const result = await Promise.race([
        session.run('RETURN 1 AS ready', {}, { timeout: 1500 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('readiness deadline')), 1750); })
      ]);
      return result.records.length === 1 && Number(result.records[0].get('ready')) === 1;
    } catch { return false; }
    finally {
      clearTimeout(timer);
      // Cancellation may outlive the HTTP deadline. Never hold readiness admission on a stalled close.
      if (session) Promise.resolve(session.close()).catch(() => {});
    }
  };
  return Object.freeze({
    check() {
      if (stopped) return Promise.resolve(false);
      if (!pending) pending = Promise.all([probe(targetDriver, targetDatabase), probe(metadataDriver, metadataDatabase)])
        .then(results => !stopped && results.every(Boolean)).finally(() => { pending = undefined; });
      return pending;
    },
    async close() {
      stopped = true;
      await Promise.allSettled([targetDriver.close(), metadataDriver.close()]);
    }
  });
};
