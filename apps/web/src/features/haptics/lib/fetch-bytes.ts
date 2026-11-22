/**
 * The bytes of a file from this origin. The timeout is an AbortController and
 * a timer, not AbortSignal.timeout, which Chromium before 103 and Safari
 * before 16 (older TVs) do not have.
 */
export async function fetchBytes(
  url: string,
  timeoutMs: number,
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}
