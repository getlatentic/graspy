// The microphone's samples, handed to the page about twenty times a second.
const BATCH = 2048;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(BATCH);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let read = 0;
    while (read < channel.length) {
      const taken = Math.min(BATCH - this.filled, channel.length - read);
      this.batch.set(channel.subarray(read, read + taken), this.filled);
      this.filled += taken;
      read += taken;
      if (this.filled === BATCH) {
        this.port.postMessage(this.batch, [this.batch.buffer]);
        this.batch = new Float32Array(BATCH);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
