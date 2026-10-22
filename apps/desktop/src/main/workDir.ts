import { win32 } from 'node:path';

const WINDOWS_PATH = /^[A-Za-z]:[\\/]|^[\\/]{2}[^\\/]+[\\/][^\\/]+/;

/**
 * The SDK stores a Windows path with forward slashes (`C:/Users/me/project`),
 * while the folder dialog returns the native spelling. Sessions are grouped
 * under a workspace by exact path, so hand the renderer the native form.
 */
export function nativeWorkDir(workDir: string): string {
  return WINDOWS_PATH.test(workDir) ? win32.normalize(workDir) : workDir;
}
