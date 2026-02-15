# Azure AI Foundry Setup

This guide walks you through setting up CaretForge with Azure AI Foundry step by step.

## Prerequisites

- An [Azure account](https://azure.microsoft.com/free/) with an active subscription
- An [Azure AI Foundry](https://ai.azure.com) resource with at least one model deployed

## Step 1: Find Your Endpoint

Your endpoint URL depends on where your models are deployed:

1. Go to [Azure AI Foundry](https://ai.azure.com)
2. Open your project
3. Go to **Settings** in the left sidebar
4. Find the **Endpoint** URL — it looks like:

```
https://YOUR-RESOURCE.services.ai.azure.com
```

or for Azure OpenAI resources:

```
https://YOUR-RESOURCE.openai.azure.com
```

## Step 2: Get Your API Key

1. In the Azure Portal, navigate to your AI Services resource
2. Go to **Keys and Endpoint** in the left sidebar
3. Copy **Key 1** or **Key 2**

Alternatively, retrieve it via Azure CLI:

```bash
az cognitiveservices account keys list \
  --name YOUR-RESOURCE-NAME \
  --resource-group YOUR-RESOURCE-GROUP \
  -o json
```

## Step 3: Find Your Model Deployment Name

1. In Azure AI Foundry, go to **Deployments**
2. Note the **Name** column — this is what you'll pass as `--model`

Common deployment names: `gpt-4o`, `gpt-4.1`, `gpt-35-turbo`, `Kimi-K2.5`

You can also list deployments via CLI:

```bash
az cognitiveservices account deployment list \
  --name YOUR-RESOURCE-NAME \
  --resource-group YOUR-RESOURCE-GROUP \
  --query "[].{name:name, model:properties.model.name}" \
  -o table
```

## Step 4: Configure CaretForge

### Option A: Environment Variables (Recommended for Getting Started)

```bash
export CARETFORGE_AZURE_ENDPOINT="https://YOUR-RESOURCE.services.ai.azure.com"
export CARETFORGE_AZURE_API_KEY="your-key-here"
```

### Option B: Config File

```bash
caretforge config init --with-secrets
```

Then edit `~/.config/caretforge/config.json`:

```json
{
  "defaultProvider": "azure-foundry",
  "providers": {
    "azureFoundry": {
      "endpoint": "https://YOUR-RESOURCE.services.ai.azure.com",
      "apiKey": "your-key-here",
      "authMode": "apiKey",
      "models": [{ "id": "gpt-4.1", "description": "GPT-4.1" }],
      "apiVersion": "2024-10-21"
    }
  }
}
```

## Step 5: Validate

```bash
caretforge doctor
```

All checks should pass. Then test a request:

```bash
caretforge run "Say hello" --model gpt-4.1
```

## URL Structure

CaretForge constructs API URLs in this format:

```
{endpoint}/openai/deployments/{model}/chat/completions?api-version={apiVersion}
```

If your endpoint uses a different path structure, override `chatCompletionPath` in the config:

```json
{
  "chatCompletionPath": "/your/custom/path"
}
```

## Authentication Modes

| Mode              | Status        | Description                                                         |
| ----------------- | ------------- | ------------------------------------------------------------------- |
| `apiKey`          | **Supported** | Uses `api-key` header. Set via config or `CARETFORGE_AZURE_API_KEY` |
| `azureCli`        | Stub          | Will use `az account get-access-token` for Bearer auth              |
| `managedIdentity` | Stub          | For Azure-hosted environments                                       |

## Azure AI Agents (Preview)

If you have an Azure AI Foundry Agent (created through the portal's Agent Builder), CaretForge also supports the `azure-agents` provider:

```bash
caretforge run "Hello" --provider azure-agents
```

This uses the Azure AI Agent Service API (threads/runs) and supports Azure CLI authentication. See the [Configuration](/getting-started/configuration) page for the `azureAgents` provider fields.

## Anthropic Models (Claude) on Azure

If you have Anthropic models deployed on Azure (like Claude Opus), these use a different API format. CaretForge includes the `azure-anthropic` provider specifically for this.

### Finding Your Anthropic Endpoint

Your Anthropic-on-Azure endpoint typically looks like:

```
https://YOUR-RESOURCE.openai.azure.com/anthropic
```

Note the `/anthropic` suffix — this is the Anthropic API gateway within your Azure OpenAI resource.

### Configuration

```json
{
  "defaultProvider": "azure-anthropic",
  "providers": {
    "azureAnthropic": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com/anthropic",
      "apiKey": "your-azure-api-key",
      "models": [{ "id": "claude-opus-4-6", "description": "Claude Opus 4-6" }]
    }
  }
}
```

### Test It

```bash
caretforge run "Say hello" --provider azure-anthropic --model claude-opus-4-6
```

::: tip
The same Azure API key that works for your OpenAI models works for Anthropic models too — it's the same Azure resource.
:::

### Streaming & Tool Calling

The `azure-anthropic` provider supports both streaming and tool calling using the Anthropic Messages API format. CaretForge transparently handles the conversion between its internal format and Anthropic's content block format.

## Azure OpenAI Responses API (Codex Models)

Some newer Azure OpenAI models — such as `gpt-5.2-codex` and `codex-mini` — use the **Responses API** instead of Chat Completions. CaretForge includes the `azure-responses` provider specifically for these models.

### Why a Separate Provider?

The Responses API is a different endpoint with a distinct request/response format:

- Uses `input` instead of `messages`
- System prompts go in an `instructions` field
- Tool calls appear as `function_call` items in the `output` array
- Streaming events follow a different SSE protocol

### Finding Your Endpoint

The endpoint is your standard Azure OpenAI resource URL (no special suffix):

```
https://YOUR-RESOURCE.openai.azure.com
```

### URL Construction

```
{endpoint}/openai/v1/responses
```

### Configuration

```json
{
  "defaultProvider": "azure-responses",
  "providers": {
    "azureResponses": {
      "endpoint": "https://YOUR-RESOURCE.openai.azure.com",
      "apiKey": "your-azure-api-key",
      "models": [{ "id": "gpt-5.2-codex", "description": "GPT-5.2 Codex (Responses API)" }]
    }
  }
}
```

### Test It

```bash
caretforge run "Say hello" --provider azure-responses --model gpt-5.2-codex
```

::: tip
The same Azure API key works across Chat Completions, Anthropic, and Responses API endpoints on the same Azure resource.
:::

### Streaming & Tool Calling

The `azure-responses` provider supports both streaming and tool calling. Streaming events use a different protocol from Chat Completions SSE — CaretForge handles this transparently.

## Third-Party Models on Azure AI Foundry

Azure AI Foundry hosts third-party models alongside Microsoft's own. Many of these are compatible with the standard OpenAI chat completions format and can be used with the `azure-foundry` provider.

### Kimi K2.5 (MoonshotAI)

Kimi K2.5 is a reasoning model by MoonshotAI, available through Azure AI Foundry's model catalog. It follows the OpenAI chat completions format, so you can add it to your `azure-foundry` configuration:

```json
{
  "providers": {
    "azureFoundry": {
      "endpoint": "https://YOUR-RESOURCE.services.ai.azure.com",
      "apiKey": "your-key",
      "models": [
        { "id": "gpt-4.1" },
        { "id": "Kimi-K2.5", "description": "Kimi K2.5 (MoonshotAI reasoning model)" }
      ]
    }
  }
}
```

```bash
caretforge run "Explain recursion" --model Kimi-K2.5
```

::: tip
Kimi K2.5 is a reasoning model — it may include internal chain-of-thought in its responses via `reasoning_content`. CaretForge processes this transparently.
:::

## Troubleshooting

### "Unknown model" error

- Verify the deployment name matches exactly (case-sensitive)
- Non-OpenAI models (Anthropic, etc.) may require a different endpoint format
- Check `caretforge model list` to see configured models

### 401 Unauthorized

- Check your API key is correct
- Verify the endpoint URL matches your resource
- For Azure CLI auth, run `az login` and ensure the correct subscription is active

### 404 Not Found

- The `chatCompletionPath` or `apiVersion` may be wrong for your endpoint
- Try `apiVersion: "2024-10-21"` for newer resources
