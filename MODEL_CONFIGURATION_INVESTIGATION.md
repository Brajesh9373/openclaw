# OpenClaw Model Configuration System Investigation

## Overview

OpenClaw uses a sophisticated multi-layered model configuration system that manages AI model providers, authentication, discovery, and runtime selection. The system is designed to support multiple providers (OpenAI, Anthropic, Bedrock, Ollama, etc.) with flexible authentication and automatic model discovery.

## Core Architecture

### 1. Configuration Layers

The model configuration flows through several layers:

```
User Config (openclaw.json)
    ↓
models.providers → Provider Definitions
    ↓
models.json (generated) → Runtime Model Registry
    ↓
Model Discovery & Selection
    ↓
Runtime Execution
```

### 2. Key Components

#### **models-config.ts** - Main Configuration Manager
- **Purpose**: Generates and maintains `models.json` from user configuration
- **Location**: `src/agents/models-config.ts`
- **Key Function**: `ensureOpenClawModelsJson(config?, agentDirOverride?)`
  - Creates/updates `~/.openclaw/agents/main/agent/models.json`
  - Uses fingerprinting to avoid unnecessary rewrites
  - Handles write locking for concurrent access
  - Sets file mode to 0600 for security

#### **models-config.plan.ts** - Configuration Planning
- **Purpose**: Determines what changes need to be made to models.json
- **Key Functions**:
  - `planOpenClawModelsJson()` - Returns skip/noop/write action
  - `resolveProvidersForModelsJsonWithDeps()` - Merges explicit + implicit providers
- **Modes**:
  - `merge`: Combines built-in providers with user config (default)
  - `replace`: Uses only user-configured providers

#### **models-config.providers.secrets.ts** - Authentication Management
- **Purpose**: Resolves API keys and authentication from multiple sources
- **Resolution Order**:
  1. Environment variables (e.g., `OPENAI_API_KEY`)
  2. Config-backed synthetic auth (plugin-provided)
  3. Auth profiles (`auth-profiles.json`)
  4. OAuth credentials
- **Key Functions**:
  - `createProviderApiKeyResolver()` - Resolves API keys
  - `createProviderAuthResolver()` - Full auth resolution with mode detection

#### **pi-model-discovery.ts** - Model Registry
- **Purpose**: Discovers and normalizes available models
- **Key Functions**:
  - `discoverAuthStorage()` - Creates auth storage from profiles + env
  - `discoverModels()` - Returns model registry with provider normalization
- **Integration**: Uses `@mariozechner/pi-coding-agent` SDK
- **Normalization**: Applies plugin hooks for provider-specific model adjustments

### 3. Configuration Structure

#### User Configuration (`openclaw.json`)

```json5
{
  "models": {
    "mode": "merge",  // or "replace"
    "providers": {
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-...",  // or array for rotation
        "api": "openai-completions",
        "models": [
          {
            "id": "gpt-4",
            "name": "GPT-4",
            "reasoning": false,
            "input": ["text", "image"],
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": {
              "input": 30.0,
              "output": 60.0,
              "cacheRead": 3.0,
              "cacheWrite": 37.5
            }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "openai/gpt-4",  // or { primary: "...", fallbacks: [...] }
      "imageModel": "openai/gpt-4-vision",
      "videoGenerationModel": "motion-one/animate-v1",
      "models": {
        "openai/gpt-4": {
          "params": {
            "temperature": 0.7,
            "thinking": "adaptive"
          }
        }
      }
    },
    "list": [
      {
        "id": "coding-assistant",
        "model": "anthropic/claude-sonnet-4.5",
        "thinkingDefault": "high"
      }
    ]
  }
}
```

#### Generated Runtime File (`models.json`)

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "{{OPENCLAW_SECRET_REF:file:...}}",
      "api": "openai-completions",
      "models": [...]
    }
  }
}
```

### 4. Model Selection Flow

```
User Request
    ↓
resolveDefaultModelForAgent() → Check agent-specific model
    ↓
buildAllowedModelSet() → Validate against catalog
    ↓
resolveModelWithRegistry() → Find in model registry
    ↓
normalizeModelRef() → Parse provider/model
    ↓
getApiKeyForModel() → Resolve authentication
    ↓
Stream/Complete → Execute request
```

## Authentication System

### Auth Sources (Priority Order)

1. **Environment Variables**
   - Pattern: `{PROVIDER}_API_KEY` (e.g., `OPENAI_API_KEY`)
   - Resolved via `resolveEnvApiKeyVarName()`
   - Supports AWS SDK vars for Bedrock

2. **Synthetic Auth (Plugin-Provided)**
   - Providers can inject auth via plugins
   - Used for special cases (e.g., GitHub Copilot)
   - Resolved via `resolveProviderSyntheticAuthWithPlugin()`

3. **Auth Profiles** (`auth-profiles.json`)
   - Stored at `~/.openclaw/agents/main/agent/auth-profiles.json`
   - Supports multiple credential types:
     - `api_key`: Direct API keys
     - `oauth`: OAuth tokens with refresh
     - `aws_sdk`: AWS credential profiles
   - Managed via `ensureAuthProfileStore()`

4. **Config-Backed Auth**
   - Direct `apiKey` in `models.providers.{provider}.apiKey`
   - Supports SecretRef markers for secure storage

### Multi-Key Rotation

Supports API key arrays for automatic rotation:

```json5
{
  "models": {
    "providers": {
      "openai": {
        "apiKey": [
          "sk-key1...",
          "sk-key2...",
          "sk-key3..."
        ]
      }
    }
  }
}
```

- Automatic rotation on rate limits
- Cooldown management for failed keys
- Backward compatible with single keys

## Model Discovery

### Discovery Process

1. **Explicit Providers** - User-configured in `models.providers`
2. **Implicit Providers** - Auto-discovered from:
   - Environment variables
   - Auth profiles
   - Plugin-provided synthetic auth
3. **Merge/Replace** - Combined based on `models.mode`
4. **Normalization** - Provider-specific adjustments via plugins
5. **Registry Creation** - Pi SDK model registry with OpenClaw wrappers

### Provider Plugins

Providers can customize behavior via plugin hooks:

- `normalizeProviderResolvedModelWithPlugin()` - Adjust model metadata
- `applyProviderResolvedModelCompatWithPlugins()` - Apply compatibility patches
- `applyProviderResolvedTransportWithPlugin()` - Modify transport settings
- `normalizeProviderConfigWithPlugin()` - Normalize provider config
- `resolveProviderConfigApiKeyWithPlugin()` - Custom API key resolution

## Agent Configuration

### Agent Model Selection

Agents can specify models at multiple levels:

1. **Global Defaults** - `agents.defaults.model`
2. **Per-Agent** - `agents.list[].model`
3. **Per-Capability** - `agents.defaults.imageModel`, `videoGenerationModel`
4. **Subagent Defaults** - `agents.list[].subagents.model`

### Model Config Types

```typescript
type AgentModelConfig =
  | string  // Simple: "openai/gpt-4"
  | {
      primary?: string;
      fallbacks?: string[];  // Automatic fallback chain
    };
```

### Per-Model Parameters

```json5
{
  "agents": {
    "defaults": {
      "models": {
        "openai/gpt-4": {
          "params": {
            "temperature": 0.7,
            "thinking": "adaptive",
            "maxTokens": 4096
          }
        }
      }
    }
  }
}
```

## Security Features

### Secret Management

1. **SecretRef System**
   - Markers: `{{OPENCLAW_SECRET_REF:file:...}}`
   - Prevents plaintext secrets in `models.json`
   - Resolved at runtime from secure storage

2. **File Permissions**
   - `models.json`: mode 0600 (owner read/write only)
   - `auth-profiles.json`: mode 0600
   - Atomic writes via temp files

3. **Secret Audit**
   - `openclaw secrets audit` - Scans for plaintext secrets
   - Checks `models.json`, `auth-profiles.json`, `.env`
   - Flags unresolved SecretRef objects

### Dangerous Flags

Tracked in security audit:
- `agents.defaults.sandbox.docker.dangerouslyAllowReservedContainerTargets`
- `agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin`
- `agents.defaults.sandbox.docker.dangerouslyAllowExternalBindSources`

## Model Catalog

### Catalog Entry Structure

```typescript
type ModelCatalogEntry = {
  id: string;           // "gpt-4"
  name: string;         // "GPT-4"
  provider: string;     // "openai"
  alias?: string;       // Alternative name
  contextWindow?: number;
  reasoning?: boolean;  // Supports reasoning/thinking
  input?: ModelInputType[];  // ["text", "image", "document"]
};
```

### Catalog Loading

- **Function**: `loadModelCatalog()`
- **Location**: `src/agents/model-catalog.ts`
- **Sources**:
  1. Built-in catalog (bundled with OpenClaw)
  2. Provider plugin augmentation
  3. Dynamic discovery (Bedrock, Ollama, etc.)
- **Caching**: In-memory cache with invalidation

## Configuration Commands

### CLI Commands

```bash
# List available models
openclaw models list

# Show model status
openclaw models status

# Validate configuration
openclaw doctor

# Audit secrets
openclaw secrets audit

# Manage auth profiles
openclaw auth-profiles list
openclaw auth-profiles add <provider>
openclaw auth-profiles reset <provider>:<profileId>
```

### Configuration Validation

- **Schema Validation**: JSON schema with Zod
- **Config Doctor**: `openclaw doctor` checks:
  - Invalid provider references
  - Missing API keys
  - Deprecated config keys
  - Secret leaks
  - Model availability

## Testing Infrastructure

### Test Helpers

- `ensureOpenClawModelsJsonMock` - Mock models.json generation
- `discoverModelsMock` - Mock model discovery
- `discoverAuthStorageMock` - Mock auth storage
- `resetModelsJsonReadyCacheForTest()` - Clear test state

### Live Testing

```bash
# Enable live tests
OPENCLAW_LIVE_TEST=1 pnpm test:live

# Verbose live tests
OPENCLAW_LIVE_TEST_QUIET=0 pnpm test:live
```

## Performance Optimizations

### Caching Strategy

1. **Fingerprinting** - Avoid unnecessary `models.json` rewrites
   - Includes: config, env vars, auth profiles mtime, models.json mtime
   - Stable JSON serialization for consistent hashes

2. **Write Locking** - Prevent concurrent writes
   - Per-path locks in `MODELS_JSON_STATE.writeLocks`
   - Queued writes for same target

3. **Ready Cache** - Avoid redundant generation
   - Cached in `MODELS_JSON_STATE.readyCache`
   - Invalidated on fingerprint change

4. **Lazy Loading** - Dynamic imports for heavy modules
   - `models-config.runtime.ts` - Lazy boundary
   - `pi-model-discovery-runtime.ts` - Lazy boundary
   - Reduces startup time

## Provider-Specific Features

### Bedrock Discovery

```json5
{
  "models": {
    "bedrockDiscovery": {
      "enabled": true,
      "region": "us-east-1",
      "providerFilter": ["anthropic", "meta"],
      "refreshInterval": 3600,
      "defaultContextWindow": 200000,
      "defaultMaxTokens": 4096
    }
  }
}
```

### Ollama Discovery

```json5
{
  "models": {
    "ollamaDiscovery": {
      "enabled": true
    }
  }
}
```

### GitHub Copilot

- Uses synthetic auth from GitHub CLI
- No explicit API key needed
- Auto-discovered when `gh` is authenticated

## File Locations

### User-Level
- Config: `~/.openclaw/openclaw.json`
- Agent Dir: `~/.openclaw/agents/main/agent/`
- Models: `~/.openclaw/agents/main/agent/models.json`
- Auth Profiles: `~/.openclaw/agents/main/agent/auth-profiles.json`
- Credentials: `~/.openclaw/credentials/`

### Workspace-Level
- Config: `.openclaw/openclaw.json`
- Steering: `.kiro/steering/*.md`
- Hooks: `.kiro/hooks/*.json`

## Key Takeaways

1. **Layered Architecture**: Config → Planning → Generation → Discovery → Runtime
2. **Multiple Auth Sources**: Env vars, profiles, synthetic auth, config
3. **Security First**: SecretRef system, file permissions, audit tools
4. **Plugin Extensibility**: Providers customize via hooks
5. **Performance**: Fingerprinting, caching, lazy loading
6. **Multi-Key Support**: Automatic rotation for rate limit handling
7. **Agent Flexibility**: Per-agent models, fallbacks, parameters
8. **Discovery**: Automatic provider/model discovery from multiple sources

## Related Files

### Core Configuration
- `src/agents/models-config.ts` - Main config manager
- `src/agents/models-config.plan.ts` - Planning logic
- `src/agents/models-config-state.ts` - State management
- `src/agents/models-config.providers.secrets.ts` - Auth resolution
- `src/agents/models-config.merge.ts` - Provider merging

### Model Discovery
- `src/agents/pi-model-discovery.ts` - Model registry
- `src/agents/model-catalog.ts` - Catalog loading
- `src/agents/model-catalog.types.ts` - Catalog types
- `src/agents/model-selection.ts` - Model selection logic

### Provider System
- `src/plugins/provider-runtime.ts` - Provider plugin hooks
- `src/plugins/provider-model-compat.ts` - Compatibility patches
- `src/plugins/synthetic-auth.runtime.ts` - Synthetic auth

### Configuration Types
- `src/config/types.openclaw.ts` - Root config type
- `src/config/types.models.ts` - Models config types
- `src/config/types.agents.ts` - Agents config types
- `src/config/types.agents-shared.ts` - Shared agent types

### Security
- `src/secrets/audit.ts` - Secret scanning
- `src/secrets/storage-scan.ts` - Storage scanning
- `src/security/dangerous-config-flags.ts` - Flag tracking

### Documentation
- `docs/guides/multi-api-key-setup.md` - Multi-key setup guide
