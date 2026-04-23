import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelProviderSchema } from "../config/zod-schema.core.js";

describe("Multi-API-Key Array Support", () => {
  it("accepts single API key (backward compatibility)", () => {
    const config = {
      baseUrl: "https://api.example.com",
      apiKey: "single-key",
      models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
    };
    
    const result = ModelProviderSchema.parse(config);
    expect(result.apiKey).toBe("single-key");
  });

  it("accepts array of API keys", () => {
    const config = {
      baseUrl: "https://api.example.com", 
      apiKey: ["key1", "key2", "key3"],
      models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
    };
    
    const result = ModelProviderSchema.parse(config);
    expect(result.apiKey).toEqual(["key1", "key2", "key3"]);
  });

  it("rejects empty array", () => {
    const config = {
      baseUrl: "https://api.example.com",
      apiKey: [],
      models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
    };
    
    expect(() => ModelProviderSchema.parse(config)).toThrow();
  });

  it("accepts mixed secret input types in array", () => {
    const config = {
      baseUrl: "https://api.example.com",
      apiKey: [
        "literal-key",
        { source: "env", provider: "test", id: "TEST_KEY" }
      ],
      models: [{ id: "test-model", name: "Test Model", contextWindow: 4096 }]
    };
    
    const result = ModelProviderSchema.parse(config);
    expect(Array.isArray(result.apiKey)).toBe(true);
    expect(result.apiKey).toHaveLength(2);
  });
});