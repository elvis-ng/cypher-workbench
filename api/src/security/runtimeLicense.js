import { writeFileSync } from 'node:fs';

export const prepareRuntimeLicense = (env, write = writeFileSync) => {
  if (!env.WORKBENCH_LICENSE) return;
  try {
    write('/tmp/workbench-license', env.WORKBENCH_LICENSE, { mode: 0o600, flag: 'wx' });
    env.LICENSE_FILE = '/tmp/workbench-license';
  } catch { throw new Error('Workbench license initialization failed'); }
  finally { delete env.WORKBENCH_LICENSE; }
};
