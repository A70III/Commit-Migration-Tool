import simpleGit, { SimpleGit } from 'simple-git';
import { spawn, spawnSync } from 'child_process';

export class GitService {
  private git: SimpleGit;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.git = simpleGit(this.projectPath);
  }

  async checkIsRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async getBranches(): Promise<{ all: string[], current: string }> {
    const branchSummary = await this.git.branch();
    return {
      all: branchSummary.all,
      current: branchSummary.current
    };
  }

  async getLog(branch: string, options: { 
    maxCount?: number, 
    skip?: number, 
    search?: string, 
    showAll?: boolean 
  } = {}): Promise<any[]> {
    const { maxCount, skip, search, showAll = false } = options;
    
    try {
      // Use \x1F (unit separator) between fields, \x02 (STX) to wrap each commit record
      // This avoids multiline body issues and escaping headaches
      const FIELD_SEP = '\x1F';  // unit separator
      const RECORD_SEP = '\x02'; // STX
      
      // Build git args array - we use execSync for reliable special char handling
      const gitArgs = [
        '-C', this.projectPath,
        'log',
        `--format=${RECORD_SEP}%H${FIELD_SEP}%ai${FIELD_SEP}%s${FIELD_SEP}%D${FIELD_SEP}%aN${FIELD_SEP}%aE${FIELD_SEP}%P${FIELD_SEP}%ar${RECORD_SEP}`,
      ];

      if (maxCount) gitArgs.push(`--max-count=${maxCount}`);
      if (skip) gitArgs.push(`--skip=${skip}`);

      if (showAll) {
        gitArgs.push('--all');
      } else {
        gitArgs.push(branch);
      }

      if (search) {
        gitArgs.push(`--grep=${search}`, '--regexp-ignore-case');
      }

      const spawnResult = spawnSync('git', gitArgs, { encoding: 'utf8', cwd: this.projectPath });
      if (spawnResult.status !== 0) {
        console.error('git log stderr:', spawnResult.stderr);
        return [];
      }
      const raw = spawnResult.stdout;

      const seen = new Set<string>();
      const commits = raw
        .split(RECORD_SEP)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(block => {
          const fields = block.split(FIELD_SEP);
          const [hash, date, message, refs, author_name, author_email, parents, relativeDate] = fields;
          return {
            hash: (hash || '').trim(),
            date: (date || '').trim(),
            message: (message || '').trim(),
            refs: (refs || '').trim(),
            body: '',
            author_name: (author_name || '').trim(),
            author_email: (author_email || '').trim(),
            parents: (parents || '').trim(),
            relativeDate: (relativeDate || '').trim(),
          };
        })
        .filter(c => {
          if (!/^[0-9a-f]{40}$/.test(c.hash)) return false;
          if (seen.has(c.hash)) return false;
          seen.add(c.hash);
          return true;
        });

      return commits;
    } catch (e) {
      console.error(`Failed to get log for ${branch}`, e);
      return [];
    }
  }

  async getCommitDetails(hash: string): Promise<{ files: { status: string, path: string }[] }> {
    try {
      const raw = await this.git.raw(['show', '--name-status', '--pretty=format:', hash]);
      const lines = raw.split('\n').filter(l => l.trim() !== '');
      
      const files = lines
        .filter(line => /^[A-Z]\t/.test(line) || /^[A-Z]\s/.test(line))
        .map(line => {
          const parts = line.split(/\s+/);
          return {
            status: parts[0],
            path: parts.slice(1).join(' ')
          };
        });

      return { files };
    } catch (e) {
      console.error(`Failed to get details for commit ${hash}`, e);
      return { files: [] };
    }
  }

  async getBranchHashes(branch: string): Promise<Set<string>> {
    if (!branch) return new Set();
    try {
      const result = spawnSync('git', ['-C', this.projectPath, 'rev-list', branch], { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 10 });
      if (result.error) throw result.error;
      const lines = result.stdout.split('\n').filter(l => l.length === 40);
      return new Set(lines);
    } catch (e) {
      console.error(`Failed to get branch hashes for ${branch}`, e);
      return new Set();
    }
  }

  async spawnCommand(commandString: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Basic splitting strategy, more complex might be needed for quoted args
    const parts = commandString.split(' ').filter(p => p.trim() !== '');
    if (parts.length === 0) {
      throw new Error("Empty command");
    }

    const command = parts[0];
    const args = parts.slice(1);

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: this.projectPath,
        shell: true
      });

      let stdoutText = '';
      let stderrText = '';

      proc.stdout.on('data', (data) => {
        stdoutText += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderrText += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          stdout: stdoutText,
          stderr: stderrText,
          exitCode: code ?? 1
        });
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  executeCommandStreaming(commandString: string) {
    const parts = commandString.split(' ').filter(p => p.trim() !== '');
    if (parts.length === 0) throw new Error("Empty command");

    const command = parts[0];
    const args = parts.slice(1);

    return spawn(command, args, {
      cwd: this.projectPath,
      shell: true
    });
  }

  async migrateAndReset(baseBranch: string, targetCommitHash: string, newBranchName: string): Promise<void> {
    // 1. Force Checkout Base Branch (discard local changes)
    await this.git.checkout(baseBranch, ['-f']);
    
    // 2. Create and checkout new Branch
    await this.git.checkoutLocalBranch(newBranchName);

    // 3. Hard reset to the Target Commit Hash
    await this.git.reset(['--hard', targetCommitHash]);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    // Force checkout to discard any local changes
    await this.git.checkout(branchName, ['-f']);
  }

  async getDiffBetweenRoots(branch1: string, branch2: string): Promise<string> {
    // Note: To get everything, we might just do standard diff
    // For AI PR we usually want `target..branch_name` standard diff
    try {
        const diff = await this.git.diff([`${branch1}..${branch2}`]);
        return diff;
    } catch (e) {
        console.error("Diff Error: ", e);
        throw e;
    }
  }

  /**
   * จำลองการ Merge migration branch เข้า target branch
   * แล้วรัน operateCommand บนสถานะ merged นั้น
   * Stream ผลลัพธ์ผ่าน callback เพื่อส่ง NDJSON ไปยัง client
   */
  async simulateMergeAndRun(
    migrationBranch: string,
    targetBranch: string,
    operateCommand: string,
    onEvent: (event: Record<string, unknown>) => void
  ): Promise<void> {
    const simBranch = `verify/sim-${Date.now()}`;

    // Step 1: บันทึก branch ปัจจุบัน
    const currentBranch = (await this.git.branch()).current;

    try {
      // Step 2-3: Checkout target (force clean) แล้วสร้าง sandbox branch
      await this.git.checkout(['-f', targetBranch]);
      await this.git.checkoutLocalBranch(simBranch);
      onEvent({ type: 'sim_info', simBranch, message: `Sandbox created: ${simBranch}` });

      // Step 4: ลอง Merge migration branch เข้า sandbox
      try {
        await this.git.merge([migrationBranch, '--no-ff']);
        onEvent({ type: 'sim_merge_ok', message: 'Merge simulation successful — no conflicts.' });
      } catch (mergeError: unknown) {
        // เกิด Conflict: Abort แล้ว report
        try { await this.git.merge(['--abort']); } catch { /* merge ยังไม่เริ่ม, ignore */ }
        const msg = mergeError instanceof Error ? mergeError.message : 'Merge conflict detected';
        onEvent({ type: 'sim_conflict', message: msg });
        return; // หยุดทันที ไม่รัน command
      }

      // Step 5: รัน operate command บน merged state
      if (!operateCommand) {
        onEvent({ type: 'exit', code: 0, message: 'No command specified — merge simulation passed.' });
        return;
      }

      await new Promise<void>((resolve) => {
        const proc = this.executeCommandStreaming(operateCommand);
        proc.stdout?.on('data', (d: Buffer) => onEvent({ type: 'stdout', data: d.toString() }));
        proc.stderr?.on('data', (d: Buffer) => onEvent({ type: 'stderr', data: d.toString() }));
        proc.on('close', (code: number | null) => {
          onEvent({ type: 'exit', code: code ?? 1 });
          resolve();
        });
        proc.on('error', (err: Error) => {
          onEvent({ type: 'error', message: err.message });
          resolve();
        });
      });

    } finally {
      // Step 6: Cleanup — checkout กลับและลบ sandbox branch เสมอ
      try { await this.git.checkout(['-f', currentBranch]); } catch { /* best-effort */ }
      try { await this.git.deleteLocalBranch(simBranch, true); } catch { /* best-effort */ }
      onEvent({ type: 'sim_cleanup', message: `Sandbox ${simBranch} removed.` });
    }
  }
}
