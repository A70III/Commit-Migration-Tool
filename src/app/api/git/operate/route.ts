import { NextRequest, NextResponse } from 'next/server';
import { GitService } from '@/lib/git-service';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    const { projectPath, baseBranch, targetCommitHash, commandString, existingBranchName } = await req.json();

    if (!projectPath || !baseBranch || !targetCommitHash) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const gitService = new GitService(projectPath);
    
    // 1. Determine branch name
    const newBranchName = existingBranchName || `migration/${targetCommitHash.substring(0, 7)}-${new Date().getTime()}`;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

        try {
          if (existingBranchName) {
            // Check out existing migration branch (resuming)
            await gitService.checkoutBranch(newBranchName);
            send({ type: 'info', newBranchName });
          } else {
            // 2. Perform checkout, branch, and hard reset (new migration)
            await gitService.migrateAndReset(baseBranch, targetCommitHash, newBranchName);
            send({ type: 'info', newBranchName });
          }

          // 3. Run operate command if present
          if (commandString) {
            const proc = gitService.executeCommandStreaming(commandString);

            proc.stdout?.on('data', (data) => {
              send({ type: 'stdout', data: data.toString() });
            });

            proc.stderr?.on('data', (data) => {
              send({ type: 'stderr', data: data.toString() });
            });

            proc.on('close', (code) => {
              send({ type: 'exit', code: code ?? 1 });
              controller.close();
            });

            proc.on('error', (err) => {
              send({ type: 'error', message: err.message });
              controller.close();
            });
          } else {
            send({ type: 'exit', code: 0 }); // No command to run
            controller.close();
          }
        } catch (error: any) {
          send({ type: 'error', message: error.message || 'Streaming execution error' });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
