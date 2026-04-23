# Multi-API-Key Setup Guide

This guide shows how to configure multiple API keys for custom providers to handle rate limiting through automatic rotation.

## Quick Setup

### 1. Locate Your Configuration File

Your OpenClaw configuration is typically located at:
- **Linux/macOS**: `~/.openclaw/openclaw.json`
- **Windows**: `%USERPROFILE%\.openclaw\openclaw.json`

### 2. Update Your Provider Configuration

**Single Key (Current Setup):**
```json5
{
  models: {
    providers: {
      "your-provider-name": {
        apiKey: "your-single-api-key",
        models: ["your-model-name"]
      }
    }
  }
}
```

**Multiple Keys (New Setup):**
```json5
{
  models: {
    providers: {
      "your-provider-name": {
        apiKey: [
          "your-first-api-key",
          "your-second-api-key", 
          "your-third-api-key"
        ],
        models: ["your-model-name"]
      }
    }
  }
}
```

### 3. Example for NVIDIA API

```json5
{
  models: {
    providers: {
      "custom-integrate-api-nvidia-com": {
        apiKey: [
          "nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          "nvapi-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
          "nvapi-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
        ],
        models: ["nvidia/llama-3.1-nemotron-70b-instruct"]
      }
    }
  }
}
```

## How It Works

- **Automatic Rotation**: OpenClaw cycles through your API keys automatically
- **Rate Limit Handling**: When one key hits a rate limit, it switches to the next available key
- **Cooldown Management**: Failed keys are temporarily avoided using existing cooldown logic
- **Backward Compatible**: Single keys continue working exactly as before

## Verification

### Check Configuration
```bash
openclaw models status
```

### Test with Verbose Logging
```bash
openclaw agent --message "Hello" --verbose
```

The verbose output will show which key index is being used during requests.

## Environment Variables (Alternative)

You can also use environment variables in arrays:

```json5
{
  models: {
    providers: {
      "your-provider": {
        apiKey: [
          { "source": "env", "provider": "env", "id": "API_KEY_1" },
          { "source": "env", "provider": "env", "id": "API_KEY_2" },
          { "source": "env", "provider": "env", "id": "API_KEY_3" }
        ],
        models: ["your-model"]
      }
    }
  }
}
```

Then set your environment variables:
```bash
export API_KEY_1="your-first-key"
export API_KEY_2="your-second-key" 
export API_KEY_3="your-third-key"
```

## Requirements

- **Minimum**: 1 API key (empty arrays are rejected)
- **Maximum**: No limit (use as many keys as you have)
- **Mixed Types**: You can mix literal strings and environment variable references

## Troubleshooting

### Configuration Issues
```bash
# Validate your configuration
openclaw doctor
```

### Key Status
```bash
# Check auth profile status
openclaw auth-profiles list
```

### Reset Failed Keys
```bash
# Reset cooldown for a specific key
openclaw auth-profiles reset your-provider:key0
```

## Migration from Single Key

1. **Backup** your current `openclaw.json`
2. **Change** `apiKey: "single-key"` to `apiKey: ["single-key", "additional-keys"]`
3. **Test** with `openclaw models status`
4. **Verify** rotation with `openclaw agent --verbose`

That's it! Your setup will now automatically handle rate limits by rotating through multiple API keys.