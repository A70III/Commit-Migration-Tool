import { NextRequest, NextResponse } from 'next/server';
import { GitService } from '@/lib/git-service';

export async function POST(req: NextRequest) {
  try {
    const { projectPath, baseBranch, targetCommitHash, commandString } = await req.json();

    if (!projectPath || !baseBranch || !targetCommitHash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const gitService = new GitService(projectPath);
    
    // 1. Generate new branch name based on commit hash
    const date = new Date().getTime();
    const newBranchName = `migration/${targetCommitHash.substring(0, 7)}-${date}`;

    // 2. Perform checkout, branch, and hard reset
    await gitService.migrateAndReset(baseBranch, targetCommitHash, newBranchName);

    // 3. Run operate command if present
    let operateResult = null;
    if (commandString) {
      try {
        operateResult = await gitService.spawnCommand(commandString);
      } catch (cmdError: any) {
        operateResult = {
          stdout: "",
          stderr: cmdError.message,
          exitCode: 1
        };
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      newBranchName,
      operateResult
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
