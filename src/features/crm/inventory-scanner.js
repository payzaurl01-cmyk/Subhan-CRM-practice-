export function createInventoryScanner({
  media = globalThis.navigator?.mediaDevices,
  Detector = globalThis.BarcodeDetector,
  frame = globalThis.requestAnimationFrame,
  cancel = globalThis.cancelAnimationFrame,
} = {}) {
  let stream = null,
    pendingFrame = null,
    epoch = 0;
  function stop() {
    epoch++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (pendingFrame != null) cancel(pendingFrame);
    pendingFrame = null;
  }
  async function start(video, onCode, onError) {
    stop();
    const current = epoch;
    if (!Detector || !media?.getUserMedia)
      throw new Error(
        "Camera barcode scanning is unsupported in this browser. Enter a SKU/barcode manually or use a handheld scanner.",
      );
    try {
      const detector = new Detector();
      const acquired = await media.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (current !== epoch) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
      async function read() {
        if (current !== epoch) return;
        try {
          const results = await detector.detect(video);
          if (current !== epoch) return;
          const code = results.find((result) => result.rawValue)?.rawValue;
          if (code) {
            stop();
            onCode(code);
            return;
          }
          pendingFrame = frame(read);
        } catch (error) {
          stop();
          onError(error);
        }
      }
      pendingFrame = frame(read);
    } catch (error) {
      stop();
      throw new Error(
        error.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access or enter the code manually."
          : error.message ||
              "Camera could not start. Manual entry is available.",
      );
    }
  }
  return { start, stop };
}
