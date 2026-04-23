# Multi-API-Key Rotation - Implementation Guide

## Overview

This guide covers the implementation details for multi-API-key rotation in OpenClaw's custom provider system.

## Files Modified

### Type System
- `src/config/types.models.ts`: Extended `ModelProviderConfig.apiKey` type
- `src/config/zod-schema.core.ts`: Updated schema validation

### Core Logic  
- `src/agents/models-config.providers.secret-helpers.ts`: Added array guards
- `src/agents/model-auth.ts`: Added rotation logic and array handling

## Key Functions

### `resolveArrayApiKeyWithRotation()`
```ts
function resolveArrayApiKeyWithRotation(
  apiKeys: SecretInput[],
  provider: string,
): ResolvedCustomProviderApiKey | null
```
- Creates synthetic profile IDs: `${provider}:key${index}`
- Uses `resolveAuthProfileOrder()` for rotation
- Returns first available key with source tracking

### Array Handling Updates
- `getCustomProviderApiKey()`: Returns first key for display
- `resolveUsableCustomProviderApiKey()`: Routes to rotation logic
- `hasExplicitProviderApiKeyConfig()`: Checks array length

## Integration Points

### Auth Profile System
- Synthetic profile IDs: `provider:key0`, `provider:key1`, etc.
- Existing cooldown and rotation logic handles failures
- Standard auth profile commands work with synthetic IDs

### Backward Compatibility
- Single `SecretInput` values work unchanged
- Array detection via `Array.isArray()` 
- Early returns preserve existing behavior

## Testing Considerations

### Unit Tests
- Array vs single key handling
- Synthetic profile ID generation
- Rotation order verification

### Integration Tests  
- Rate limit scenario with key rotation
- Cooldown behavior verification
- Fallback to error handling

## Configuration Examples

### Single Key (Existing)
```json5
{
  apiKey: "single-key"
}
```

### Multiple Keys (New)
```json5
{
  apiKey: [
    "key-1",
    "key-2", 
    "key-3"
  ]
}
```

### Mixed Providers
```json5
{
  models: {
    providers: {
      "single-key-provider": {
        apiKey: "single-key",
        models: ["model-1"]
      },
      "multi-key-provider": {
        apiKey: ["key-1", "key-2"],
        models: ["model-2"]
      }
    }
  }
}
```