import { describe, expect, it } from 'vitest';

import { nativeWorkDir } from '../src/main/workDir';

describe('nativeWorkDir', () => {
  it('restores backslashes in a Windows drive path', () => {
    expect(nativeWorkDir('C:/Users/me/Workspace With Spaces/项目')).toBe(
      'C:\\Users\\me\\Workspace With Spaces\\项目',
    );
  });

  it('keeps a drive root', () => {
    expect(nativeWorkDir('D:/')).toBe('D:\\');
  });

  it('restores backslashes in a UNC path', () => {
    expect(nativeWorkDir('//server/share/project')).toBe('\\\\server\\share\\project');
  });

  it('leaves a native Windows path unchanged', () => {
    expect(nativeWorkDir('C:\\Users\\me\\project')).toBe('C:\\Users\\me\\project');
  });

  it('leaves a POSIX path unchanged', () => {
    expect(nativeWorkDir('/home/me/project')).toBe('/home/me/project');
  });
});
