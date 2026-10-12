/** Resources owned by one mounted workspace, including React Strict Mode remounts. */
export function createLifecycle() {
  const controller = new AbortController();
  const timeouts = new Set(),
    intervals = new Set(),
    frames = new Set(),
    urls = new Set();
  const lifecycle = {
    get disposed() {
      return controller.signal.aborted;
    },
    listen(target, type, callback, options = {}) {
      target.addEventListener(type, callback, {
        ...options,
        signal: controller.signal,
      });
    },
    setTimeout(callback, delay, ...args) {
      if (controller.signal.aborted) return null;
      const id = globalThis.setTimeout(() => {
        timeouts.delete(id);
        if (!controller.signal.aborted) callback(...args);
      }, delay);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      globalThis.clearTimeout(id);
      timeouts.delete(id);
    },
    setInterval(callback, delay, ...args) {
      if (controller.signal.aborted) return null;
      const id = globalThis.setInterval(() => {
        if (!controller.signal.aborted) callback(...args);
      }, delay);
      intervals.add(id);
      return id;
    },
    clearInterval(id) {
      globalThis.clearInterval(id);
      intervals.delete(id);
    },
    requestAnimationFrame(callback) {
      if (controller.signal.aborted) return null;
      const id = globalThis.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!controller.signal.aborted) callback(time);
      });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id) {
      globalThis.cancelAnimationFrame(id);
      frames.delete(id);
    },
    createObjectURL(blob) {
      if (controller.signal.aborted)
        throw new DOMException("Workspace was unmounted", "AbortError");
      const url = URL.createObjectURL(blob);
      urls.add(url);
      return url;
    },
    revokeObjectURL(url) {
      URL.revokeObjectURL(url);
      urls.delete(url);
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const id of timeouts) globalThis.clearTimeout(id);
      for (const id of intervals) globalThis.clearInterval(id);
      for (const id of frames) globalThis.cancelAnimationFrame(id);
      for (const url of urls) URL.revokeObjectURL(url);
      timeouts.clear();
      intervals.clear();
      frames.clear();
      urls.clear();
    },
  };
  return lifecycle;
}
