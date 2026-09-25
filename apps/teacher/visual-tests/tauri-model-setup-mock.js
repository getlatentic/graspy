(() => {
  let callbackId = 0;
  const callbacks = new Map();

  window.__TAURI_INTERNALS__ = {
    transformCallback(callback) {
      callbackId += 1;
      callbacks.set(callbackId, callback);
      return callbackId;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc(path) {
      return path;
    },
    async invoke(command) {
      if (command === "get_model_installation") {
        return {
          state: "absent",
          downloadedBytes: 0,
          totalBytes: 2_841_481_184,
          artifactLicense: "Apache-2.0",
          artifactLicenseUrl: "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF",
          upstreamTermsUrl: "https://ai.google.dev/gemma/terms",
        };
      }
      if (command === "plugin:event|listen") return 1;
      if (command === "plugin:event|unlisten") return null;
      if (command === "plugin:dialog|open") return null;
      throw new Error(`Unexpected visual-test command: ${command}`);
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener() {},
  };
})();
