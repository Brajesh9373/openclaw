# Multi-API-Key Rotation Architecture

## Overview

This document describes the architectural changes for multi-API-key rotation support in OpenClaw's custom provider system.

## Problem

Custom providers (e.g., NVIDIA API) often have rate limits that can be mitigated by rotating through multiple API keys. The existing single-key system couldn't handle this automatically.

## Solution

Extend `ModelProviderConfig.apiKey` to accept arrays while leveraging existing auth profile rotation machinery.

## Type System Changes

### `src/config/types.models.ts`
```ts
// Before
apiKey?: SecretInput;

// After  
apiKey?: SecretInput | SecretInput[];
```

### `src/config/zod-schema.core.ts`
```ts
// Before
apiKey: SecretInputSchema.optional()

// After
apiKey: z.union([SecretInputSchema, z.array(SecretInputSchema).min(1)]).optional()
```

## Core Logic Changes

### Array Handling Guards
- `normalizeConfiguredProviderApiKey()`: Early return for arrays
- `resolveMissingProviderApiKey()`: Treats non-empty arrays as configured

### Rotation Implementation
- `resolveArrayApiKeyWithRotation()`: Creates synthetic profile IDs (`provider:key0`, `provider:key1`)
- Uses existing `resolveAuthProfileOrder()` for round-robin + cooldown
- `resolveUsableCustomProviderApiKey()`: Routes arrays to rotation logic

### Display/Status
- `getCustomProviderApiKey()`: Returns first key for display
- `hasExplicitProviderApiKeyConfig()`: Handles array length check

## Integration Points

### Existing Systems Used
- **Auth Profile Store**: Manages rotation state and cooldowns
- **Profile Order Resolution**: Provides round-robin with failed key avoidance
- **Secret Input Normalization**: Handles individual key processing

### Backward Compatibility
- Single keys work unchanged
- Existing auth profile commands work with synthetic IDs
- No breaking changes to public APIs

## Benefits

1. **Zero Breaking Changes**: Single keys continue working exactly as before
2. **Reuses Existing Infrastructure**: No new rotation logic needed
3. **Automatic Cooldown**: Failed keys temporarily avoided
4. **Simple Configuration**: Just convert single key to array
5. **Observable**: Standard auth profile tooling works

## Example Usage

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