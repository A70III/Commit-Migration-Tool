import { NextRequest, NextResponse } from 'next/server';
import { GitService } from '@/lib/git-service';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const { projectPath, migrationBranch, targetBranch, commandString } = await req.json();

    if (!projectPath || !migrationBranch || !targetBranch) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const gitService = new GitService(projectPath);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

        try {
          await gitService.simulateMergeAndRun(
            migrationBranch,
            targetBranch,
            commandString || '',
            send
          );
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Simulation failed unexpectedly';
          send({ type: 'error', message: msg });
        } finally {
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

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
