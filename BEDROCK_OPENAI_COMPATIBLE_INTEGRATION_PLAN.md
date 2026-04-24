# Bedrock OpenAI-Compatible Integration Plan

## Overview

Based on your `test_bedrock.py` file, you want to integrate an **OpenAI-compatible Bedrock endpoint** into OpenClaw. The good news is that OpenClaw already has infrastructure for this via the `amazon-bedrock-mantle` extension.

## Current Test Analysis

Your Python test shows:
- **Endpoint**: Uses `OPENAI_BASE_URL` environment variable
- **Authentication**: Uses `OPENAI_API_KEY` environment variable  
- **Model**: Testing `openai.gpt-oss-120b`
- **API**: Standard OpenAI Chat Completions API
- **Functionality**: Model listing + chat completion

## Integration Plan

### Phase 1: Quick Configuration Setup (15 minutes)

#### Step 1.1: Configure Environment Variables
Based on your test, set up the environment:

```bash
# Set your Bedrock Mantle endpoint
export OPENAI_BASE_URL="your-bedrock-mantle-endpoint-url"

# Set your API key/token
export OPENAI_API_KEY="your-bedrock-api-key-or-token"

# Alternative: Use AWS Bedrock token
export AWS_BEARER_TOKEN_BEDROCK="your-aws-bearer-token"
```

#### Step 1.2: Add Provider Configuration
Add to your `~/.openclaw/openclaw.json`:

```json5
{
  "models": {
    "mode": "merge",
    "providers": {
      "bedrock-openai-compat": {
        "baseUrl": "${OPENAI_BASE_URL}",
        "apiKey": "${OPENAI_API_KEY}",
        "api": "openai-completions",
        "headers": {
          "User-Agent": "OpenClaw/1.0"
        },
        "models": [
          {
            "id": "openai.gpt-oss-120b",
            "name": "OpenAI GPT OSS 120B (Bedrock)",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": {
              "input": 0.01,
              "output": 0.03,
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

#### Step 1.3: Test Basic Integration
```bash
# Verify configuration
openclaw doctor

# Test model discovery
openclaw models list --provider bedrock-openai-compat

# Test completion
openclaw agent --model "bedrock-openai-compat/openai.gpt-oss-120b" --message "Hello!"
```

### Phase 2: Enhanced Configuration (30 minutes)

#### Step 2.1: Use Existing Bedrock Mantle Extension
Enable the built-in `amazon-bedrock-mantle` extension:

```json5
{
  "plugins": {
    "providers": {
      "amazon-bedrock-mantle": {
        "enabled": true
      }
    }
  },
  "models": {
    "providers": {
      "amazon-bedrock-mantle": {
        "baseUrl": "${OPENAI_BASE_URL}",
        "apiKey": "${AWS_BEARER_TOKEN_BEDROCK}",
        "api": "openai-completions"
        // Models will be auto-discovered
      }
    }
  }
}
```

#### Step 2.2: Configure AWS Authentication
If using AWS credentials:

```bash
# Option A: AWS Profile
export AWS_PROFILE="your-profile"

# Option B: Direct credentials
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"

# Option C: Bedrock Bearer Token
export AWS_BEARER_TOKEN_BEDROCK="your-bearer-token"
```

#### Step 2.3: Auto-Discovery Setup
The Bedrock Mantle extension can auto-discover models:

```json5
{
  "models": {
    "providers": {
      "amazon-bedrock-mantle": {
        "baseUrl": "${OPENAI_BASE_URL}",
        "apiKey": "${AWS_BEARER_TOKEN_BEDROCK}",
        "api": "openai-completions"
        // No need to specify models - will be discovered from /v1/models
      }
    }
  }
}
```

### Phase 3: Production Configuration (45 minutes)

#### Step 3.1: Secure Secret Management
Use OpenClaw's SecretRef system:

```json5
{
  "secrets": {
    "defaults": {
      "provider": "file",
      "file": "~/.openclaw/secrets.json"
    }
  },
  "models": {
    "providers": {
      "amazon-bedrock-mantle": {
        "baseUrl": "${OPENAI_BASE_URL}",
        "apiKey": {
          "source": "file",
          "provider": "default",
          "id": "/bedrock/apiKey"
        },
        "api": "openai-completions"
      }
    }
  }
}
```

Create `~/.openclaw/secrets.json`:
```json
{
  "bedrock": {
    "apiKey": "your-actual-api-key"
  }
}
```

#### Step 3.2: Multi-Key Rotation
For production resilience:

```json5
{
  "models": {
    "providers": {
      "amazon-bedrock-mantle": {
        "baseUrl": "${OPENAI_BASE_URL}",
        "apiKey": [
          "${AWS_BEARER_TOKEN_BEDROCK_1}",
          "${AWS_BEARER_TOKEN_BEDROCK_2}",
          "${AWS_BEARER_TOKEN_BEDROCK_3}"
        ],
        "api": "openai-completions"
      }
    }
  }
}
```

#### Step 3.3: Agent Configuration
Set as default model:

```json5
{
  "agents": {
    "defaults": {
      "model": "amazon-bedrock-mantle/openai.gpt-oss-120b",
      "models": {
        "amazon-bedrock-mantle/openai.gpt-oss-120b": {
          "params": {
            "temperature": 0.7,
            "maxTokens": 4096
          }
        }
      }
    }
  }
}
```

### Phase 4: Custom Extension (Optional - 2 hours)

If you need custom behavior, create a dedicated extension:

#### Step 4.1: Create Custom Extension
```bash
mkdir -p extensions/bedrock-custom/src
```

#### Step 4.2: Implement Provider Plugin
Create `extensions/bedrock-custom/src/index.ts`:

```typescript
import type { ProviderPlugin } from "openclaw/plugin-sdk";

export const plugin: ProviderPlugin = {
  id: "bedrock-custom",
  name: "Custom Bedrock OpenAI Compatible",
  version: "1.0.0",
  
  provider: {
    id: "bedrock-custom",
    name: "Custom Bedrock",
    
    async discoverModels(context) {
      // Custom model discovery from your endpoint
      const response = await fetch(`${context.baseUrl}/v1/models`, {
        headers: {
          "Authorization": `Bearer ${context.apiKey}`,
          "Content-Type": "application/json"
        }
      });
      
      const data = await response.json();
      
      return data.data.map(model => ({
        id: model.id,
        name: model.id.replace(/\./g, " ").toUpperCase(),
        reasoning: model.id.includes("reasoning") || model.id.includes("gpt"),
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: {
          input: 0.01,
          output: 0.03,
          cacheRead: 0,
          cacheWrite: 0
        }
      }));
    },
    
    normalizeModel(model, context) {
      // Custom model normalization
      if (model.id.startsWith("openai.")) {
        model.reasoning = true;
      }
      return model;
    }
  }
};
```

## Implementation Steps

### Immediate (Today)
1. **Test Phase 1** - Basic configuration
2. **Verify connectivity** with your endpoint
3. **Validate model discovery** works

### Short-term (This Week)  
1. **Implement Phase 2** - Use built-in Bedrock Mantle extension
2. **Set up auto-discovery** for all available models
3. **Configure as default** agent model

### Medium-term (Next Week)
1. **Implement Phase 3** - Production security
2. **Set up monitoring** and cost tracking
3. **Configure fallbacks** and error handling

### Long-term (Optional)
1. **Phase 4** - Custom extension if needed
2. **Advanced features** like custom thinking modes
3. **Integration testing** and performance optimization

## Testing Strategy

### Unit Tests
```bash
# Test configuration
openclaw doctor

# Test model listing
openclaw models list

# Test authentication
openclaw models status --provider bedrock-custom
```

### Integration Tests
```bash
# Basic completion
openclaw agent --model "bedrock-custom/openai.gpt-oss-120b" --message "Hello"

# Reasoning test
openclaw agent --model "bedrock-custom/openai.gpt-oss-120b" --message "Solve: 2+2" --thinking high

# Image test (if supported)
openclaw agent --model "bedrock-custom/openai.gpt-oss-120b" --image "test.jpg" --message "Describe this"
```

### Load Tests
```bash
# Multiple requests
for i in {1..10}; do
  openclaw agent --model "bedrock-custom/openai.gpt-oss-120b" --message "Test $i" &
done
wait
```

## Success Criteria

### Phase 1 Success
- ✅ Configuration loads without errors
- ✅ Model appears in `openclaw models list`
- ✅ Basic completion works
- ✅ Matches your Python test behavior

### Phase 2 Success  
- ✅ Auto-discovery finds all models
- ✅ Authentication works seamlessly
- ✅ Integration with existing OpenClaw features

### Phase 3 Success
- ✅ Secure secret management
- ✅ Multi-key rotation works
- ✅ Production-ready configuration
- ✅ Monitoring and alerting

### Phase 4 Success (Optional)
- ✅ Custom extension loads
- ✅ Advanced features work
- ✅ Performance optimizations
- ✅ Full test coverage

## Risk Mitigation

### Technical Risks
- **API compatibility issues** → Test with existing Bedrock Mantle extension first
- **Authentication failures** → Multiple auth methods configured
- **Rate limiting** → Multi-key rotation setup
- **Model discovery failures** → Fallback to manual configuration

### Operational Risks  
- **Secret exposure** → Use SecretRef system
- **Configuration drift** → Version control config files
- **Monitoring gaps** → Set up alerts and logging
- **Cost overruns** → Configure usage limits

## Next Steps

1. **Start with Phase 1** - Get basic integration working
2. **Validate against your Python test** - Ensure same behavior
3. **Move to Phase 2** - Leverage existing infrastructure
4. **Plan Phase 3** - Production readiness
5. **Evaluate Phase 4** - Custom extension if needed

Would you like me to help you implement Phase 1 right now?
