'use client';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  User, Search, Filter, ChevronDown, ChevronRight,
  FileCode, CheckCircle2, History, Loader2, GitCommit
} from 'lucide-react';

interface Commit {
  hash: string;
  date: string;
  message: string;
  refs: string;
  author_name: string;
  author_email: string;
  parents?: string;
  relativeDate?: string;
  body?: string;
}

interface GitGraphViewerProps {
  commits: Commit[];
  selectedCommit: string;
  onSelectCommit: (hash: string) => void;
  baseBranch: string;
  targetBranch: string;
  projectPath: string;
  onSearch: (query: string) => void;
  isLoading?: boolean;
  targetHashes?: Set<string>;
}

interface LaneItem {
  hash: string;
  colorIndex: number;
}

const LANE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f43f5e', '#84cc16', '#fb923c',
];

const CELL_H = 36;   // compact row height
const DOT_R = 4;     // dot radius
const LANE_W = 18;   // horizontal spacing per lane

function getColor(idx: number) {
  return LANE_COLORS[idx % LANE_COLORS.length];
}

export default function GitGraphViewer({
  commits, selectedCommit, onSelectCommit,
  baseBranch, targetBranch, projectPath,
  onSearch, isLoading = false, targetHashes = new Set()
}: GitGraphViewerProps) {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, any[]>>({});
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const searchTimer = useRef<any>(null);

  // Fetch changed files when a commit is expanded
  useEffect(() => {
    if (!expandedCommit || commitFiles[expandedCommit] !== undefined) return;
    const fetchFiles = async () => {
      setIsFetchingFiles(true);
      try {
        const res = await fetch('/api/git/commit-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath, hash: expandedCommit }),
        });
        const data = await res.json();
        setCommitFiles(prev => ({ ...prev, [expandedCommit]: data?.files || [] }));
      } catch { setCommitFiles(prev => ({ ...prev, [expandedCommit!]: [] })); }
      finally { setIsFetchingFiles(false); }
    };
    fetchFiles();
  }, [expandedCommit, projectPath, commitFiles]);

  // Debounce search
  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearch(val), 500);
  };

  // Build graph layout
  const { processedCommits, maxLane } = useMemo(() => {
    if (!commits.length) return { processedCommits: [], maxLane: 0 };

    let activeLanes: (LaneItem | null)[] = [];
    let nextColorIdx = 0;
    let maxLane = 0;

    const processed = commits.map((commit) => {
      const parents = commit.parents ? commit.parents.split(' ').filter(Boolean) : [];
      const hash = commit.hash;

      let laneIdx = activeLanes.findIndex(l => l?.hash === hash);
      if (laneIdx === -1) {
        laneIdx = activeLanes.findIndex(l => l === null);
        if (laneIdx === -1) laneIdx = activeLanes.length;
        activeLanes[laneIdx] = { hash, colorIndex: nextColorIdx++ };
      }

      const color = getColor(activeLanes[laneIdx]!.colorIndex);
      const snapshotBefore = activeLanes.map(l => l ? { ...l } : null);

      // Replace this commit in its lane with first parent
      if (parents.length > 0) {
        activeLanes[laneIdx]!.hash = parents[0];
      } else {
        activeLanes[laneIdx] = null;
      }

      // Allocate new lanes for additional parents (merge commits)
      const extraParentLanes: number[] = [];
      for (let i = 1; i < parents.length; i++) {
        let slot = activeLanes.findIndex(l => l === null);
        if (slot === -1) slot = activeLanes.length;
        activeLanes[slot] = { hash: parents[i], colorIndex: nextColorIdx++ };
        extraParentLanes.push(slot);
      }

      // Trim trailing nulls
      while (activeLanes.length && activeLanes[activeLanes.length - 1] === null) activeLanes.pop();

      maxLane = Math.max(maxLane, snapshotBefore.length, activeLanes.length, laneIdx + 1);

      return { ...commit, laneIdx, color, snapshotBefore, afterLanes: [...activeLanes].map(l => l ? { ...l } : null), extraParentLanes };
    });

    return { processedCommits: processed, maxLane };
  }, [commits]);

  // SVG width
  const svgW = Math.max(60, (maxLane + 1) * LANE_W + 16);

  const renderRefs = (refStr: string) => {
    if (!refStr) return null;
    return refStr.split(',').map(r => r.trim()).filter(Boolean).map((r, i) => {
      let cls = 'bg-blue-50 text-blue-600 border-blue-200';
      let label = r;
      if (r.startsWith('HEAD ->')) { label = r.replace('HEAD -> ', ''); cls = 'bg-emerald-50 text-emerald-600 border-emerald-200 font-bold'; }
      else if (r.startsWith('tag:')) { label = '🏷 ' + r.replace('tag: ', ''); cls = 'bg-amber-50 text-amber-600 border-amber-200'; }
      else if (r.startsWith('origin/')) cls = 'bg-rose-50 text-rose-600 border-rose-200';
      else if (r === baseBranch) cls = 'bg-indigo-50 text-indigo-600 border-indigo-200 font-bold';
      else if (r === targetBranch) cls = 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 font-bold';
      return <span key={i} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border leading-none ml-1 ${cls}`}>{label}</span>;
    });
  };

  const fileStatusColor = (s: string) => {
    if (s === 'M') return 'bg-orange-100 text-orange-700';
    if (s === 'A') return 'bg-emerald-100 text-emerald-700';
    if (s === 'D') return 'bg-red-100 text-red-700';
    if (s === 'R') return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/80 border-b border-slate-200">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search commits..."
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
          />
        </div>
        {/* All Branches checkbox removed */}
        <div className="h-4 w-[1px] bg-slate-200" />
        <button onClick={() => onSearch(searchValue)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold">
          <Filter size={13} /> Filter
        </button>
      </div>

      {/* Horizontal Scroll Container */}
      <div className="overflow-x-auto w-full">
        <div className="min-w-[800px]">
          {/* Column headers */}
      <div className="grid text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-slate-100 bg-white sticky top-0 z-10" 
        style={{ gridTemplateColumns: `${svgW}px 1fr auto auto` }}>
        <div className="px-3 py-1.5">Graph</div>
        <div className="px-2 py-1.5">Commit</div>
        <div className="px-3 py-1.5 text-center w-32">Author</div>
        <div className="px-3 py-1.5 text-right w-28">Date</div>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto max-h-[65vh]">
        {processedCommits.map((c) => {
          const isSelected = selectedCommit === c.hash;
          const isExpanded = expandedCommit === c.hash;
          const cx = 8 + c.laneIdx * LANE_W;
          const cy = CELL_H / 2;

          return (
            <React.Fragment key={c.hash}>
              <div
                onClick={() => {
                  onSelectCommit(c.hash);
                  setExpandedCommit(isExpanded ? null : c.hash);
                }}
                className={`grid group cursor-pointer border-b border-slate-50 transition-colors select-none
                  ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50/80'}`}
                style={{ gridTemplateColumns: `${svgW}px 1fr auto auto`, minHeight: CELL_H }}
              >
                {/* Graph SVG */}
                <div className="relative" style={{ width: svgW, minHeight: CELL_H }}>
                  <svg width={svgW} height={CELL_H} className="absolute inset-0 pointer-events-none overflow-visible">
                    {/* Lines from above */}
                    {c.snapshotBefore.map((lane, li) => {
                      if (!lane) return null;
                      const after = c.afterLanes[li];
                      if (!after || after.hash !== lane.hash) return null;
                      const x = 8 + li * LANE_W;
                      return <line key={li} x1={x} y1={0} x2={x} y2={CELL_H} stroke={getColor(lane.colorIndex)} strokeWidth="1.5" />;
                    })}

                    {/* Line from commit dot down to first parent */}
                    {c.afterLanes[c.laneIdx] && (
                      <line x1={cx} y1={cy} x2={cx} y2={CELL_H} stroke={c.color} strokeWidth="1.5" />
                    )}

                    {/* Line from above down to this dot */}
                    {c.snapshotBefore[c.laneIdx] && (
                      <line x1={cx} y1={0} x2={cx} y2={cy} stroke={c.color} strokeWidth="1.5" />
                    )}

                    {/* Merge arms */}
                    {c.extraParentLanes.map((mLane) => {
                      const mX = 8 + mLane * LANE_W;
                      const mColor = c.afterLanes[mLane] ? getColor(c.afterLanes[mLane]!.colorIndex) : c.color;
                      return (
                        <path key={mLane}
                          d={`M${cx},${cy} C${cx},${cy + 10} ${mX},${cy + 10} ${mX},${CELL_H}`}
                          fill="none" stroke={mColor} strokeWidth="1.5"
                        />
                      );
                    })}

                    {/* Commit dot */}
                    <circle cx={cx} cy={cy} r={DOT_R + (isSelected ? 1.5 : 0)}
                      fill={isSelected ? c.color : '#fff'} stroke={c.color} strokeWidth="2"
                    />
                  </svg>
                </div>

                {/* Message + refs */}
                <div className="flex items-center gap-2 px-2 py-0.5 min-w-0">
                  <span className={`w-4 h-4 shrink-0 flex items-center justify-center rounded transition-colors
                    ${isSelected ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`}>
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  {targetHashes.has(c.hash) && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 shrink-0" title={`Already in ${targetBranch}`}>
                      <CheckCircle2 size={12} />
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-blue-500 shrink-0">{c.hash.substring(0, 7)}</span>
                  <span className="text-xs text-slate-700 truncate font-medium">{c.message}</span>
                  <span className="flex items-center shrink-0">{renderRefs(c.refs)}</span>
                </div>

                {/* Author */}
                <div className="flex items-center gap-1.5 px-3 w-32">
                  <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold uppercase shrink-0">
                    {c.author_name?.charAt(0) || '?'}
                  </div>
                  <span className="text-[11px] text-slate-500 truncate max-w-[60px]">{c.author_name}</span>
                </div>

                {/* Date */}
                <div className="flex items-center justify-end pr-4 w-28">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">{c.relativeDate || ''}</span>
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="border-b border-slate-100 bg-slate-50/60">
                  <div className="flex flex-col lg:flex-row gap-4 p-4">
                    {/* Commit meta */}
                    <div className="flex-1 space-y-3 min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                          {c.author_name?.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800">{c.author_name}</p>
                          <p className="text-[11px] text-slate-500">{c.author_email}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{new Date(c.date).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Full Hash</p>
                        <code className="text-[11px] text-blue-600 break-all select-all">{c.hash}</code>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Message</p>
                        <p className="text-xs text-slate-700">{c.message}</p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectCommit(c.hash); }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${isSelected ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`}
                        >
                          {isSelected ? <><CheckCircle2 size={14} /> Selected</> : '✓ Select for Migration'}
                        </button>
                      </div>
                    </div>

                    {/* Files changed */}
                    <div className="lg:w-72 xl:w-96 bg-white rounded-lg border border-slate-200 flex flex-col max-h-56">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                        <FileCode size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Files Changed {commitFiles[c.hash] !== undefined ? `(${commitFiles[c.hash]?.length ?? 0})` : ''}
                        </span>
                      </div>
                      <div className="overflow-y-auto flex-1 p-1.5">
                        {isFetchingFiles && commitFiles[c.hash] === undefined ? (
                          <div className="flex items-center justify-center h-12 gap-2 text-slate-400 text-xs">
                            <Loader2 size={13} className="animate-spin" /> Loading...
                          </div>
                        ) : (commitFiles[c.hash] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">No files found</p>
                        ) : (
                          (commitFiles[c.hash] || []).map((f: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-xs">
                              <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${fileStatusColor(f.status)}`}>
                                {f.status}
                              </span>
                              <span className="font-mono text-slate-600 truncate" title={f.path}>{f.path}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {processedCommits.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <GitCommit size={32} className="opacity-30" />
            <p className="text-sm">No commits found</p>
          </div>
        )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-t border-slate-200">
        <span className="text-[11px] text-slate-400">
          {processedCommits.length} commits found
          {selectedCommit && <span className="ml-2 text-blue-500 font-medium">· {selectedCommit.substring(0, 7)} selected</span>}
          {isLoading && <span className="ml-2 flex items-center gap-1 inline-flex"><Loader2 size={10} className="animate-spin" /> Loading...</span>}
        </span>
      </div>
    </div>
  );
}
