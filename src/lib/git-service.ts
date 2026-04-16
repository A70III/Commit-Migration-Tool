import simpleGit, { SimpleGit, DefaultLogFields, ListLogLine } from 'simple-git';
import { spawn } from 'child_process';

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

  async getLog(branch: string, maxCount = 100): Promise<ReadonlyArray<DefaultLogFields & ListLogLine>> {
    try {
      const logSummary = await this.git.log({
        format: {
          hash: '%H',
          date: '%ai',
          message: '%s',
          refs: '%D',
          body: '%b',
          author_name: '%aN',
          author_email: '%aE'
        },
        maxCount,
      });
      return logSummary.all;
    } catch (e) {
      console.error(`Failed to get log for ${branch}`, e);
      return [];
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

  async migrateAndReset(baseBranch: string, targetCommitHash: string, newBranchName: string): Promise<void> {
    // 1. Checkout Base Branch
    await this.git.checkout(baseBranch);

    // 2. Create new branch from it and switch
    await this.git.checkoutLocalBranch(newBranchName);

    // 3. Reset hard to target commit
    await this.git.reset(['--hard', targetCommitHash]);
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
}
