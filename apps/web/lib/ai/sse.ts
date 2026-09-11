export function encodeSSE(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}
