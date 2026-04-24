# How to Add a New Model Provider to OpenClaw

This guide shows you how to add a new AI model provider to OpenClaw. There are two main approaches: **Configuration-Only** (simpler) and **Plugin-Based** (more advanced).

## Method 1: Configuration-Only Provider (Recommended for Most Cases)

This method works for providers that are compatible with existing APIs (OpenAI, Anthropic, etc.).

### Step 1: Add Provider Configuration

Edit your `~/.openclaw/openclaw.json` file:

```json5
{
  "models": {
    "mode": "merge",  // Keep existing providers + add yours
    "providers": {
      "your-provider-name": {
        "baseUrl": "https://api.yourprovider.com/v1",
        "apiKey": "your-api-key-here",  // or use env var/SecretRef
        "api": "openai-completions",    // Choose compatible API
        "headers": {
          "User-Agent": "OpenClaw/1.0",
          "X-Custom-Header": "value"
        },
        "models": [
          {
            "id": "your-model-id",
            "name": "Your Model Name",
            "reasoning": false,
            "input": ["text", "image"],
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": {
              "input": 0.01,      // USD per 1M input tokens
              "output": 0.03,     // USD per 1M output tokens
              "cacheRead": 0.001, // USD per 1M cached read tokens
              "cacheWrite": 0.0125 // USD per 1M cache write tokens
            }
          }
        ]
      }
    }
  }
}
```

### Step 2: Choose Compatible API

Select the API that matches your provider's interface:

| API Type | Use For | Example Providers |
|----------|---------|-------------------|
| `openai-completions` | OpenAI-compatible APIs | Most providers, Ollama, LM Studio |
| `anthropic-messages` | Anthropic-compatible | Claude-compatible APIs |
| `google-generative-ai` | Google Gemini API | Google AI Studio |
| `bedrock-converse-stream` | AWS Bedrock | Amazon Bedrock |
| `azure-openai-responses` | Azure OpenAI | Microsoft Azure |
| `ollama` | Ollama local | Local Ollama instances |

### Step 3: Configure Authentication

#### Option A: Direct API Key
```json5
{
  "models": {
    "providers": {
      "your-provider": {
        "apiKey": "your-actual-api-key"
      }
    }
  }
}
```

#### Option B: Environment Variable
```json5
{
  "models": {
    "providers": {
      "your-provider": {
        "apiKey": {
          "source": "env",
          "provider": "env", 
          "id": "YOUR_PROVIDER_API_KEY"
        }
      }
    }
  }
}
```

Then set: `export YOUR_PROVIDER_API_KEY="your-key"`

#### Option C: Multiple Keys (for rate limiting)
```json5
{
  "models": {
    "providers": {
      "your-provider": {
        "apiKey": [
          "key-1",
          "key-2", 
          "key-3"
        ]
      }
    }
  }
}
```

### Step 4: Test Your Provider

```bash
# Verify configuration
openclaw doctor

# List available models
openclaw models list

# Test with your new provider
openclaw agent --model "your-provider/your-model-id" --message "Hello!"
```

## Method 2: Plugin-Based Provider (Advanced)

For providers that need custom authentication, special handling, or aren't API-compatible.

### Step 1: Create Provider Plugin

Create `extensions/your-provider/src/index.ts`:

```typescript
import type { ProviderPlugin } from "openclaw/plugin-sdk";

export const plugin: ProviderPlugin = {
  id: "your-provider",
  name: "Your Provider",
  version: "1.0.0",
  
  // Provider configuration
  provider: {
    id: "your-provider",
    name: "Your Provider",
    
    // Custom authentication
    auth: {
      type: "custom",
      async resolveAuth(context) {
        // Custom auth logic here
        return {
          apiKey: await getCustomApiKey(),
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-Provider-ID": "openclaw"
          }
        };
      }
    },
    
    // Model discovery
    async discoverModels(context) {
      const response = await fetch("https://api.yourprovider.com/models", {
        headers: context.auth.headers
      });
      const models = await response.json();
      
      return models.map(model => ({
        id: model.id,
        name: model.name,
        reasoning: model.supports_reasoning || false,
        input: model.input_types || ["text"],
        contextWindow: model.context_length || 4096,
        maxTokens: model.max_tokens || 1024,
        cost: {
          input: model.pricing?.input || 0.01,
          output: model.pricing?.output || 0.03,
          cacheRead: 0,
          cacheWrite: 0
        }
      }));
    },
    
    // Custom model normalization
    normalizeModel(model, context) {
      // Apply provider-specific adjustments
      if (model.id.includes("reasoning")) {
        model.reasoning = true;
      }
      return model;
    },
    
    // Custom request handling
    async prepareRequest(request, context) {
      // Modify requests before sending
      request.headers["X-Request-ID"] = generateRequestId();
      return request;
    }
  }
};

async function getCustomApiKey(): Promise<string> {
  // Your custom auth logic
  return process.env.YOUR_PROVIDER_API_KEY || "";
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### Step 2: Create Plugin Manifest

Create `extensions/your-provider/package.json`:

```json
{
  "name": "@openclaw/your-provider",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "openclaw": {
    "plugin": {
      "type": "provider",
      "id": "your-provider"
    }
  },
  "dependencies": {
    "openclaw": "workspace:*"
  }
}
```

### Step 3: Register Plugin

Add to your `openclaw.json`:

```json5
{
  "plugins": {
    "providers": {
      "your-provider": {
        "enabled": true,
        "config": {
          "apiKey": "your-key",
          "baseUrl": "https://api.yourprovider.com"
        }
      }
    }
  }
}
```

## Real-World Examples

### Example 1: Groq (OpenAI-Compatible)

```json5
{
  "models": {
    "providers": {
      "groq": {
        "baseUrl": "https://api.groq.com/openai/v1",
        "apiKey": "${GROQ_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "llama-3.1-70b-versatile",
            "name": "Llama 3.1 70B",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 131072,
            "maxTokens": 8192,
            "cost": {
              "input": 0.59,
              "output": 0.79,
              "cacheRead": 0,
              "cacheWrite": 0
            }
          }
        ]
      }
    }
  }
}
```

### Example 2: Cohere

```json5
{
  "models": {
    "providers": {
      "cohere": {
        "baseUrl": "https://api.cohere.ai/v1",
        "apiKey": "${COHERE_API_KEY}",
        "api": "openai-completions",
        "headers": {
          "Authorization": "Bearer ${COHERE_API_KEY}"
        },
        "models": [
          {
            "id": "command-r-plus",
            "name": "Command R+",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": {
              "input": 3.0,
              "output": 15.0,
              "cacheRead": 0,
              "cacheWrite": 0
            }
          }
        ]
      }
    }
  }
}
```

### Example 3: Custom Provider with OAuth

```json5
{
  "models": {
    "providers": {
      "custom-oauth-provider": {
        "baseUrl": "https://api.customprovider.com/v1",
        "auth": "oauth",
        "api": "openai-completions",
        "models": [
          {
            "id": "custom-model-1",
            "name": "Custom Model 1",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 200000,
            "maxTokens": 8192,
            "cost": {
              "input": 2.0,
              "output": 6.0,
              "cacheRead": 0.2,
              "cacheWrite": 2.5
            }
          }
        ]
      }
    }
  }
}
```

## Advanced Configuration Options

### Model Compatibility Settings

```json5
{
  "models": [
    {
      "id": "your-model",
      "name": "Your Model",
      "compat": {
        "supportsTools": true,
        "supportsReasoningEffort": false,
        "requiresStringContent": true,
        "thinkingFormat": "openai",
        "toolSchemaProfile": "openai",
        "maxTokensField": "max_tokens"
      }
    }
  ]
}
```

### Tiered Pricing

```json5
{
  "cost": {
    "input": 0.01,
    "output": 0.03,
    "cacheRead": 0,
    "cacheWrite": 0,
    "tieredPricing": [
      {
        "range": [0, 100000],
        "input": 0.01,
        "output": 0.03,
        "cacheRead": 0,
        "cacheWrite": 0
      },
      {
        "range": [100000],  // Open-ended: 100k+
        "input": 0.008,
        "output": 0.025,
        "cacheRead": 0,
        "cacheWrite": 0
      }
    ]
  }
}
```

### Custom Headers and Request Config

```json5
{
  "models": {
    "providers": {
      "your-provider": {
        "headers": {
          "User-Agent": "OpenClaw/1.0",
          "X-API-Version": "2024-01-01",
          "X-Custom-Auth": "${CUSTOM_TOKEN}"
        },
        "request": {
          "timeout": 30000,
          "retries": 3,
          "retryDelay": 1000
        }
      }
    }
  }
}
```

## Testing Your Provider

### 1. Configuration Validation
```bash
openclaw doctor
```

### 2. Model Discovery
```bash
openclaw models list --provider your-provider
```

### 3. Authentication Test
```bash
openclaw models status --provider your-provider
```

### 4. Basic Completion Test
```bash
openclaw agent --model "your-provider/your-model" --message "Hello, world!"
```

### 5. Verbose Testing
```bash
openclaw agent --model "your-provider/your-model" --message "Test" --verbose
```

## Troubleshooting

### Common Issues

1. **"Provider not found"**
   - Check provider ID matches exactly
   - Verify `models.providers.{id}` in config
   - Run `openclaw doctor` for validation

2. **"No API key found"**
   - Verify `apiKey` field is set
   - Check environment variables are exported
   - Test with `openclaw auth-profiles list`

3. **"Model not available"**
   - Check model ID matches provider's API
   - Verify model is in `models` array
   - Run `openclaw models list` to see discovered models

4. **Authentication errors**
   - Verify API key is valid
   - Check required headers for your provider
   - Test API directly with curl/Postman first

5. **API compatibility issues**
   - Try different `api` types
   - Check provider's API documentation
   - Consider using plugin approach for custom APIs

### Debug Commands

```bash
# Check configuration
openclaw config get models.providers.your-provider

# Test auth resolution
openclaw auth-profiles list

# Verbose model discovery
OPENCLAW_DEBUG=1 openclaw models list

# Test with full logging
OPENCLAW_LOG_LEVEL=debug openclaw agent --model "your-provider/model" --message "test"
```

## Security Best Practices

1. **Never commit API keys** - Use environment variables or SecretRef
2. **Use file permissions** - OpenClaw sets models.json to 0600 automatically
3. **Audit secrets** - Run `openclaw secrets audit` regularly
4. **Use multi-key rotation** - For production, use multiple API keys
5. **Monitor usage** - Track costs and rate limits

## Next Steps

After adding your provider:

1. **Set as default** - Configure in `agents.defaults.model`
2. **Add fallbacks** - Set up fallback models for reliability
3. **Configure per-agent** - Different models for different agents
4. **Monitor costs** - Track usage with built-in cost tracking
5. **Share configuration** - Document setup for your team

## Provider Plugin Development

For advanced providers, see:
- `extensions/openai/` - OpenAI plugin example
- `extensions/anthropic/` - Anthropic plugin example
- `extensions/bedrock/` - AWS Bedrock plugin example
- `src/plugins/provider-runtime.ts` - Plugin hook system
- Plugin SDK documentation in `src/plugin-sdk/`

The plugin system allows complete customization of:
- Authentication flows
- Model discovery
- Request/response transformation
- Error handling
- Cost calculation
- Compatibility patches

This gives you full control over how OpenClaw integrates with your provider's unique API and features.
