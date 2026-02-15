/**
 * Command safety analysis — classifies shell commands and file write
 * targets by risk level and blocks outright dangerous patterns.
 */

// ── Risk tiers ──────────────────────────────────────────────

export type RiskLevel = 'safe' | 'mutating' | 'destructive' | 'blocked';

export interface SafetyVerdict {
  level: RiskLevel;
  /** Human-readable reason shown to the user. */
  reason: string;
  /** Optional safer alternative suggestion. */
  suggestion?: string;
}

// ── Blocked patterns (deny outright) ────────────────────────

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /rm\s+(-\w*)?r\w*\s+(-\w*\s+)*\//,
    reason: 'Recursive deletion at filesystem root',
  },
  {
    pattern: /rm\s+(-\w*)?r\w*\s+(-\w*\s+)*~/,
    reason: 'Recursive deletion of home directory',
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    reason: 'Fork bomb',
  },
  {
    pattern: />\s*\/dev\/[sh]d[a-z]/,
    reason: 'Direct write to block device',
  },
  {
    pattern: /mkfs\b/,
    reason: 'Filesystem format command',
  },
  {
    pattern: /dd\s.*\bof=\/dev\//,
    reason: 'Direct disk write via dd',
  },
  {
    pattern: /rm\s+(-\w*)?r\w*\s+(-\w*\s+)*\.\s*$/,
    reason: 'Recursive deletion of current directory',
  },
  {
    pattern: /:\s*>\s*\/etc\//,
    reason: 'Truncating system configuration file',
  },
  {
    pattern: /curl\s.*\|\s*(sudo\s+)?(ba)?sh/,
    reason: 'Piping remote script directly into shell',
  },
  {
    pattern: /wget\s.*\|\s*(sudo\s+)?(ba)?sh/,
    reason: 'Piping remote script directly into shell',
  },
];

// ── Destructive commands (always prompt, even with --allow-shell) ─

const DESTRUCTIVE_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s/, reason: 'File deletion' },
  { pattern: /\brm$/, reason: 'File deletion' },
  { pattern: /\bdd\b/, reason: 'Low-level data copy' },
  { pattern: /\bchmod\s+(-\w*)?R/, reason: 'Recursive permission change' },
  { pattern: /\bchown\s+(-\w*)?R/, reason: 'Recursive ownership change' },
  { pattern: /\bkill\s+(-\w*)?9/, reason: 'Force kill process' },
  { pattern: /\bkillall\b/, reason: 'Kill processes by name' },
  { pattern: /\bpkill\b/, reason: 'Kill processes by pattern' },
  { pattern: /\bsudo\b/, reason: 'Elevated privileges' },
  { pattern: /\bsu\s/, reason: 'Switch user' },
  { pattern: /\bshutdown\b/, reason: 'System shutdown' },
  { pattern: /\breboot\b/, reason: 'System reboot' },
  { pattern: /\bsystemctl\s+(stop|restart|disable)/, reason: 'Service management' },
  { pattern: /\biptables\b/, reason: 'Firewall rule modification' },
  { pattern: />\s*\//, reason: 'Redirect overwrite to absolute path' },
];

// ── Safe commands (auto-approve with --allow-shell) ─────────

const SAFE_COMMANDS: RegExp[] = [
  /^\s*ls\b/,
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*less\b/,
  /^\s*more\b/,
  /^\s*echo\b/,
  /^\s*pwd\b/,
  /^\s*whoami\b/,
  /^\s*which\b/,
  /^\s*where\b/,
  /^\s*type\b/,
  /^\s*file\b/,
  /^\s*wc\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*date\b/,
  /^\s*uname\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*ag\b/,
  /^\s*fd\b/,
  /^\s*tree\b/,
  /^\s*diff\b/,
  /^\s*stat\b/,
  /^\s*readlink\b/,
  /^\s*realpath\b/,
  /^\s*git\s+(status|log|diff|show|branch|tag|remote|stash\s+list)\b/,
  /^\s*node\s+(-v|--version)\b/,
  /^\s*npm\s+(ls|list|view|info|outdated|audit)\b/,
  /^\s*pnpm\s+(ls|list|outdated|audit)\b/,
  /^\s*npx\s+tsc\s+--noEmit\b/,
  /^\s*python3?\s+(-V|--version)\b/,
  /^\s*cargo\s+(check|clippy|test)\b/,
  /^\s*go\s+(vet|test)\b/,
];

// ── Blocked write paths ─────────────────────────────────────

const BLOCKED_WRITE_PATHS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\/etc\//, reason: 'System configuration directory' },
  { pattern: /^\/usr\//, reason: 'System binaries directory' },
  { pattern: /^\/bin\//, reason: 'System binaries directory' },
  { pattern: /^\/sbin\//, reason: 'System binaries directory' },
  { pattern: /^\/boot\//, reason: 'Boot configuration directory' },
  { pattern: /^\/dev\//, reason: 'Device directory' },
  { pattern: /^\/proc\//, reason: 'Proc filesystem' },
  { pattern: /^\/sys\//, reason: 'Sys filesystem' },
  { pattern: /^~?\/?\.ssh\//, reason: 'SSH keys directory' },
  { pattern: /^~?\/?\.gnupg\//, reason: 'GPG keys directory' },
  { pattern: /^~?\/?\.aws\/credentials/, reason: 'AWS credentials file' },
  { pattern: /^~?\/?\.azure\//, reason: 'Azure credentials directory' },
  { pattern: /^~?\/?\.kube\/config/, reason: 'Kubernetes config file' },
  { pattern: /^~?\/?\.env$/, reason: 'Environment secrets file' },
  { pattern: /^~?\/?\.env\.local$/, reason: 'Environment secrets file' },
];

const DESTRUCTIVE_WRITE_PATHS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^~?\/?\.bashrc$/, reason: 'Shell configuration file' },
  { pattern: /^~?\/?\.zshrc$/, reason: 'Shell configuration file' },
  { pattern: /^~?\/?\.profile$/, reason: 'Shell configuration file' },
  { pattern: /^~?\/?\.bash_profile$/, reason: 'Shell configuration file' },
  { pattern: /^~?\/?\.gitconfig$/, reason: 'Global git configuration' },
  { pattern: /^~?\/?\.npmrc$/, reason: 'npm configuration' },
];

// ── Public API ──────────────────────────────────────────────

/**
 * Analyse a shell command and return a safety verdict.
 */
export function analyseCommand(command: string): SafetyVerdict {
  const trimmed = command.trim();

  // Check blocked patterns first
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'blocked', reason: `Blocked: ${reason}` };
    }
  }

  // Check destructive patterns
  for (const { pattern, reason } of DESTRUCTIVE_COMMANDS) {
    if (pattern.test(trimmed)) {
      return { level: 'destructive', reason };
    }
  }

  // Check piped commands — split on pipe and analyse each segment
  if (trimmed.includes('|')) {
    const segments = trimmed.split('|').map((s) => s.trim());
    for (const seg of segments) {
      const segVerdict = analyseCommand(seg);
      if (segVerdict.level === 'blocked' || segVerdict.level === 'destructive') {
        return segVerdict;
      }
    }
  }

  // Check chained commands (&&, ;)
  if (/[;&]/.test(trimmed)) {
    const segments = trimmed.split(/[;&]+/).map((s) => s.trim());
    for (const seg of segments) {
      if (!seg) continue;
      const segVerdict = analyseCommand(seg);
      if (segVerdict.level === 'blocked' || segVerdict.level === 'destructive') {
        return segVerdict;
      }
    }
  }

  // Check safe patterns
  // For piped/chained commands, only the first segment determines "safe"
  const firstSegment = trimmed.split(/[|;&]/).map((s) => s.trim())[0] ?? trimmed;
  for (const pattern of SAFE_COMMANDS) {
    if (pattern.test(firstSegment)) {
      return { level: 'safe', reason: 'Read-only command' };
    }
  }

  // Default: mutating (normal permission prompt)
  return { level: 'mutating', reason: 'May modify files or system state' };
}

/**
 * Analyse a file write target path and return a safety verdict.
 */
export function analyseWritePath(filePath: string): SafetyVerdict {
  const normalised = filePath.replace(/^~/, process.env.HOME ?? '~');

  for (const { pattern, reason } of BLOCKED_WRITE_PATHS) {
    if (pattern.test(filePath) || pattern.test(normalised)) {
      return { level: 'blocked', reason: `Blocked: writing to ${reason}` };
    }
  }

  for (const { pattern, reason } of DESTRUCTIVE_WRITE_PATHS) {
    if (pattern.test(filePath) || pattern.test(normalised)) {
      return { level: 'destructive', reason };
    }
  }

  return { level: 'mutating', reason: 'File write' };
}
