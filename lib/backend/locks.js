const locks = new Map();

export async function withKeyedLock(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  locks.set(key, tail);

  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();
    if (locks.get(key) === tail) {
      locks.delete(key);
    }
  }
}

