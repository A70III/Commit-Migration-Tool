'use client';

import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/lib/use-local-storage';
import { 
  FolderGit2, Settings, GitBranch, ArrowRight, 
  Terminal, Sparkles, Send, CheckCircle2, AlertCircle,
  Loader2, ExternalLink
} from 'lucide-react';

export default function Home() {
  // Config State
  const [projectPath, setProjectPath] = useLocalStorage('commitManager_projectPath', '');
  const [aiProvider, setAiProvider] = useLocalStorage('commitManager_aiProvider', 'gemini');
  const [apiKey, setApiKey] = useLocalStorage('commitManager_apiKey', '');
  const [githubToken, setGithubToken] = useLocalStorage('commitManager_githubToken', '');
  const [ciCommand, setCiCommand] = useLocalStorage('commitManager_ciCommand', 'bun run test');
  
  // App State
  const [step, setStep] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');

  // Git State
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [commits, setCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState('');
  const [newBranchName, setNewBranchName] = useState('');

  // Operation State
  const [operateLog, setOperateLog] = useState<{stdout: string, stderr: string, exitCode: number} | null>(null);

  // PR State
  const [prContent, setPrContent] = useState('');
  const [diffContent, setDiffContent] = useState('');
  const [prTitle, setPrTitle] = useState('Migration Update');
  const [reviewers, setReviewers] = useState('');
  const [prUrl, setPrUrl] = useState('');

  // Step 1: Analyze Project
  const analyzeProject = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        body: JSON.stringify({ projectPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setBranches(data.all);
      // Auto select if not set
      if (!baseBranch || !data.all.includes(baseBranch)) setBaseBranch(data.current);
      if (!targetBranch || !data.all.includes(targetBranch)) setTargetBranch(data.current);
      
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Step 2: Fetch Commits for target mapping
  const loadCommits = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/git/log', {
        method: 'POST',
        body: JSON.stringify({ projectPath, branch: baseBranch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommits(data.logs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Step 3: Operate
  const runOperation = async () => {
    if (!selectedCommit) return setError("Please select a commit first");
    setIsRunning(true);
    setError('');
    setOperateLog(null);
    try {
      const res = await fetch('/api/git/operate', {
        method: 'POST',
        body: JSON.stringify({ 
          projectPath, 
          baseBranch, 
          targetCommitHash: selectedCommit,
          commandString: ciCommand
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setNewBranchName(data.newBranchName);
      setOperateLog(data.operateResult);
      if (data.operateResult && data.operateResult.exitCode === 0) {
        setStep(4);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Step 4: AI Generate
  const generatePR = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/ai/generate-pr', {
        method: 'POST',
        body: JSON.stringify({ 
          projectPath, 
          targetBranch, 
          newBranch: newBranchName,
          provider: aiProvider,
          apiKey
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setPrContent(data.content);
      setDiffContent(data.diffContent);
      setStep(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Step 5: Push and PR
  const pushAndPR = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/git/push-pr', {
        method: 'POST',
        body: JSON.stringify({ 
          projectPath, 
          githubToken,
          title: prTitle,
          body: prContent,
          head: newBranchName,
          base: targetBranch,
          reviewers: reviewers.split(',').map(r => r.trim()).filter(Boolean)
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setPrUrl(data.prUrl);
      setStep(6);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (step === 2 && baseBranch) {
      loadCommits();
    }
  }, [step, baseBranch]);

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in pb-24">
      
      {/* Header */}
      <header className="flex items-center justify-between glass-panel p-6 rounded-2xl">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Commit Migration Tool
          </h1>
          <p className="text-slate-400 mt-2">Sequential Git Tree Migration & AI PR Generator</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all duration-500
              ${s === step ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]' 
                : s < step ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {s < step ? <CheckCircle2 size={16} /> : s}
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3 animate-slide-up">
          <AlertCircle />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Configuration */}
      <section className={`glass-panel p-8 rounded-3xl transition-opacity duration-500 ${step !== 1 && 'opacity-60 grayscale hover:grayscale-0'}`}>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-blue-400" />
          <h2 className="text-2xl font-semibold">1. Configuration</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Project Absolute Path</label>
              <input type="text" value={projectPath} onChange={e => setProjectPath(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="/Users/name/Projects/my-app" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Local CI Command (Operate)</label>
              <input type="text" value={ciCommand} onChange={e => setCiCommand(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="bun run test" />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">AI Provider</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors">
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="lmstudio">LM Studio (Local)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Provider API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="sk-..." />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">GitHub Personal Access Token</label>
              <input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="ghp_..." />
            </div>
          </div>
        </div>
        
        {step === 1 && (
          <button onClick={analyzeProject} disabled={isRunning || !projectPath}
            className="mt-8 w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2">
            {isRunning ? <Loader2 className="animate-spin" /> : <FolderGit2 />}
            Load Repository
          </button>
        )}
      </section>

      {/* STEP 2: Git Tree & Commit Selection */}
      {step >= 2 && (
        <section className={`glass-panel p-8 rounded-3xl animate-slide-up transition-opacity duration-500 ${step !== 2 && 'opacity-60 grayscale hover:grayscale-0'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <GitBranch className="text-emerald-400" />
              <h2 className="text-2xl font-semibold">2. Target & Commit Selection</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Base Branch (Source of Truth)</label>
              <select value={baseBranch} onChange={e => setBaseBranch(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none">
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Target Branch (Receives Commits)</label>
              <select value={targetBranch} onChange={e => setTargetBranch(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none">
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {commits.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-800 text-slate-300 text-sm">
                  <tr>
                    <th className="p-3">Select</th>
                    <th className="p-3">Hash</th>
                    <th className="p-3">Message</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300 text-sm">
                  {commits.map(c => (
                    <tr key={c.hash} 
                      onClick={() => step === 2 && setSelectedCommit(c.hash)}
                      className={`border-t border-slate-800 cursor-pointer transition-colors ${selectedCommit === c.hash ? 'bg-blue-500/20' : 'hover:bg-slate-800/50'}`}>
                      <td className="p-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                          ${selectedCommit === c.hash ? 'border-blue-400 bg-blue-500' : 'border-slate-500'}`}>
                          {selectedCommit === c.hash && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-blue-400">{c.hash.substring(0, 7)}</td>
                      <td className="p-3">{c.message}</td>
                      <td className="p-3">{new Date(c.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {step === 2 && (
             <button onClick={runOperation} disabled={isRunning || !selectedCommit}
             className="mt-8 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2">
             {isRunning ? <Loader2 className="animate-spin" /> : <Terminal />}
             Create Branch & Run Operation
           </button>
          )}
        </section>
      )}

      {/* STEP 3 & 4: Output Log and Generate PR */}
      {step >= 3 && operateLog && (
        <section className="glass-panel p-8 rounded-3xl animate-slide-up">
           <div className="flex items-center gap-3 mb-6">
            <Terminal className="text-yellow-400" />
            <h2 className="text-2xl font-semibold">3. Operation Log</h2>
          </div>
          
          <div className="bg-black/80 rounded-xl p-4 font-mono text-sm overflow-x-auto">
            {operateLog.stdout && <pre className="text-emerald-400">{operateLog.stdout}</pre>}
            {operateLog.stderr && <pre className="text-red-400 mt-4">{operateLog.stderr}</pre>}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className={`font-semibold ${operateLog.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
               Exit Code: {operateLog.exitCode} {operateLog.exitCode === 0 ? '(Success)' : '(Failed)'}
            </div>

            {step === 3 && operateLog.exitCode === 0 && (
              <button onClick={() => setStep(4)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2">
                 Continue to PR <ArrowRight size={18} />
              </button>
            )}
            {step === 3 && operateLog.exitCode !== 0 && (
              <button className="bg-slate-700 text-slate-300 px-6 py-2 rounded-lg font-semibold flex items-center gap-2">
                Fix error first
              </button>
            )}
          </div>
        </section>
      )}

      {/* STEP 4: AI & PR Info */}
      {step >= 4 && (
        <section className={`glass-panel p-8 rounded-3xl animate-slide-up transition-opacity duration-500 ${step !== 4 && 'opacity-60 grayscale hover:grayscale-0'}`}>
           <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-purple-400" />
            <h2 className="text-2xl font-semibold">4. AI Review & Generator</h2>
          </div>

          {step === 4 && !prContent ? (
            <button onClick={generatePR} disabled={isRunning}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 text-lg shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]">
              {isRunning ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate PR Content with AI
            </button>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-1">PR Title</label>
                <input type="text" value={prTitle} onChange={e => setPrTitle(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors" />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-slate-400 mb-1 flex items-center justify-between">
                    <span>AI Description</span>
                  </label>
                  <textarea value={prContent} onChange={e => setPrContent(e.target.value)} rows={12}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-slate-100 font-mono text-sm focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                   <label className="block text-sm text-slate-400 mb-1">Diff Preview</label>
                   <textarea value={diffContent} readOnly rows={12}
                    className="w-full bg-black/50 border border-slate-800 rounded-lg p-4 text-emerald-400/80 font-mono text-xs focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Reviewers (Comma separated GitHub Usernames)</label>
                <input type="text" value={reviewers} onChange={e => setReviewers(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="l2s-dev, another-user" />
              </div>

              {step === 4 && (
                 <button onClick={pushAndPR} disabled={isRunning}
                 className="mt-8 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all hover:scale-[1.01] flex justify-center items-center gap-2 text-lg">
                 {isRunning ? <Loader2 className="animate-spin" /> : <Send />}
                 Ship to GitHub (Push & PR)
               </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* FINAL STEP */}
      {step === 6 && (
         <section className="glass-panel p-10 rounded-3xl animate-slide-up text-center border-emerald-500/30">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-4">
              Migration Complete!
            </h2>
            <p className="text-slate-400 mb-8">
              Successfully migrated branch and opened Pull Request.
            </p>
            <a href={prUrl} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-8 py-3 rounded-full font-semibold transition-colors">
              <ExternalLink size={20} /> View Pull Request
            </a>
            
            <button onClick={() => setStep(1)} className="block mx-auto mt-6 text-slate-500 hover:text-slate-300 transition-colors text-sm">
              Start new migration
            </button>
         </section>
      )}
    </main>
  );
}
