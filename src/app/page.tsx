"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";
import { useTheme } from "@/lib/use-theme";
import {
  FolderGit2,
  Settings,
  GitBranch,
  ArrowRight,
  Terminal,
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  X,
  FolderSearch,
  Copy,
  Moon,
  Sun,
  GitMerge,
  RefreshCw,
} from "lucide-react";
import GitGraphViewer from "@/components/GitGraphViewer";
import MigrationSidebar from "@/components/MigrationSidebar";

export default function Home() {
  const { theme, toggleTheme, isDark } = useTheme();
  // Config State
  const [projectPath, setProjectPath] = useLocalStorage(
    "commitManager_projectPath",
    "",
  );
  const [aiProvider, setAiProvider] = useLocalStorage(
    "commitManager_aiProvider",
    "gemini",
  );
  const defaultModels: Record<string, string> = {
    gemini: "gemini-2.5-flash",
    openai: "gpt-4o",
    deepseek: "deepseek-chat",
    openrouter: "z-ai/glm-4.5-air:free",
    lmstudio: "local-model",
  };

  const [apiKeys, setApiKeys] = useLocalStorage<Record<string, string>>(
    "commitManager_apiKeys",
    {},
  );
  const [aiModels, setAiModels] = useLocalStorage<Record<string, string>>(
    "commitManager_aiModels",
    {},
  );
  const [githubToken, setGithubToken] = useLocalStorage(
    "commitManager_githubToken",
    "",
  );
  const [ciCommand, setCiCommand] = useLocalStorage(
    "commitManager_ciCommand",
    "bun run test",
  );

  // App State
  const [step, setStep] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Git State
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("master");
  const [commits, setCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [targetHashes, setTargetHashes] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");

  // Operation State
  const [operateLog, setOperateLog] = useState<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
  } | null>(null);
  const [resumingRecordId, setResumingRecordId] = useState<string | null>(null);

  // Simulation State
  const [simLog, setSimLog] = useState<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    status: "idle" | "running" | "merge_ok" | "conflict" | "done";
    conflictMessage?: string;
  } | null>(null);
  const [isSimRunning, setIsSimRunning] = useState(false);
  const [isAbsorbing, setIsAbsorbing] = useState(false);

  // PR State
  const [prContent, setPrContent] = useState("");
  const [diffContent, setDiffContent] = useState("");
  const [prTitle, setPrTitle] = useState("Migration Update");
  const [reviewers, setReviewers] = useLocalStorage(
    "commitManager_reviewers",
    "",
  );
  const [prUrl, setPrUrl] = useState("");

  // History State
  const [migrationHistory, setMigrationHistory] = useLocalStorage<any[]>(
    "commitManager_migrationHistory",
    [],
  );
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [operateLog?.stdout, operateLog?.stderr]);

  // --- Handlers --- //

  const browseFolder = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/native/browse-folder");
      const data = await res.json();
      if (!res.ok) {
        if (data.error !== "User canceled") setError(data.error);
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
    if (!path) return setError("Please select a project folder first.");

    setIsRunning(true);
    setError("");
    try {
      const res = await fetch("/api/git/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBranches(data.all);
      if (!baseBranch || !data.all.includes(baseBranch))
        setBaseBranch(data.current);

      // Default target to master if exists, else main, else current
      if (data.all.includes("master")) {
        setTargetBranch("master");
      } else if (data.all.includes("main")) {
        setTargetBranch("main");
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
  const latestParams = useRef({
    projectPath,
    baseBranch,
    targetBranch,
    searchQuery,
  });
  useEffect(() => {
    latestParams.current = {
      projectPath,
      baseBranch,
      targetBranch,
      searchQuery,
    };
  });

  const loadCommits = useCallback(async () => {
    const { projectPath, baseBranch, targetBranch, searchQuery } =
      latestParams.current;
    if (!projectPath || !baseBranch) return;
    setIsRunning(true);
    setError("");

    try {
      const res = await fetch("/api/git/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          branch: baseBranch,
          compareBranch: targetBranch,
          search: searchQuery || undefined,
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
      loadCommits();
    }
  }, [step, baseBranch, targetBranch, searchQuery, loadCommits]);

  const branchAndReset = async () => {
    if (!selectedCommit) return setError("Please select a target commit");
    setResumingRecordId(null);
    setOperateLog(null);
    setStep(3);
  };

  const handleSelectRecord = (record: any) => {
    setStep(3);
    setResumingRecordId(record.id);
    setBaseBranch(record.sourceBranch);
    setTargetBranch(record.targetBranch);
    setCiCommand(record.command || ciCommand);
    setNewBranchName(record.branchName);
    setSelectedCommit(record.commitHash);
    setOperateLog({
      stdout: record.log || "",
      stderr: "",
      exitCode:
        record.status === "success" ? 0 : record.status === "failed" ? 1 : null,
    });
    setPrContent("");
    setDiffContent("");
    setPrUrl("");
    setError("");
  };

  const runOperation = async () => {
    setIsRunning(true);
    setError("");
    setOperateLog({ stdout: "", stderr: "", exitCode: null });
    // Reset simulation — operate code changed, previous sim result is no longer valid
    setSimLog(null);

    // Determine if we are resuming or starting fresh
    // Only treat as resuming if the branch was actually successfully created previously
    const isResuming = !!resumingRecordId && newBranchName !== "Preparing...";
    const historyId = resumingRecordId || Date.now().toString();

    if (!!resumingRecordId) {
      // If we clicked a history record but it failed before branching, we just update it
      setMigrationHistory((prev) =>
        prev.map((r) =>
          r.id === historyId
            ? {
                ...r,
                status: "running",
                log: "",
                command: ciCommand,
              }
            : r,
        ),
      );
    } else {
      const selectedCommitObj = commits.find((c) => c.hash === selectedCommit);
      const newRecord = {
        id: historyId,
        branchName: "Preparing...",
        sourceBranch: baseBranch,
        targetBranch: targetBranch,
        commitHash: selectedCommit,
        commitMessage: selectedCommitObj?.message || "",
        status: "running" as const,
        timestamp: new Date().toLocaleTimeString(),
        command: ciCommand,
        log: "",
      };
      setMigrationHistory((prev) => [newRecord, ...prev]);
    }

    try {
      const res = await fetch("/api/git/operate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          baseBranch,
          targetCommitHash: selectedCommit,
          commandString: ciCommand,
          existingBranchName: isResuming ? newBranchName : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to start operation");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);

          if (chunk.type === "info") {
            setNewBranchName(chunk.newBranchName);
            setMigrationHistory((prev) =>
              prev.map((r) =>
                r.id === historyId
                  ? { ...r, branchName: chunk.newBranchName }
                  : r,
              ),
            );
          } else if (chunk.type === "stdout") {
            setOperateLog((prev) =>
              prev ? { ...prev, stdout: prev.stdout + chunk.data } : null,
            );
            setMigrationHistory((prev) =>
              prev.map((r) =>
                r.id === historyId
                  ? { ...r, log: (r.log || "") + chunk.data }
                  : r,
              ),
            );
          } else if (chunk.type === "stderr") {
            setOperateLog((prev) =>
              prev ? { ...prev, stderr: prev.stderr + chunk.data } : null,
            );
            setMigrationHistory((prev) =>
              prev.map((r) =>
                r.id === historyId
                  ? { ...r, log: (r.log || "") + chunk.data }
                  : r,
              ),
            );
          } else if (chunk.type === "exit") {
            setOperateLog((prev) =>
              prev ? { ...prev, exitCode: chunk.code } : null,
            );
            setMigrationHistory((prev) =>
              prev.map((r) =>
                r.id === historyId
                  ? {
                      ...r,
                      status: chunk.code === 0 ? "success" : "failed",
                    }
                  : r,
              ),
            );
          } else if (chunk.type === "error") {
            throw new Error(chunk.message);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      setMigrationHistory((prev) =>
        prev.map((r) => (r.id === historyId ? { ...r, status: "failed" } : r)),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const proceedToPR = () => {
    const currentKey = apiKeys[aiProvider] || "";
    if (!currentKey && aiProvider !== "lmstudio") {
      setShowSettings(true);
      setError(
        `An API Key for ${aiProvider} is required to generate the Pull Request content.`,
      );
      return;
    }
    setStep(4);
  };

  const runSimulation = async () => {
    if (!newBranchName || newBranchName === "Preparing...") return;

    setIsSimRunning(true);
    setSimLog({ stdout: "", stderr: "", exitCode: null, status: "running" });

    try {
      const res = await fetch("/api/git/simulate-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          migrationBranch: newBranchName,
          targetBranch,
          commandString: ciCommand,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to start simulation");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);

          if (chunk.type === "sim_merge_ok") {
            setSimLog((prev) =>
              prev ? { ...prev, status: "merge_ok" } : null,
            );
          } else if (chunk.type === "sim_conflict") {
            setSimLog((prev) =>
              prev
                ? {
                    ...prev,
                    status: "conflict",
                    conflictMessage: chunk.message as string,
                  }
                : null,
            );
          } else if (chunk.type === "stdout") {
            setSimLog((prev) =>
              prev
                ? { ...prev, stdout: prev.stdout + (chunk.data as string) }
                : null,
            );
          } else if (chunk.type === "stderr") {
            setSimLog((prev) =>
              prev
                ? { ...prev, stderr: prev.stderr + (chunk.data as string) }
                : null,
            );
          } else if (chunk.type === "exit") {
            setSimLog((prev) =>
              prev
                ? { ...prev, exitCode: chunk.code as number, status: "done" }
                : null,
            );
          } else if (chunk.type === "error") {
            throw new Error(chunk.message as string);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Simulation error";
      setError(msg);
      setSimLog((prev) =>
        prev ? { ...prev, status: "done", exitCode: 1 } : null,
      );
    } finally {
      setIsSimRunning(false);
    }
  };

  // Auto-resolve conflict: merge target INTO migration, migration always wins (-X ours)
  const runAbsorb = async () => {
    setIsAbsorbing(true);
    try {
      const res = await fetch("/api/git/absorb-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          migrationBranch: newBranchName,
          targetBranch,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Failed to start absorb");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          if (chunk.type === "absorb_error")
            throw new Error(chunk.message as string);
        }
      }

      // Absorb สำเร็จ → reset simulation แล้วรัน simulation ใหม่ทันที
      setSimLog(null);
      await runSimulation();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Auto-resolve failed";
      setError(msg);
    } finally {
      setIsAbsorbing(false);
    }
  };

  const generatePR = async () => {
    setIsRunning(true);
    setError("");
    try {
      const res = await fetch("/api/ai/generate-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          targetBranch,
          newBranch: newBranchName,
          provider: aiProvider,
          apiKey: apiKeys[aiProvider] || "",
          customModel: aiModels[aiProvider] || defaultModels[aiProvider] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let rawContent = data.content || "";
      let extractedTitle = "Migration Update";

      // Attempt to extract the # Title from the markdown
      const titleMatch = rawContent.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        extractedTitle = titleMatch[1].trim();
        // Remove the title line from the main content body so it doesn't duplicate
        rawContent = rawContent.replace(/^#\s+.+\n*/m, "").trim();
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
      setError("A GitHub Token is required to create a Pull Request.");
      return;
    }

    setIsRunning(true);
    setError("");
    try {
      const res = await fetch("/api/git/push-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath,
          githubToken,
          title: prTitle,
          body: prContent,
          head: newBranchName,
          base: targetBranch,
          reviewers: reviewers
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
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
  }, [step, baseBranch, targetBranch, searchQuery, loadCommits]);

  // --- Render --- //
  if (!mounted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen font-sans selection:bg-blue-100 overflow-hidden"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Sidebar */}
      <aside className="w-80 shrink-0 hidden lg:block">
        <MigrationSidebar
          history={migrationHistory}
          onClearHistory={() => setMigrationHistory([])}
          onSelectRecord={handleSelectRecord}
        />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <nav
          className="w-full border-b px-6 py-4 flex items-center justify-between shadow-sm shrink-0 z-40 transition-colors duration-300"
          style={{
            background: "var(--nav-bg)",
            borderColor: "var(--nav-border)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
              <GitBranch size={20} />
            </div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--card-foreground)" }}
            >
              Commit Migration Tool
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span
                className={`absolute transition-all duration-300 ${
                  isDark
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 rotate-90 scale-50"
                }`}
              >
                <Sun size={18} className="text-amber-400" />
              </span>
              <span
                className={`absolute transition-all duration-300 ${
                  isDark
                    ? "opacity-0 -rotate-90 scale-50"
                    : "opacity-100 rotate-0 scale-100"
                }`}
              >
                <Moon size={18} />
              </span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: "var(--secondary-text)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--muted)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--secondary-text)";
              }}
            >
              <RefreshCw size={18} /> Refresh
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{ color: "var(--secondary-text)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--muted)";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "";
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--secondary-text)";
              }}
            >
              <Settings size={18} /> Settings
            </button>
          </div>
        </nav>

        {/* Settings Modal - fullscreen overlay, must be outside <main> */}
        {showSettings && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm animate-fade-in"
            style={{ background: "var(--overlay-bg)" }}
          >
            <div
              className="rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transition-colors"
              style={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div
                className="px-6 py-4 border-b flex justify-between items-center"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--muted)",
                }}
              >
                <h3
                  className="font-bold text-lg flex items-center gap-2"
                  style={{ color: "var(--card-foreground)" }}
                >
                  <Settings size={18} /> App Settings
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 transition-colors"
                  style={{ color: "var(--secondary-text)" }}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{ color: "var(--card-foreground)" }}
                  >
                    AI Provider
                  </label>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="input-clean font-medium"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="lmstudio">LM Studio (Local)</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{ color: "var(--card-foreground)" }}
                  >
                    {aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)}{" "}
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKeys[aiProvider] || ""}
                    onChange={(e) =>
                      setApiKeys((prev) => ({
                        ...prev,
                        [aiProvider]: e.target.value,
                      }))
                    }
                    className="input-clean font-mono text-sm"
                    placeholder={
                      aiProvider === "lmstudio"
                        ? "Not required for local model"
                        : "sk-..."
                    }
                    disabled={aiProvider === "lmstudio"}
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{ color: "var(--card-foreground)" }}
                  >
                    AI Model Name
                  </label>
                  <input
                    type="text"
                    value={
                      aiModels[aiProvider] !== undefined
                        ? aiModels[aiProvider]
                        : defaultModels[aiProvider]
                    }
                    onChange={(e) =>
                      setAiModels((prev) => ({
                        ...prev,
                        [aiProvider]: e.target.value,
                      }))
                    }
                    className="input-clean font-mono text-sm"
                    placeholder={`e.g. ${defaultModels[aiProvider]}`}
                  />
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Default: {defaultModels[aiProvider]}
                  </p>
                </div>
                <div className="pt-2">
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{ color: "var(--card-foreground)" }}
                  >
                    GitHub Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="input-clean font-mono text-sm"
                    placeholder="ghp_..."
                  />
                  <div
                    className="text-xs mt-2 space-y-1 p-3 rounded-lg"
                    style={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--secondary-text)",
                    }}
                  >
                    <p
                      className="font-semibold mb-1"
                      style={{ color: "var(--card-foreground)" }}
                    >
                      How to generate a token:
                    </p>
                    <ol className="list-decimal list-inside space-y-0.5 ml-1">
                      <li>
                        Go to{" "}
                        <a
                          href="https://github.com/settings/tokens/new"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          GitHub Developer Settings
                        </a>
                      </li>
                      <li>Add a Note (e.g. "Commit Migration Tool")</li>
                      <li>
                        Select the <strong>`repo`</strong> scope
                      </li>
                      <li>
                        Click <strong>Generate token</strong> at the bottom
                      </li>
                    </ol>
                    <p className="text-orange-500 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} /> Copy the token — you won't see
                      it again.
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="px-6 py-4 border-t flex justify-end"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--muted)",
                }}
              >
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
          style={{ background: "var(--background)" }}
        >
          <div className="max-w-4xl mx-auto space-y-8 pb-20">
            {/* Global Error Banner */}
            {error && (
              <div
                className="border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3 shadow-sm animate-fade-in"
                style={{
                  background: isDark ? "rgba(239,68,68,0.1)" : "#fef2f2",
                  color: isDark ? "#fca5a5" : "#b91c1c",
                }}
              >
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* STEP 1: Select Project */}
            <section
              className={`clean-panel p-6 sm:p-8 transition-opacity duration-300 ${step !== 1 && "opacity-50"}`}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
                  <FolderSearch size={22} />
                </div>
                <h2
                  className="text-xl font-bold"
                  style={{ color: "var(--card-foreground)" }}
                >
                  1. Select Project
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={projectPath}
                  readOnly
                  placeholder="Select a project folder..."
                  className="input-clean flex-1 font-mono text-sm cursor-not-allowed opacity-60"
                />
                <button
                  onClick={browseFolder}
                  disabled={isRunning}
                  className="px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-2 justify-center shadow-sm"
                  style={{
                    background: "var(--card-foreground)",
                    color: "var(--card)",
                  }}
                >
                  Browse Directory
                </button>
              </div>

              {step === 1 && (
                <button
                  onClick={() => analyzeProject()}
                  disabled={isRunning || !projectPath}
                  className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm"
                >
                  {isRunning ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FolderGit2 />
                  )}{" "}
                  Continue
                </button>
              )}
            </section>

            {/* STEP 2 — Full Width Git Graph Panel */}
            {step >= 2 && (
              <>
                <div
                  className={`clean-panel transition-opacity duration-300 ${step !== 2 && "opacity-50"}`}
                >
                  <div className="p-6 sm:p-8">
                    {/* Branch selectors row */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg">
                        <GitBranch size={20} />
                      </div>
                      <h2
                        className="text-xl font-bold"
                        style={{ color: "var(--card-foreground)" }}
                      >
                        2. Map Commits
                      </h2>
                      {isRunning && commits.length > 0 && (
                        <Loader2
                          size={16}
                          className="animate-spin ml-auto"
                          style={{ color: "var(--muted-foreground)" }}
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                      <div
                        className="p-4 rounded-xl"
                        style={{
                          background: "var(--muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <label
                          className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Base Branch (Source)
                        </label>
                        <select
                          value={baseBranch}
                          onChange={(e) => setBaseBranch(e.target.value)}
                          className="input-clean font-medium shadow-sm text-sm"
                        >
                          {branches.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-2 shadow-sm z-10 hidden md:block"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <ArrowRight
                          style={{ color: "var(--muted-foreground)" }}
                          size={16}
                        />
                      </div>
                      <div
                        className="p-4 rounded-xl"
                        style={{
                          background: "var(--muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <label
                          className="block text-[11px] font-bold uppercase tracking-wider mb-1.5"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Target Branch (Destination)
                        </label>
                        <select
                          value={targetBranch}
                          onChange={(e) => setTargetBranch(e.target.value)}
                          className="input-clean font-medium shadow-sm text-sm"
                        >
                          {branches.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full-width git graph */}
                <div className="-mx-4 sm:-mx-6 lg:-mx-8">
                  {commits.length > 0 ? (
                    <GitGraphViewer
                      commits={commits}
                      selectedCommit={selectedCommit}
                      onSelectCommit={(hash) =>
                        step === 2 && setSelectedCommit(hash)
                      }
                      baseBranch={baseBranch}
                      targetBranch={targetBranch}
                      projectPath={projectPath}
                      onSearch={setSearchQuery}
                      isLoading={isRunning}
                      targetHashes={targetHashes}
                    />
                  ) : isRunning ? (
                    <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
                      <Loader2 size={20} className="animate-spin" /> Loading
                      commits...
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-12">
                      No commits found for this branch.
                    </div>
                  )}
                </div>

                {step === 2 && (
                  <div className="flex justify-end">
                    <button
                      onClick={branchAndReset}
                      disabled={!selectedCommit}
                      className="disabled:opacity-40 text-white font-medium px-8 py-3 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                      style={{
                        background: "var(--card-foreground)",
                        color: "var(--card)",
                      }}
                    >
                      Confirm Selection <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* STEP 3: Playground / Local CI */}
            {step >= 3 && (
              <section
                className={`clean-panel p-6 sm:p-8 animate-slide-up shadow-lg shadow-blue-500/5 ${step !== 3 && "opacity-50"}`}
              >
                <div className="flex gap-4 items-start mb-6">
                  <div className="bg-orange-100 text-orange-600 p-2 rounded-lg shrink-0">
                    <Terminal size={22} />
                  </div>
                  <div>
                    <h2
                      className="text-xl font-bold"
                      style={{ color: "var(--card-foreground)" }}
                    >
                      3. Checkout &amp; Playground
                    </h2>
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--secondary-text)" }}
                    >
                      {resumingRecordId
                        ? `Fix code locally on branch "${newBranchName}" and retry validation.`
                        : "Create branch and run CI validations locally."}
                    </p>
                  </div>
                </div>

                <div
                  className="p-5 rounded-xl mb-6 space-y-4"
                  style={{
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <label
                      className="block text-sm font-semibold mb-2"
                      style={{ color: "var(--card-foreground)" }}
                    >
                      Local Command (e.g. tests, linters)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={ciCommand}
                        onChange={(e) => setCiCommand(e.target.value)}
                        className="input-clean font-mono flex-1"
                        placeholder="bun run test"
                      />
                      {step === 3 && (
                        <button
                          onClick={runOperation}
                          disabled={isRunning}
                          className="bg-orange-600 hover:bg-orange-500 disabled:bg-orange-300 text-white px-6 py-3 rounded-lg font-medium whitespace-nowrap flex items-center gap-2 justify-center shadow-sm"
                        >
                          {isRunning ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Terminal size={18} />
                          )}
                          {resumingRecordId
                            ? "Retry Operate on Branch"
                            : "Run Operate"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {operateLog && (
                  <div
                    className="rounded-xl overflow-hidden shadow-sm"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    <div className="bg-slate-900 text-slate-200 p-3 text-xs font-mono border-b border-slate-700 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span>Console Output</span>
                        <button
                          onClick={() => {
                            const log =
                              (operateLog.stdout || "") +
                              (operateLog.stderr || "");
                            navigator.clipboard.writeText(log);
                          }}
                          className="flex items-center gap-1 hover:text-white transition-colors text-[10px] bg-slate-700 px-2 py-0.5 rounded"
                        >
                          <Copy size={10} /> Copy Log
                        </button>
                      </div>
                      <span
                        className={
                          operateLog.exitCode === 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }
                      >
                        Exit Code: {operateLog.exitCode}
                      </span>
                    </div>
                    <div
                      ref={terminalRef}
                      className="bg-slate-950 p-4 font-mono text-xs max-h-[300px] overflow-y-auto whitespace-pre-wrap"
                    >
                      {operateLog.stdout && (
                        <span className="text-slate-300">
                          {operateLog.stdout}
                        </span>
                      )}
                      {operateLog.stderr && (
                        <span className="text-red-400 mt-2 block">
                          {operateLog.stderr}
                        </span>
                      )}
                      {!operateLog.stdout && !operateLog.stderr && (
                        <span className="text-slate-600 italic">No output</span>
                      )}
                    </div>
                  </div>
                )}

                {/* === Simulation Panel (แสดงหลังจาก Local CI ผ่าน) === */}
                {step === 3 && operateLog?.exitCode === 0 && !isRunning && (
                  <div className="mt-6 space-y-4 animate-slide-up">
                    {/* Trigger Card — แสดงเมื่อยังไม่ได้รัน simulation */}
                    {!simLog && (
                      <div
                        className="p-5 rounded-xl border-2 border-dashed"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--muted)",
                        }}
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-green-100 text-green-600 p-2 rounded-lg shrink-0">
                            <CheckCircle2 size={22} />
                          </div>
                          <div className="flex-1">
                            <h3
                              className="font-bold"
                              style={{ color: "var(--card-foreground)" }}
                            >
                              Local CI Passed
                            </h3>
                            <p
                              className="text-sm mt-1"
                              style={{ color: "var(--secondary-text)" }}
                            >
                              Run a <strong>Merge Simulation</strong> to verify
                              code also passes after merging into{" "}
                              <code
                                className="font-mono px-1 py-0.5 rounded text-xs"
                                style={{
                                  background: "var(--muted-foreground)",
                                  color: "var(--card)",
                                }}
                              >
                                {targetBranch}
                              </code>
                              .
                            </p>
                          </div>
                          <button
                            id="run-simulation-btn"
                            onClick={runSimulation}
                            disabled={isSimRunning}
                            className="shrink-0 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-300
                                    text-white px-5 py-2.5 rounded-lg font-medium text-sm
                                    flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
                          >
                            <GitMerge size={16} />
                            Run Simulation
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Simulation Console */}
                    {simLog && (
                      <div
                        className="rounded-xl overflow-hidden shadow-sm"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {/* Terminal Header */}
                        <div
                          className="bg-slate-900 text-slate-200 p-3 text-xs font-mono
                                     border-b border-slate-700 flex justify-between items-center"
                        >
                          <span className="flex items-center gap-2">
                            <GitMerge size={12} />
                            Merge Simulation — {newBranchName} → {targetBranch}
                            {(simLog.status === "running" || isSimRunning) && (
                              <Loader2
                                size={12}
                                className="animate-spin text-teal-400"
                              />
                            )}
                            {simLog.status === "merge_ok" && (
                              <span className="text-teal-400">✓ Merged OK</span>
                            )}
                          </span>
                          <span
                            className={
                              simLog.status === "conflict"
                                ? "text-red-400"
                                : simLog.exitCode === 0
                                  ? "text-emerald-400"
                                  : simLog.exitCode !== null
                                    ? "text-red-400"
                                    : "text-slate-400"
                            }
                          >
                            {simLog.status === "conflict"
                              ? "⚠ Conflict"
                              : simLog.exitCode !== null
                                ? `Exit: ${simLog.exitCode}`
                                : "Running..."}
                          </span>
                        </div>

                        {/* Conflict Banner */}
                        {simLog.status === "conflict" && (
                          <div
                            className="border-b"
                            style={{
                              borderColor: "rgba(239,68,68,0.3)",
                              background: "rgba(239,68,68,0.06)",
                            }}
                          >
                            <div className="p-4 space-y-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle
                                  size={16}
                                  className="text-red-400 mt-0.5 shrink-0"
                                />
                                <div>
                                  <p className="text-sm font-semibold text-red-400">
                                    Merge Conflict Detected
                                  </p>
                                  <p
                                    className="text-xs mt-1 font-mono"
                                    style={{ color: "var(--secondary-text)" }}
                                  >
                                    {simLog.conflictMessage}
                                  </p>
                                </div>
                              </div>

                              <div
                                className="rounded-lg p-3 text-xs space-y-1"
                                style={{
                                  background: "rgba(0,0,0,0.2)",
                                  color: "var(--secondary-text)",
                                }}
                              >
                                <p className="font-semibold text-amber-400">
                                  How Auto-resolve works:
                                </p>
                                <p>
                                  Migration branch code will{" "}
                                  <strong className="text-white">
                                    always win
                                  </strong>{" "}
                                  every conflict.
                                </p>
                                <p className="font-mono opacity-70">
                                  git merge -X ours {targetBranch} → auto-commit
                                  → retry simulation
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  id="auto-resolve-btn"
                                  onClick={runAbsorb}
                                  disabled={isAbsorbing}
                                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                                          bg-amber-500 hover:bg-amber-400 disabled:bg-amber-800 text-black disabled:text-amber-400"
                                >
                                  {isAbsorbing ? (
                                    <>
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                      />{" "}
                                      Resolving...
                                    </>
                                  ) : (
                                    <>
                                      <GitMerge size={14} /> Auto-resolve
                                      (Migration Wins)
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => setSimLog(null)}
                                  disabled={isAbsorbing}
                                  className="px-3 py-2 rounded-lg text-xs border transition-colors disabled:opacity-40"
                                  style={{
                                    borderColor: "var(--border)",
                                    color: "var(--secondary-text)",
                                  }}
                                >
                                  Reset
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Output */}
                        <div className="bg-slate-950 p-4 font-mono text-xs max-h-[280px] overflow-y-auto whitespace-pre-wrap">
                          {simLog.stdout && (
                            <span className="text-slate-300">
                              {simLog.stdout}
                            </span>
                          )}
                          {simLog.stderr && (
                            <span className="text-red-400 mt-2 block">
                              {simLog.stderr}
                            </span>
                          )}
                          {!simLog.stdout && !simLog.stderr && (
                            <span className="text-slate-600 italic">
                              Waiting for output...
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Success → Proceed to PR */}
                    {simLog?.status === "done" && simLog.exitCode === 0 && (
                      <div
                        className="flex items-center justify-between p-4 rounded-xl"
                        style={{
                          background: "rgba(16,185,129,0.1)",
                          border: "1px solid rgba(16,185,129,0.3)",
                        }}
                      >
                        <div className="flex items-center gap-3 text-emerald-500">
                          <CheckCircle2 size={20} />
                          <span className="font-semibold text-sm">
                            Post-merge simulation passed — safe to create PR!
                          </span>
                        </div>
                        <button
                          onClick={proceedToPR}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5
                                  rounded-lg transition-colors flex items-center gap-2 shadow-sm text-sm"
                        >
                          Proceed to AI PR <ArrowRight size={16} />
                        </button>
                      </div>
                    )}

                    {/* Failure → Reset */}
                    {simLog?.status === "done" &&
                      simLog.exitCode !== null &&
                      simLog.exitCode !== 0 && (
                        <div
                          className="flex items-center justify-between p-4 rounded-xl"
                          style={{
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.3)",
                          }}
                        >
                          <div className="flex items-center gap-3 text-red-400">
                            <AlertCircle size={20} />
                            <span className="font-semibold text-sm">
                              Simulation failed (exit {simLog.exitCode}). Fix
                              the issue and re-run.
                            </span>
                          </div>
                          <button
                            onClick={() => setSimLog(null)}
                            className="border text-sm px-4 py-2 rounded-lg transition-colors"
                            style={{
                              borderColor: "var(--border)",
                              color: "var(--secondary-text)",
                            }}
                          >
                            Reset Simulation
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </section>
            )}

            {/* STEP 4: AI Generate PR */}
            {step >= 4 && (
              <section
                className={`clean-panel p-6 sm:p-8 animate-slide-up shadow-lg shadow-purple-500/5 ${step !== 4 && "opacity-50"}`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 text-purple-600 p-2 rounded-lg">
                      <Sparkles size={22} />
                    </div>
                    <h2
                      className="text-xl font-bold"
                      style={{ color: "var(--card-foreground)" }}
                    >
                      4. AI Review Generator
                    </h2>
                  </div>
                </div>

                {step === 4 && !prContent ? (
                  <div
                    className="text-center py-10 rounded-xl border-2 border-dashed"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <Sparkles
                      className="mx-auto mb-4"
                      style={{ color: "var(--muted-foreground)" }}
                      size={40}
                    />
                    <p
                      className="mb-6"
                      style={{ color: "var(--secondary-text)" }}
                    >
                      Let{" "}
                      {aiProvider.charAt(0).toUpperCase() + aiProvider.slice(1)}{" "}
                      analyze the diff and write your PR.
                    </p>
                    <button
                      onClick={generatePR}
                      disabled={isRunning}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-300 text-white px-8 py-3 rounded-xl font-bold shadow-md shadow-purple-500/20 flex items-center gap-2 mx-auto justify-center transition-transform hover:scale-105 active:scale-95"
                    >
                      {isRunning ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}{" "}
                      Generate Magic PR
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <label
                        className="block text-sm font-semibold mb-1"
                        style={{ color: "var(--card-foreground)" }}
                      >
                        Pull Request Title
                      </label>
                      <input
                        type="text"
                        value={prTitle}
                        onChange={(e) => setPrTitle(e.target.value)}
                        className="input-clean font-medium text-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            className="block text-sm font-semibold"
                            style={{ color: "var(--card-foreground)" }}
                          >
                            AI Generated Description
                          </label>
                          <button
                            onClick={generatePR}
                            disabled={isRunning}
                            className="text-purple-500 hover:text-purple-400 text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-40"
                          >
                            {isRunning ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}{" "}
                            Regenerate
                          </button>
                        </div>
                        <textarea
                          value={prContent}
                          onChange={(e) => setPrContent(e.target.value)}
                          rows={14}
                          className="input-clean font-mono text-sm leading-relaxed"
                        />
                      </div>
                      <div>
                        <label
                          className="block text-sm font-semibold mb-1"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Diff Preview (Read-only)
                        </label>
                        <textarea
                          readOnly
                          value={diffContent}
                          rows={14}
                          className="input-clean font-mono text-xs opacity-60 cursor-default"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        className="block text-sm font-semibold mb-1"
                        style={{ color: "var(--card-foreground)" }}
                      >
                        Reviewers (Comma separated GitHub Usernames)
                      </label>
                      <input
                        type="text"
                        value={reviewers}
                        onChange={(e) => setReviewers(e.target.value)}
                        className="input-clean"
                        placeholder="user_a, user_b"
                      />
                    </div>

                    {step === 4 && (
                      <div className="pt-4 flex justify-end">
                        <button
                          onClick={pushAndPR}
                          disabled={isRunning}
                          className="disabled:opacity-50 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95 flex items-center gap-2 text-lg"
                          style={{ background: "var(--card-foreground)" }}
                        >
                          {isRunning ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Send size={22} />
                          )}{" "}
                          Publish to GitHub
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* STEP 5: Done */}
            {step === 5 && (
              <section className="clean-panel p-10 text-center animate-slide-up border-emerald-500/30 border-2 shadow-emerald-500/10">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={32} />
                </div>
                <h2
                  className="text-3xl font-bold mb-3"
                  style={{ color: "var(--card-foreground)" }}
                >
                  Shipment Successful!
                </h2>
                <p
                  className="mb-8 max-w-sm mx-auto"
                  style={{ color: "var(--secondary-text)" }}
                >
                  Your code has branch has been created, mapped, tested, and a
                  Pull Request was opened via AI evaluation.
                </p>

                <div className="flex items-center justify-center gap-4">
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-sm"
                  >
                    <ExternalLink size={18} /> View on GitHub
                  </a>
                  <button
                    onClick={() => {
                      setStep(1);
                      setPrContent("");
                      setOperateLog(null);
                      setSelectedCommit("");
                    }}
                    className="px-6 py-3 rounded-lg font-semibold transition-colors"
                    style={{
                      background: "var(--muted)",
                      color: "var(--foreground)",
                    }}
                  >
                    Start New Journey
                  </button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
