# AWS Bedrock Agent Setup

This guide walks you through setting up CaretForge with Amazon Bedrock AgentCore step by step.

## Prerequisites

- An [AWS account](https://aws.amazon.com/free/) with an active subscription
- Amazon Bedrock access enabled for your region
- A Bedrock Agent created and an Alias deployed

## Step 1: Get Your Agent Runtime ARN

You need the ARN for the Agent Alias you want to invoke:

1. Go to the [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Select **Agents** from the left navigation
3. Click on your Agent's name
4. Scroll down to the **Aliases** section
5. Copy the **ARN** for the alias you want to use. It looks like:

```
arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID
```

## Step 2: Configure Credentials

CaretForge uses the standard AWS SDK credential chain. You can authenticate using any of the following methods:

| Method | Configuration |
| :--- | :--- |
| **Access Key + Secret** | Direct credentials via config or env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) |
| **AWS CLI Profile** | Use `aws configure` or SSO, then set the `profile` field in config |
| **IAM Role** | Automatic via Instance Profile or Assumed Role (e.g. on EC2/ECS) |
| **Environment** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` |

## Step 3: Configure CaretForge

### Option A: Config File

Run the config initializer:

```bash
caretforge config init --with-secrets
```

Then edit `~/.config/caretforge/config.json`:

```json
{
  "defaultProvider": "aws-bedrock-agent-core",
  "providers": {
    "awsBedrockAgentCore": {
      "region": "us-east-1",
      "agentRuntimeArn": "arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID",
      "profile": "default"
    }
  }
}
```

### Option B: Environment Variables (CaretForge specific)

CaretForge also looks for provider-specific environment variables:

```bash
export CARETFORGE_AWS_REGION="us-east-1"
export CARETFORGE_AWS_AGENT_ARN="arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID"
```

## Step 4: Validate

```bash
caretforge doctor
```

All checks should pass. Then test a request:

```bash
caretforge run "What can you do?" --provider aws-bedrock-agent-core
```

## Session Management

CaretForge automatically handles session management with Bedrock Agents. Every time you start a conversation, a deterministic `sessionId` is generated (SHA-256 hash of your ARN and timestamp) to provide a unique context for that run.

## Sig V4 Signing

CaretForge uses the standard AWS SDK for JavaScript (v3) to handle Signature Version 4 (Sig V4) signing. It will automatically look for credentials in:
1. The `config.json` file (`accessKeyId`, `secretAccessKey`)
2. Environment variables (`AWS_ACCESS_KEY_ID`, etc.)
3. The specified AWS profile
4. The default SDK credential provider chain (IAM roles, container credentials, etc.)

## Troubleshooting

### "Invalid Agent Runtime ARN"
- Verify the ARN copied from the AWS console matches the format `arn:aws:bedrock:REGION:ACCOUNT:agent-alias/ID/ALIAS`.

### Access Denied
- Ensure your IAM user or role has the `bedrock:InvokeAgent` permission for the specific agent resource.
- Check if the agent is in the `PREPARED` state in the AWS console.

### Region Mismatch
- Ensure the `region` in your config matches the region where the Bedrock Agent is deployed.
