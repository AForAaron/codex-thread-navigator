import { ReadOnlyAppServer } from "./appserver-history-client.mjs";

/** Retry a broken read-only connection once; discard it before reconnecting. */
export function createQuotaFeed({ createClient = () => new ReadOnlyAppServer() } = {}) {
  let client = null;
  let active = true;
  const discard = async () => {
    const previous = client;
    client = null;
    await previous?.close();
  };
  return {
    async readRateLimits() {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!active) throw new Error("Quota feed closed");
        try {
          if (!client) {
            client = createClient();
            await client.connect();
          }
          const result = await client.readRateLimits();
          if (!active) throw new Error("Quota feed closed");
          return result;
        } catch (error) {
          await discard();
          if (!active || attempt === 1) throw error;
        }
      }
    },
    async close() {
      active = false;
      await discard();
    },
  };
}
