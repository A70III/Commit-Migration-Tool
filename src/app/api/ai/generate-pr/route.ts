import { NextRequest, NextResponse } from 'next/server';
import { GitService } from '@/lib/git-service';
import { generatePRContent } from '@/lib/ai-service';

export async function POST(req: NextRequest) {
  try {
    const { 
      projectPath, 
      targetBranch, 
      newBranch, 
      provider, 
      apiKey, 
      template,
      customModel
    } = await req.json();

    if (!projectPath || !targetBranch || !newBranch || !provider || !apiKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const gitService = new GitService(projectPath);
    
    // We want the diff of things that are in newBranch but not in targetBranch
    // Standard approach: git diff targetBranch..newBranch or targetBranch...newBranch
    // targetBranch...newBranch usually gives diff from common ancestor to newBranch.
    // We'll use targetBranch..newBranch which is exactly what the PR will contain on github.
    
    let diffContent = '';
    try {
      diffContent = await gitService.getDiffBetweenRoots(targetBranch, newBranch);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to get diff: ${e.message}` }, { status: 400 });
    }

    if (!diffContent || diffContent.trim() === '') {
      return NextResponse.json({ content: "No differences found or diff is too large.", diffContent: "" });
    }

    // Limit diff size roughly if it's crazy big so AI doesn't crash?
    // Optionally: diffContent = diffContent.substring(0, 30000); 

    const result = await generatePRContent({
      provider,
      apiKey,
      diffContent: diffContent.substring(0, 30000), // Cap diff to ~30k chars
      template,
      customModel
    });
    
    return NextResponse.json({ content: result, diffContent });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
