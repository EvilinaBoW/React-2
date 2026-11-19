async function retryAsync(fn, options = {}) {
  const retries = options.retries ?? 3;
  let delay = options.delay ?? 1000;
  const factor = options.factor ?? 2;

  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));

      delay = delay * factor;
    }
  }
}
