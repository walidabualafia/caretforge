import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_NAME = 'caretforge';

/**
 * Return the platform-appropriate config directory.
 *  - macOS / Linux: ~/.config/caretforge
 *  - Windows:       %APPDATA%\caretforge
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, PROJECT_NAME);
  }
  const xdg = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
  return join(xdg, PROJECT_NAME);
}

/**
 * Full path to the config JSON file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}
