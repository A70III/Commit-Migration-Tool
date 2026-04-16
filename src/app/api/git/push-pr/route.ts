import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import simpleGit from 'simple-git';

function parseRepoFromRemoteUrl(remoteUrl: string): { owner: string; repo: string } | null {
  // Try to parse https and ssh formats
  let match = remoteUrl.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { 
      projectPath, 
      githubToken, 
      title, 
      body, 
      head, // The new branch name
      base, // The target branch name
      reviewers // Array of strings
    } = await req.json();

    if (!projectPath || !githubToken || !title || !head || !base) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const git = simpleGit(projectPath);

    // 1. Push branch to origin
    let remotes = await git.getRemotes(true);
    let origin = remotes.find(r => r.name === 'origin');
    
    if (!origin) {
      return NextResponse.json({ error: 'No origin remote found to push to' }, { status: 400 });
    }

    await git.push(['-u', 'origin', head]);

    // 2. Extract Repo info
    const repoInfo = parseRepoFromRemoteUrl(origin.refs.push);
    if (!repoInfo) {
      return NextResponse.json({ error: 'Could not parse GitHub repo from remote origin URL' }, { status: 400 });
    }

    // 3. Create PR via Octokit
    const octokit = new Octokit({ auth: githubToken });
    const prRes = await octokit.rest.pulls.create({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      title,
      body,
      head,
      base,
    });

    const prNumber = prRes.data.number;
    const prUrl = prRes.data.html_url;

    // 4. Request Reviewers if any
    if (reviewers && reviewers.length > 0) {
      // split comma separated reviewers string if string passed, or handle array
      let revArray = Array.isArray(reviewers) ? reviewers : reviewers.split(',').map((s:string) => s.trim()).filter((s:string) => s.length > 0);
      if (revArray.length > 0) {
        await octokit.rest.pulls.requestReviewers({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          pull_number: prNumber,
          reviewers: revArray
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      prUrl,
      prNumber
    });
  } catch (error: any) {
    console.error("PR Error:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
