'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from '@/lib/use-local-storage';
import { 
  FolderGit2, Settings, GitBranch, ArrowRight, 
  Terminal, Sparkles, Send, CheckCircle2, AlertCircle,
  Loader2, ExternalLink, X, FolderSearch
} from 'lucide-react';
import GitGraphViewer from '@/components/GitGraphViewer';

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
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Git State
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('master');
  const [commits, setCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [targetHashes, setTargetHashes] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState('');
  const [showAllBranches, setShowAllBranches] = useState(false);
  
  // Operation State
  const [operateLog, setOperateLog] = useState<{stdout: string, stderr: string, exitCode: number} | null>(null);

  // PR State
  const [prContent, setPrContent] = useState('');
  const [diffContent, setDiffContent] = useState('');
  const [prTitle, setPrTitle] = useState('Migration Update');
  const [reviewers, setReviewers] = useState('');
  const [prUrl, setPrUrl] = useState('');

  // --- Handlers --- //

  const browseFolder = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/native/browse-folder');
      const data = await res.json();
      if (!res.ok) {
        if (data.error !== 'User canceled') setError(data.error);
        return;
      }
      setProjectPath(data.path);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const analyzeProject = async (pathOverride?: string) => {
    const path = pathOverride || projectPath;
    if (!path) return setError('Please select a project folder first.');
    
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setBranches(data.all);
      if (!baseBranch || !data.all.includes(baseBranch)) setBaseBranch(data.current);
      
      // Default target to master if exists, else main, else current
      if (data.all.includes('master')) {
        setTargetBranch('master');
      } else if (data.all.includes('main')) {
        setTargetBranch('main');
      } else if (!targetBranch || !data.all.includes(targetBranch)) {
        setTargetBranch(data.current);
      }
      
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Always keep a ref to latest params to avoid stale closures in loadCommits
  const latestParams = useRef({ projectPath, baseBranch, targetBranch, searchQuery, showAllBranches });
  useEffect(() => {
    latestParams.current = { projectPath, baseBranch, targetBranch, searchQuery, showAllBranches };
  });

  const loadCommits = useCallback(async () => {
    const { projectPath, baseBranch, targetBranch, searchQuery, showAllBranches } = latestParams.current;
    if (!projectPath || !baseBranch) return;
    setIsRunning(true);
    setError('');
    
    try {
      const res = await fetch('/api/git/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectPath, 
          branch: baseBranch,
          compareBranch: targetBranch,
          search: searchQuery || undefined,
          showAll: showAllBranches
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setCommits(data.logs || []);
      setTargetHashes(new Set(data.sharedHashes || []));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && baseBranch) {
      loadCommits(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, baseBranch, searchQuery, showAllBranches]);

  const branchAndReset = async () => {
    if (!selectedCommit) return setError("Please select a target commit");
    setStep(3);
  };

  const runOperation = async () => {
    setIsRunning(true);
    setError('');
    setOperateLog(null);
    try {
      const res = await fetch('/api/git/operate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const proceedToPR = () => {
    if (!apiKey) {
      setShowSettings(true);
      setError('An API Key is required to generate the Pull Request content.');
      return;
    }
    setStep(4);
  }

  const generatePR = async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/ai/generate-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      
      let rawContent = data.content || '';
      let extractedTitle = 'Migration Update';
      
      // Attempt to extract the # Title from the markdown
      const titleMatch = rawContent.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim();
        // Remove the title line from the main content body so it doesn't duplicate
        rawContent = rawContent.replace(/^#\s+.+\n*/m, '').trim();
      }

      setPrTitle(extractedTitle);
      setPrContent(rawContent);
      setDiffContent(data.diffContent);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const pushAndPR = async () => {
    if (!githubToken) {
      setShowSettings(true);
      setError('A GitHub Token is required to create a Pull Request.');
      return;
    }

    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/git/push-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setStep(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (step === 2 && baseBranch && targetBranch) {
      loadCommits();
    }
  }, [step, baseBranch, targetBranch, searchQuery, showAllBranches]);

  // --- Render --- //
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 italic-none">
      
      {/* Top Navbar */}
      <nav className="w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
            <GitBranch size={20} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Workspace Migration</h1>
        </div>
        
        <button onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
          <Settings size={18} /> Settings
        </button>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={18}/> App Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">AI Provider</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="input-clean font-medium">
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="lmstudio">LM Studio (Local)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">AI Provider API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-clean font-mono text-sm" placeholder="sk-..." />
              </div>
              <div className="pt-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">GitHub Personal Access Token</label>
                <input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} className="input-clean font-mono text-sm" placeholder="ghp_..." />
                <div className="text-xs text-slate-500 mt-2 space-y-1 bg-slate-100 p-3 rounded-lg border border-slate-200">
                  <p className="font-semibold text-slate-700 mb-1">How to generate a token:</p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">GitHub Developer Settings</a></li>
                    <li>Add a Note (e.g. "Commit Migration Tool")</li>
                    <li>Select the <strong>`repo`</strong> scope (Full control of private repositories)</li>
                    <li>Click <strong>Generate token</strong> at the bottom</li>
                  </ol>
                  <p className="text-orange-600 mt-1.5 flex items-center gap-1"><AlertCircle size={12}/> Make sure to copy the token! You won't be able to see it again.</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="mt-10 px-6 max-w-4xl mx-auto space-y-8 pb-10">

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg flex items-start gap-3 shadow-sm animate-fade-in mb-6">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* STEP 1: Select Project */}
        <section className={`clean-panel p-6 sm:p-8 transition-opacity duration-300 ${step !== 1 && 'opacity-50'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg"><FolderSearch size={22}/></div>
            <h2 className="text-xl font-bold">1. Select Project</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" value={projectPath} readOnly placeholder="Select a project folder..." className="input-clean flex-1 font-mono text-sm bg-slate-100 text-slate-500 cursor-not-allowed" />
            <button onClick={browseFolder} disabled={isRunning} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-2 justify-center shadow-sm">
               Browse Directory
            </button>
          </div>
          
          {step === 1 && (
            <button onClick={() => analyzeProject()} disabled={isRunning || !projectPath} className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm">
              {isRunning ? <Loader2 className="animate-spin" /> : <FolderGit2 />} Continue
            </button>
          )}
        </section>
      </div>

      {/* STEP 2 — Full Width Git Graph Panel */}
      {step >= 2 && (
        <>
          <div className="px-6 max-w-4xl mx-auto">
          <div className={`clean-panel p-6 sm:p-8 transition-opacity duration-300 ${step !== 2 && 'opacity-50'}`}>
              {/* Branch selectors row */}
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg"><GitBranch size={20}/></div>
                <h2 className="text-xl font-bold">2. Map Commits</h2>
                {isRunning && commits.length > 0 && <Loader2 size={16} className="animate-spin text-slate-400 ml-auto" />}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Base Branch (Source)</label>
                  <select value={baseBranch} onChange={e => setBaseBranch(e.target.value)} className="input-clean font-medium shadow-sm bg-white text-sm">
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 border border-slate-200 shadow-sm z-10 hidden md:block">
                  <ArrowRight className="text-slate-400" size={16} />
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Target Branch (Destination)</label>
                  <select value={targetBranch} onChange={e => setTargetBranch(e.target.value)} className="input-clean font-medium shadow-sm bg-white text-sm">
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width git graph */}
          <div className="px-4 sm:px-6">
            {commits.length > 0 ? (
              <GitGraphViewer
                commits={commits}
                selectedCommit={selectedCommit}
                onSelectCommit={(hash) => step === 2 && setSelectedCommit(hash)}
                baseBranch={baseBranch}
                targetBranch={targetBranch}
                projectPath={projectPath}
                onSearch={setSearchQuery}
                onToggleAll={setShowAllBranches}
                showAll={showAllBranches}
                isLoading={isRunning}
                targetHashes={targetHashes}
              />
            ) : isRunning ? (
              <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
                <Loader2 size={20} className="animate-spin" /> Loading commits...
              </div>
            ) : (
              <div className="text-center text-slate-400 py-12">No commits found for this branch.</div>
            )}
          </div>

          {step === 2 && (
            <div className="px-6 max-w-4xl mx-auto mt-4">
              <div className="flex justify-end">
                <button onClick={branchAndReset} disabled={!selectedCommit} className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-medium px-8 py-3 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                  Confirm Selection <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Steps 3-5 */}
      <div className="px-6 max-w-4xl mx-auto space-y-8 pb-24">


        {/* STEP 3: Playground / Local CI */}
        {step >= 3 && (
          <section className={`clean-panel p-6 sm:p-8 animate-slide-up shadow-lg border-blue-100 shadow-blue-500/5 ${step !== 3 && 'opacity-50'}`}>
             <div className="flex gap-4 items-start mb-6">
               <div className="bg-orange-100 text-orange-600 p-2 rounded-lg shrink-0"><Terminal size={22}/></div>
               <div>
                 <h2 className="text-xl font-bold">3. Checkout & Playground</h2>
                 <p className="text-slate-500 text-sm mt-1">Create branch and run CI validations locally.</p>
               </div>
             </div>

             <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6 space-y-4">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Local Command (e.g. tests, linters)</label>
                   <div className="flex flex-col sm:flex-row gap-3">
                     <input type="text" value={ciCommand} onChange={e => setCiCommand(e.target.value)}
                       className="input-clean font-mono flex-1 bg-white" placeholder="bun run test" />
                     {step === 3 && (
                       <button onClick={runOperation} disabled={isRunning} className="bg-orange-600 hover:bg-orange-500 disabled:bg-orange-300 text-white px-6 py-3 rounded-lg font-medium whitespace-nowrap flex items-center gap-2 justify-center shadow-sm">
                         {isRunning ? <Loader2 className="animate-spin" /> : <Terminal size={18} />} Run Operate
                       </button>
                     )}
                   </div>
                </div>
             </div>

             {operateLog && (
               <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                 <div className="bg-slate-800 text-slate-200 p-3 text-xs font-mono border-b border-slate-700 flex justify-between">
                   <span>Console Output</span>
                   <span className={operateLog.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}>
                     Exit Code: {operateLog.exitCode}
                   </span>
                 </div>
                 <div className="bg-slate-900 p-4 font-mono text-xs max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                   {operateLog.stdout && <span className="text-slate-300">{operateLog.stdout}</span>}
                   {operateLog.stderr && <span className="text-red-400 mt-2 block">{operateLog.stderr}</span>}
                   {!operateLog.stdout && !operateLog.stderr && <span className="text-slate-500 italic">No output</span>}
                 </div>
               </div>
             )}

             {step === 3 && operateLog && operateLog.exitCode === 0 && (
                <div className="mt-6 flex justify-end">
                  <button onClick={proceedToPR} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                    Checks Passed. Proceed to AI PR <ArrowRight size={18}/>
                  </button>
                </div>
             )}
          </section>
        )}

        {/* STEP 4: AI Generate PR */}
        {step >= 4 && (
          <section className={`clean-panel p-6 sm:p-8 animate-slide-up shadow-lg border-purple-100 shadow-purple-500/5 ${step !== 4 && 'opacity-50'}`}>
            <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-3">
                 <div className="bg-purple-100 text-purple-600 p-2 rounded-lg"><Sparkles size={22}/></div>
                 <h2 className="text-xl font-bold">4. AI Review Generator</h2>
               </div>
            </div>

            {step === 4 && !prContent ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                 <Sparkles className="mx-auto text-slate-300 mb-4" size={40} />
                 <p className="text-slate-500 mb-6">Let {aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)} analyze the diff and write your PR.</p>
                 <button onClick={generatePR} disabled={isRunning}
                    className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-300 text-white px-8 py-3 rounded-xl font-bold shadow-md shadow-purple-500/20 flex items-center gap-2 mx-auto justify-center transition-transform hover:scale-105 active:scale-95">
                    {isRunning ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate Magic PR
                 </button>
              </div>
            ) : (
                <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Pull Request Title</label>
                  <input type="text" value={prTitle} onChange={e => setPrTitle(e.target.value)} className="input-clean font-medium text-lg" />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-semibold text-slate-700">AI Generated Description</label>
                      <button onClick={generatePR} disabled={isRunning}
                        className="text-purple-600 hover:text-purple-700 text-xs font-bold flex items-center gap-1 transition-colors disabled:text-slate-400">
                        {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Regenerate
                      </button>
                    </div>
                    <textarea value={prContent} onChange={e => setPrContent(e.target.value)} rows={14}
                      className="input-clean font-mono text-sm leading-relaxed" />
                  </div>
                  <div>
                     <label className="block text-sm font-semibold text-slate-700 mb-1 text-slate-400">Diff Preview (Read-only)</label>
                     <textarea readOnly value={diffContent} rows={14}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-400 font-mono text-xs focus:outline-none" />
                  </div>
                </div>
  
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Reviewers (Comma separated GitHub Usernames)</label>
                  <input type="text" value={reviewers} onChange={e => setReviewers(e.target.value)} className="input-clean bg-white" placeholder="user_a, user_b" />
                </div>
  
                {step === 4 && (
                   <div className="pt-4 flex justify-end">
                     <button onClick={pushAndPR} disabled={isRunning}
                       className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95 flex items-center gap-2 text-lg">
                       {isRunning ? <Loader2 className="animate-spin" /> : <Send size={22}/>} Publish to GitHub
                     </button>
                   </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* STEP 5: Done */}
        {step === 5 && (
          <section className="clean-panel p-10 text-center animate-slide-up border-emerald-200 border-2 shadow-emerald-500/10">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 mb-3">Shipment Successful!</h2>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">Your code has branch has been created, mapped, tested, and a Pull Request was opened via AI evaluation.</p>
              
              <div className="flex items-center justify-center gap-4">
                <a href={prUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-sm">
                  <ExternalLink size={18} /> View on GitHub
                </a>
                <button onClick={() => { setStep(1); setPrContent(''); setOperateLog(null); setSelectedCommit(''); }} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-lg font-semibold transition-colors">
                  Start New Journey
                </button>
              </div>
          </section>
        )}
      </div>
    </div>
  );
}
