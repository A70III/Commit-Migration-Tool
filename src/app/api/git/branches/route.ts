import { NextRequest, NextResponse } from 'next/server';
import { GitService } from '@/lib/git-service';

export async function POST(req: NextRequest) {
  try {
    const { projectPath } = await req.json();

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath is required' }, { status: 400 });
    }

    const gitService = new GitService(projectPath);
    const isRepo = await gitService.checkIsRepo();

    if (!isRepo) {
      return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
    }

    const branches = await gitService.getBranches();
    
    return NextResponse.json({
      all: branches.all,
      current: branches.current
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
