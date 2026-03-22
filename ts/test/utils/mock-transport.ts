/**
 * Mock viem transport for testing protocol adapters without real RPC calls.
 * Captures real RPC responses once, stores as fixtures, replays in tests.
 */
import type { Transport } from "viem";

type MockResponse = {
  method: string;
  params?: unknown[];
  result: unknown;
};

/**
 * Create a mock transport that returns preset responses for specific RPC calls.
 */
export function createMockTransport(
  responses: MockResponse[],
): Transport {
  return () => ({
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const match = responses.find((r) => {
        if (r.method !== method) return false;
        if (r.params && params) {
          return JSON.stringify(r.params) === JSON.stringify(params);
        }
        return true;
      });

      if (match) return match.result;
      throw new Error(`No mock response for ${method}(${JSON.stringify(params)})`);
    },
    type: "mock" as const,
    key: "mock",
    name: "Mock Transport",
  }) as ReturnType<Transport>;
}

/**
 * Create a mock transport that records all calls for later fixture generation.
 */
export function createRecordingTransport(
  realTransport: Transport,
): { transport: Transport; getRecordings: () => MockResponse[] } {
  const recordings: MockResponse[] = [];

  const transport: Transport = (...args: Parameters<Transport>) => {
    const real = realTransport(...args);
    return {
      ...real,
      request: async (req: { method: string; params?: unknown[] }) => {
        const result = await real.request(req);
        recordings.push({
          method: req.method,
          params: req.params,
          result,
        });
        return result;
      },
    } as ReturnType<Transport>;
  };

  return { transport, getRecordings: () => recordings };
}
