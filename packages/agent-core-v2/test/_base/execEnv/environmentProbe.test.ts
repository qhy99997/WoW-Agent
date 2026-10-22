import { describe, expect, it } from 'vitest';

import {
  probeHostEnvironment,
  ProbeShellNotFoundError,
  type HostEnvironmentProbeDeps,
} from '#/_base/execEnv/environmentProbe';

interface StubOpts {
  readonly platform: string;
  readonly env?: Record<string, string | undefined>;
  readonly existingPaths?: readonly string[];
  readonly execFileResults?: Readonly<Record<string, string>>;
}

function stubDeps(opts: StubOpts): HostEnvironmentProbeDeps {
  const existing = new Set(opts.existingPaths ?? []);
  return {
    platform: opts.platform,
    arch: 'x86_64',
    release: '1.2.3',
    homeDir: 'C:\\Users\\me',
    env: opts.env ?? {},
    isFile: async (path: string) => existing.has(path),
    execFileText: async (file: string, args: readonly string[]) =>
      opts.execFileResults?.[execFileKey(file, args)],
  };
}

function execFileKey(file: string, args: readonly string[]): string {
  return [file, ...args].join('\0');
}

describe('probeHostEnvironment', () => {
  it('resolves MSYS2 ucrt64 native git through git --exec-path', async () => {
    const gitExe = 'C:\\msys64\\ucrt64\\bin\\git.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { PATH: 'C:\\msys64\\ucrt64\\bin' },
        execFileResults: {
          [execFileKey(gitExe, ['--exec-path'])]: 'C:/msys64/ucrt64/libexec/git-core\n',
        },
        existingPaths: [gitExe, 'C:\\msys64\\usr\\bin\\bash.exe'],
      }),
    );
    expect(env.shellName).toBe('bash');
    expect(env.shellPath).toBe('C:\\msys64\\usr\\bin\\bash.exe');
  });

  it('resolves MSYS2 clang64 native git through git --exec-path', async () => {
    const gitExe = 'C:\\msys64\\clang64\\bin\\git.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { PATH: 'C:\\msys64\\clang64\\bin' },
        execFileResults: {
          [execFileKey(gitExe, ['--exec-path'])]: 'C:/msys64/clang64/libexec/git-core\n',
        },
        existingPaths: [gitExe, 'C:\\msys64\\usr\\bin\\bash.exe'],
      }),
    );
    expect(env.shellName).toBe('bash');
    expect(env.shellPath).toBe('C:\\msys64\\usr\\bin\\bash.exe');
  });

  it('resolves MSYS2 clangarm64 native git through git --exec-path', async () => {
    const gitExe = 'C:\\msys64\\clangarm64\\bin\\git.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { PATH: 'C:\\msys64\\clangarm64\\bin' },
        execFileResults: {
          [execFileKey(gitExe, ['--exec-path'])]: 'C:/msys64/clangarm64/libexec/git-core\n',
        },
        existingPaths: [gitExe, 'C:\\msys64\\usr\\bin\\bash.exe'],
      }),
    );
    expect(env.shellName).toBe('bash');
    expect(env.shellPath).toBe('C:\\msys64\\usr\\bin\\bash.exe');
  });

  it('throws ProbeShellNotFoundError when Git Bash is missing on Windows', async () => {
    const rejected: unknown = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { PATH: 'C:\\Windows\\System32' },
        existingPaths: [],
      }),
    ).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(ProbeShellNotFoundError);
    const probeError = rejected as ProbeShellNotFoundError;
    expect(probeError.message).toContain('https://gitforwindows.org/');
    expect(probeError.message).toContain('WOW_SHELL_PATH');
    expect(probeError.message).not.toContain('Checked:');
    expect(probeError.checked.length).toBeGreaterThan(0);
  });

  it('honours WOW_SHELL_PATH as the bash.exe override', async () => {
    const bash = 'D:\\tools\\Git\\bin\\bash.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { WOW_SHELL_PATH: bash, PATH: 'C:\\Windows\\System32' },
        existingPaths: [bash],
      }),
    );

    expect(env.shellName).toBe('bash');
    expect(env.shellPath).toBe(bash);
  });

  it('still honours the legacy KIMI_SHELL_PATH override', async () => {
    const bash = 'D:\\legacy\\Git\\bin\\bash.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: { KIMI_SHELL_PATH: bash, PATH: 'C:\\Windows\\System32' },
        existingPaths: [bash],
      }),
    );

    expect(env.shellPath).toBe(bash);
  });

  it('prefers WOW_SHELL_PATH when both override variables are set', async () => {
    const wowBash = 'D:\\new\\Git\\bin\\bash.exe';
    const legacyBash = 'D:\\old\\Git\\bin\\bash.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: {
          WOW_SHELL_PATH: wowBash,
          KIMI_SHELL_PATH: legacyBash,
          PATH: 'C:\\Windows\\System32',
        },
        existingPaths: [wowBash, legacyBash],
      }),
    );

    expect(env.shellPath).toBe(wowBash);
  });

  it('falls back to KIMI_SHELL_PATH when WOW_SHELL_PATH is blank', async () => {
    const legacyBash = 'D:\\old\\Git\\bin\\bash.exe';
    const env = await probeHostEnvironment(
      stubDeps({
        platform: 'win32',
        env: {
          WOW_SHELL_PATH: '   ',
          KIMI_SHELL_PATH: legacyBash,
          PATH: 'C:\\Windows\\System32',
        },
        existingPaths: [legacyBash],
      }),
    );

    expect(env.shellPath).toBe(legacyBash);
  });
});
