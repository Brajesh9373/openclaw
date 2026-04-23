# Multi-API-Key Rotation

OpenClaw supports automatic rotation through multiple API keys for custom providers to handle rate limiting and improve reliability.

## Configuration

Configure multiple API keys as an array in your `models.providers` config:

```json5
{
  models: {
    providers: {
      "custom-integrate-api-nvidia-com": {
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

## Behavior

- **Single Key**: Works exactly as before (no breaking changes)
- **Array Keys**: Automatic round-robin rotation with cooldown tracking
- **Rate Limiting**: Failed keys are temporarily avoided using existing auth profile cooldown
- **Fallback**: If all keys fail, standard error handling applies

## Implementation

Uses OpenClaw's existing auth profile rotation machinery:
- Creates synthetic profile IDs: `provider:key0`, `provider:key1`, etc.
- Leverages `resolveAuthProfileOrder()` for rotation logic
- Maintains cooldown state in the auth profile store

## Status & Display

- `openclaw models status`: Shows first key for display purposes
- `openclaw agent --verbose`: Logs which key index is being used
- Auth profile commands work with synthetic profile IDs

## Migration

Existing single-key configurations continue to work unchanged. To enable rotation, simply convert your single key to an array:

```json5
// Before
apiKey: "your-key"

// After  
apiKey: ["your-key", "additional-key"]
```

## Troubleshooting

### Check Key Status
```bash
openclaw auth-profiles list
```

### Reset Failed Keys
```bash
openclaw auth-profiles reset <provider>:key0
```

### Verify Configuration
```bash
openclaw models status
```