import { describe, expect, it } from "vitest";
import { getCustomProviderApiKey, collectCustomProviderApiKeysForRotation } from "../agents/model-auth.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

describe("Multi-API-Key Integration", () => {
  it("handles single API key (backward compatibility)", () => {
    const config: OpenClawConfig = {
      models: {
        providers: {
          "test-provider": {
            baseUrl: "https://api.test.com",
            apiKey: "single-key",
            models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
          }
        }
      }
    };

    const key = getCustomProviderApiKey(config, "test-provider");
    expect(key).toBe("single-key");

    const keys = collectCustomProviderApiKeysForRotation({ cfg: config, provider: "test-provider" });
    expect(keys).toEqual(["single-key"]);
  });

  it("handles array of API keys", () => {
    const config: OpenClawConfig = {
      models: {
        providers: {
          "test-provider": {
            baseUrl: "https://api.test.com", 
            apiKey: ["key1", "key2", "key3"],
            models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
          }
        }
      }
    };

    // Should return first key for display
    const key = getCustomProviderApiKey(config, "test-provider");
    expect(key).toBe("key1");

    // Should return all keys for rotation
    const keys = collectCustomProviderApiKeysForRotation({ cfg: config, provider: "test-provider" });
    expect(keys).toEqual(["key1", "key2", "key3"]);
  });

  it("handles empty array gracefully", () => {
    const config: OpenClawConfig = {
      models: {
        providers: {
          "test-provider": {
            baseUrl: "https://api.test.com",
            apiKey: [],
            models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
          }
        }
      }
    };

    const key = getCustomProviderApiKey(config, "test-provider");
    expect(key).toBeUndefined();

    const keys = collectCustomProviderApiKeysForRotation({ cfg: config, provider: "test-provider" });
    expect(keys).toEqual([]);
  });

  it("handles missing provider", () => {
    const config: OpenClawConfig = {};

    const key = getCustomProviderApiKey(config, "nonexistent-provider");
    expect(key).toBeUndefined();

    const keys = collectCustomProviderApiKeysForRotation({ cfg: config, provider: "nonexistent-provider" });
    expect(keys).toEqual([]);
  });
});