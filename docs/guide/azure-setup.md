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

Common deployment names: `gpt-4o`, `gpt-4.1`, `gpt-35-turbo`

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
