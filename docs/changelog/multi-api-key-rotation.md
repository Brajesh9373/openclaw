# Multi-API-Key Rotation - Changelog Entry

## Features

### Multi-API-Key Rotation for Custom Providers

- **Added**: Support for multiple API keys in `models.providers` configuration
- **Usage**: Configure `apiKey` as an array: `["key1", "key2", "key3"]`
- **Behavior**: Automatic round-robin rotation with cooldown on rate limit failures
- **Compatibility**: Single keys continue working unchanged (no breaking changes)
- **Integration**: Uses existing auth profile rotation machinery for reliability

Example configuration:
```json5
{
  models: {
    providers: {
      "custom-nvidia": {
        apiKey: [
          "nvapi-key1...",
          "nvapi-key2...",
          "nvapi-key3..."
        ],
        models: ["nvidia/llama-3.1-nemotron-70b-instruct"]
      }
    }
  }
}
```

This enables automatic handling of rate limits by cycling through multiple API keys with intelligent cooldown tracking.