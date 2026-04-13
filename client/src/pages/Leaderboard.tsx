import { useState, useMemo, useEffect, useRef } from 'react';
import { RefreshCw, Info, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import LeaderboardTableWithImprovement, { type PivotedLeaderboardRowWithImprovement } from '@/components/LeaderboardTableWithImprovement';
import SearchBarWithBaseModel from '@/components/SearchBarWithBaseModel';
import FilterControlsWithBaseModel from '@/components/FilterControlsWithBaseModel';
import ViewModeControls from '@/components/ViewModeControls';
import ThemeToggle from '@/components/ThemeToggle';
import { DEFAULT_VISIBLE_BENCHMARKS } from '@/config/benchmarkConfig';
import { BLACKLISTED_MODELS } from '@/config/blacklistedModels';

type EvalSelectionMode = 'oldest' | 'latest' | 'highest' | 'all';

const SELECTION_MODE_DESCRIPTIONS: Record<EvalSelectionMode, string> = {
  oldest: 'Shows the first valid evaluation (accuracy > 1%) per model/agent/benchmark, falling back to the earliest if none meet the threshold.',
  latest: 'Shows the most recent valid evaluation (accuracy > 1%) per model/agent/benchmark, falling back to the latest if none meet the threshold.',
  highest: 'Shows the highest accuracy evaluation per model/agent/benchmark.',
  all: 'Shows all evaluations per cell. Use ◀ ▶ arrows to cycle through multiple results.',
};

const EVAL_AGENT_NAMES = new Set(['terminus-2', 'openhands', 'mini-swe-agent', 'swe-agent']);

export default function Leaderboard() {
  const [selectionMode, setSelectionMode] = useState<EvalSelectionMode>('highest');
  const [activeTab, setActiveTab] = useState<'filtered' | 'all' | 'blacklisted' | 'base' | 'active' | 'a1' | 'b1' | 'c1' | 'd1' | 'baselineData' | 'missingEval' | 'guardrail'>('all');
  const [topN, setTopN] = useState<number>(50);
  const [recentlyAddedN, setRecentlyAddedN] = useState<number>(50);
  const [recentlyEvaledN, setRecentlyEvaledN] = useState<number>(50);
  const [topPerformerBenchmark, setTopPerformerBenchmark] = useState<string>('dev_set_v2');
  const [modelSearch, setModelSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [baseModelSearch, setBaseModelSearch] = useState('');
  const [benchmarkSearch, setBenchmarkSearch] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedTrainingAgents, setSelectedTrainingAgents] = useState<string[]>([]);
  const [selectedBaseModels, setSelectedBaseModels] = useState<string[]>([]);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([]);
  const [selectedTrainingTypes, setSelectedTrainingTypes] = useState<string[]>([]);
  const [selectedModelSizes, setSelectedModelSizes] = useState<string[]>([]);
  // Duplicate display controls (default: hide duplicates)
  const [showDuplicateBenchmarks, setShowDuplicateBenchmarks] = useState(false);
  const [showDuplicateModels, setShowDuplicateModels] = useState(false);
  const [showDuplicateAgents, setShowDuplicateAgents] = useState(false);
  const [hideNoTraceLink, setHideNoTraceLink] = useState(false);
  const [hideBlacklisted, setHideBlacklisted] = useState(false);
  const [hideBaseModels, setHideBaseModels] = useState(false);

  // Always fetch improvement metrics data (query key includes mode for per-mode caching)
  const { data: pivotedData = [], isLoading, isFetching, refetch } = useQuery<PivotedLeaderboardRowWithImprovement[]>({
    queryKey: [`/api/leaderboard-pivoted-with-improvement?mode=${selectionMode}&hideNoTraceLink=${hideNoTraceLink}`],
  });

  const handleRefresh = () => {
    refetch();
  };

  const availableModels = useMemo(() => {
    let models = pivotedData;
    if (!showDuplicateModels) {
      models = models.filter(item => item.modelDuplicateOf === null);
    }
    return Array.from(new Set(models.map((item) => item.modelName))).sort();
  }, [pivotedData, showDuplicateModels]);

  const availableAgents = useMemo(() => {
    let agents = pivotedData;
    if (!showDuplicateAgents) {
      agents = agents.filter(item => item.agentDuplicateOf === null);
    }
    return Array.from(new Set(agents.map((item) => item.agentName))).sort();
  }, [pivotedData, showDuplicateAgents]);

  const availableEvalAgents = useMemo(() => {
    // Only known eval agents that actually appear in the data
    const allAgents = new Set(pivotedData.map(item => item.agentName));
    return Array.from(EVAL_AGENT_NAMES).filter(a => allAgents.has(a)).sort();
  }, [pivotedData]);

  const availableTrainingAgents = useMemo(() => {
    const trainingSet = new Set<string>();
    pivotedData.forEach(item => {
      if (item.agentName && !EVAL_AGENT_NAMES.has(item.agentName)) trainingSet.add(item.agentName);
      if (item.trainingAgentName && !EVAL_AGENT_NAMES.has(item.trainingAgentName)) trainingSet.add(item.trainingAgentName);
    });
    return Array.from(trainingSet).sort();
  }, [pivotedData]);

  const availableBaseModels = useMemo(() => {
    const field = showDuplicateModels ? 'baseModelName' : 'canonicalBaseModelName';
    return Array.from(new Set(
      pivotedData.map((item) => item[field]).filter(Boolean)
    )).sort();
  }, [pivotedData, showDuplicateModels]);

  const availableTrainingTypes = useMemo(() => {
    return Array.from(new Set(
      pivotedData.map((item) => item.trainingType || 'None')
    )).sort();
  }, [pivotedData]);

  const availableModelSizes = useMemo(() => {
    const sizes = new Set<string>();
    pivotedData.forEach((item) => {
      sizes.add(item.modelSizeB != null ? `${Math.floor(item.modelSizeB)}B` : 'Unknown');
    });
    return Array.from(sizes).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return parseInt(a) - parseInt(b);
    });
  }, [pivotedData]);

  const availableBenchmarks = useMemo(() => {
    const benchmarkSet = new Set<string>();
    pivotedData.forEach(row => {
      Object.entries(row.benchmarks).forEach(([name, data]) => {
        if (showDuplicateBenchmarks || !data.benchmarkDuplicateOf) {
          benchmarkSet.add(name);
        }
      });
    });
    return Array.from(benchmarkSet).sort();
  }, [pivotedData, showDuplicateBenchmarks]);

  // Build a map of duplicate benchmark -> canonical benchmark from the data
  const benchmarkDuplicateMap = useMemo(() => {
    const map = new Map<string, string>(); // duplicateName -> canonicalName
    pivotedData.forEach(row => {
      Object.entries(row.benchmarks).forEach(([benchmarkName, benchmarkData]) => {
        if (benchmarkData.benchmarkDuplicateOf && benchmarkData.canonicalBenchmarkName) {
          map.set(benchmarkName, benchmarkData.canonicalBenchmarkName);
        }
      });
    });
    return map;
  }, [pivotedData]);

  // Build reverse map: canonical -> array of duplicate benchmark names
  const canonicalToDuplicatesMap = useMemo(() => {
    const map = new Map<string, string[]>(); // canonicalName -> [duplicateName1, duplicateName2, ...]
    benchmarkDuplicateMap.forEach((canonicalName, duplicateName) => {
      const existing = map.get(canonicalName) || [];
      existing.push(duplicateName);
      map.set(canonicalName, existing);
    });
    return map;
  }, [benchmarkDuplicateMap]);

  // Only canonical benchmarks (not duplicates) for the top performer dropdown
  const canonicalBenchmarks = useMemo(() => {
    return availableBenchmarks.filter(benchmark => !benchmarkDuplicateMap.has(benchmark));
  }, [availableBenchmarks, benchmarkDuplicateMap]);

  // Filter by view mode: Top N + Recent N
  const filteredByViewMode = useMemo(() => {
    if (activeTab !== 'filtered') {
      return pivotedData; // No filtering for non-filtered tabs
    }

    // Helper function to get accuracy for sorting (canonical or duplicate fallback)
    const getAccuracyForSorting = (row: PivotedLeaderboardRowWithImprovement, benchmarkName: string): number => {
      // First try canonical benchmark
      const canonicalData = row.benchmarks[benchmarkName];
      if (canonicalData !== undefined) {
        return canonicalData.accuracy ?? -Infinity;
      }

      // Fall back to duplicates
      const duplicates = canonicalToDuplicatesMap.get(benchmarkName) || [];
      if (duplicates.length === 0) {
        return -Infinity;
      }

      // Find duplicate results for this row
      const duplicateResults = duplicates
        .map(dupName => row.benchmarks[dupName])
        .filter(data => data !== undefined);

      if (duplicateResults.length === 0) {
        return -Infinity;
      }

      // Use first duplicate's accuracy (duplicates are already deduplicated per model-agent-benchmark)
      return duplicateResults[0].accuracy ?? -Infinity;
    };

    // Filter: rows with selected benchmark OR any of its duplicates
    const duplicatesOfSelected = canonicalToDuplicatesMap.get(topPerformerBenchmark) || [];
    const dataWithBenchmark = pivotedData.filter(row => {
      if (row.benchmarks[topPerformerBenchmark] !== undefined) return true;
      return duplicatesOfSelected.some(dup => row.benchmarks[dup] !== undefined);
    });

    // Top N by selected benchmark accuracy (descending), with duplicate fallback
    const topPerformers = [...dataWithBenchmark]
      .sort((a, b) => {
        const accuracyA = getAccuracyForSorting(a, topPerformerBenchmark);
        const accuracyB = getAccuracyForSorting(b, topPerformerBenchmark);
        return accuracyB - accuracyA;
      })
      .slice(0, topN === Number.MAX_SAFE_INTEGER ? undefined : topN);

    // N Most Recently Added — sort by modelCreatedAt only
    const safeDateMs = (s: string | undefined) => {
      if (!s || s === '—') return NaN;
      const t = new Date(s).getTime();
      return isNaN(t) ? -Infinity : t;
    };
    const dataWithCreatedAt = pivotedData.filter(row => row.modelCreatedAt && row.modelCreatedAt !== '—' && !isNaN(new Date(row.modelCreatedAt).getTime()));
    const mostRecentlyAdded = [...dataWithCreatedAt]
      .sort((a, b) => safeDateMs(b.modelCreatedAt) - safeDateMs(a.modelCreatedAt))
      .slice(0, recentlyAddedN === Number.MAX_SAFE_INTEGER ? undefined : recentlyAddedN);

    // N Most Recently Evaluated — sort by latestEvalEndedAt only (no fallback)
    const dataWithEvalAt = pivotedData.filter(row => row.latestEvalEndedAt && row.latestEvalEndedAt !== '—' && !isNaN(new Date(row.latestEvalEndedAt).getTime()));
    const mostRecentlyEvaled = [...dataWithEvalAt]
      .sort((a, b) => safeDateMs(b.latestEvalEndedAt) - safeDateMs(a.latestEvalEndedAt))
      .slice(0, recentlyEvaledN === Number.MAX_SAFE_INTEGER ? undefined : recentlyEvaledN);

    // Union: Remove duplicates using Map
    const uniqueMap = new Map<string, PivotedLeaderboardRowWithImprovement>();
    topPerformers.forEach(row => {
      uniqueMap.set(`${row.modelName}|||${row.agentName}`, row);
    });
    mostRecentlyAdded.forEach(row => {
      uniqueMap.set(`${row.modelName}|||${row.agentName}`, row);
    });
    mostRecentlyEvaled.forEach(row => {
      uniqueMap.set(`${row.modelName}|||${row.agentName}`, row);
    });

    return Array.from(uniqueMap.values());
  }, [pivotedData, activeTab, topN, recentlyAddedN, recentlyEvaledN, topPerformerBenchmark, canonicalToDuplicatesMap]);

  // Pre-filter data based on active tab
  const tabFilteredData = useMemo(() => {
    switch (activeTab) {
      case 'blacklisted':
        return pivotedData.filter(row => BLACKLISTED_MODELS.has(row.modelName));
      case 'base':
        return pivotedData.filter(row => row.baseModelName === 'None');
      case 'active':
        return pivotedData.filter(row =>
          row.baseModelName !== 'None' && !BLACKLISTED_MODELS.has(row.modelName)
        );
      case 'all':
        return pivotedData;
      case 'filtered':
        return filteredByViewMode;
      case 'a1':
        return pivotedData.filter(row => row.modelName.startsWith('DCAgent/a1-'));
      case 'b1':
        return pivotedData.filter(row => row.modelName.startsWith('DCAgent/b1_'));
      case 'c1':
        return pivotedData.filter(row => row.modelName.startsWith('DCAgent/c1_'));
      case 'd1':
        return pivotedData.filter(row => row.modelName.startsWith('DCAgent/d1_'));
      case 'guardrail':
        return pivotedData.filter(row =>
          Object.values(row.benchmarks).some(b => {
            const isFinished = b.jobStatus === 'Finished' || b.jobStatus === null;
            return isFinished && (b.isIncomplete || b.isHighErrors);
          })
        );
      case 'baselineData':
        return pivotedData.filter(row =>
          /(?:^|[/_-])(?:316|1000|3160|10000|31000|100000)(?:[/_-]|$)/.test(row.modelName)
        );
      case 'missingEval':
        // Pass all data — the table component applies the missing eval filter
        // after duplicate merging, so it's a strict subset of the All Models view
        return pivotedData;
    }
  }, [activeTab, pivotedData, filteredByViewMode]);

  // Initialize selectedBenchmarks with defaults only on first data load
  const hasInitializedBenchmarks = useRef(false);
  useEffect(() => {
    if (pivotedData.length > 0 && !hasInitializedBenchmarks.current) {
      hasInitializedBenchmarks.current = true;
      const validDefaults = DEFAULT_VISIBLE_BENCHMARKS.filter(benchmark =>
        availableBenchmarks.includes(benchmark)
      );
      if (validDefaults.length > 0) {
        setSelectedBenchmarks(validDefaults);
      }
    }
  }, [pivotedData, availableBenchmarks]);

  const handleClearFilters = () => {
    setSelectedModels([]);
    setSelectedAgents([]);
    setSelectedTrainingAgents([]);
    setSelectedBaseModels([]);
    setSelectedBenchmarks([]);
    setSelectedTrainingTypes([]);
    setSelectedModelSizes([]);
  };

  const handleResetFilters = () => {
    setSelectedModels([]);
    setSelectedAgents([]);
    setSelectedTrainingAgents([]);
    setSelectedBaseModels([]);
    setSelectedTrainingTypes([]);
    setSelectedModelSizes([]);
    const validDefaults = DEFAULT_VISIBLE_BENCHMARKS.filter(benchmark =>
      availableBenchmarks.includes(benchmark)
    );
    setSelectedBenchmarks(validDefaults);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading benchmark results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate" data-testid="text-page-title">
                LLM Agent Benchmark
              </h1>
              <Badge variant="secondary" className="hidden sm:inline-flex" data-testid="text-total-entries">
                {pivotedData.length} rows
              </Badge>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Eval Selection Mode */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
          <span className="text-sm font-medium text-foreground">Result Selection:</span>
          <ToggleGroup
            type="single"
            value={selectionMode}
            onValueChange={(value) => { if (value) setSelectionMode(value as EvalSelectionMode); }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="oldest">Oldest</ToggleGroupItem>
            <ToggleGroupItem value="latest">Latest</ToggleGroupItem>
            <ToggleGroupItem value="highest">Highest</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
          <span className="hidden sm:inline text-xs text-muted-foreground max-w-md">
            {SELECTION_MODE_DESCRIPTIONS[selectionMode]}
          </span>
          {isFetching && !isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
              <TabsTrigger value="all" className="text-xs sm:text-sm">All Models</TabsTrigger>
              <TabsTrigger value="base" className="text-xs sm:text-sm bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 data-[state=active]:bg-cyan-500/30">Base Models</TabsTrigger>
              <TabsTrigger value="a1" className="text-xs sm:text-sm bg-blue-500/15 text-blue-700 dark:text-blue-300 data-[state=active]:bg-blue-500/30">A1</TabsTrigger>
              <TabsTrigger value="b1" className="text-xs sm:text-sm bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 data-[state=active]:bg-emerald-500/30">B1</TabsTrigger>
              <TabsTrigger value="c1" className="text-xs sm:text-sm bg-teal-500/15 text-teal-700 dark:text-teal-300 data-[state=active]:bg-teal-500/30">C1</TabsTrigger>
              <TabsTrigger value="d1" className="text-xs sm:text-sm bg-amber-500/15 text-amber-700 dark:text-amber-300 data-[state=active]:bg-amber-500/30">D1</TabsTrigger>
              <TabsTrigger value="baselineData" className="text-xs sm:text-sm bg-purple-500/15 text-purple-700 dark:text-purple-300 data-[state=active]:bg-purple-500/30">Baseline Data</TabsTrigger>
              <TabsTrigger value="missingEval" className="text-xs sm:text-sm bg-red-500/15 text-red-700 dark:text-red-300 data-[state=active]:bg-red-500/30">Missing Eval</TabsTrigger>
              <TabsTrigger value="guardrail" className="text-xs sm:text-sm bg-orange-500/15 text-orange-700 dark:text-orange-300 data-[state=active]:bg-orange-500/30">Guardrail</TabsTrigger>
              <TabsTrigger value="filtered" className="text-xs sm:text-sm">Filtered View</TabsTrigger>
              <TabsTrigger value="active" className="text-xs sm:text-sm">Active</TabsTrigger>
              <TabsTrigger value="blacklisted" className="text-xs sm:text-sm">Blacklisted</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="filtered" className="space-y-6">
            <ViewModeControls
              topN={topN}
              recentlyAddedN={recentlyAddedN}
              recentlyEvaledN={recentlyEvaledN}
              onTopNChange={setTopN}
              onRecentlyAddedNChange={setRecentlyAddedN}
              onRecentlyEvaledNChange={setRecentlyEvaledN}
              currentCount={filteredByViewMode.length}
              availableBenchmarks={canonicalBenchmarks}
              topPerformerBenchmark={topPerformerBenchmark}
              onTopPerformerBenchmarkChange={setTopPerformerBenchmark}
            />

            <SearchBarWithBaseModel
            modelSearch={modelSearch}
            agentSearch={agentSearch}
            baseModelSearch={baseModelSearch}
            benchmarkSearch={benchmarkSearch}
            onModelSearchChange={setModelSearch}
            onAgentSearchChange={setAgentSearch}
            onBaseModelSearchChange={setBaseModelSearch}
            onBenchmarkSearchChange={setBenchmarkSearch}
          />

          {/* Filters */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <FilterControlsWithBaseModel
              availableModels={availableModels}
              availableAgents={availableAgents}
              availableEvalAgents={availableEvalAgents}
              availableTrainingAgents={availableTrainingAgents}
              availableBaseModels={availableBaseModels}
              availableBenchmarks={availableBenchmarks}
              availableTrainingTypes={availableTrainingTypes}
              availableModelSizes={availableModelSizes}
              selectedModels={selectedModels}
              selectedAgents={selectedAgents}
              selectedTrainingAgents={selectedTrainingAgents}
              selectedBaseModels={selectedBaseModels}
              selectedBenchmarks={selectedBenchmarks}
              selectedTrainingTypes={selectedTrainingTypes}
              selectedModelSizes={selectedModelSizes}
              onModelsChange={setSelectedModels}
              onAgentsChange={setSelectedAgents}
              onTrainingAgentsChange={setSelectedTrainingAgents}
              onBaseModelsChange={setSelectedBaseModels}
              onBenchmarksChange={setSelectedBenchmarks}
              onTrainingTypesChange={setSelectedTrainingTypes}
              onModelSizesChange={setSelectedModelSizes}
              onClearAll={handleClearFilters}
              onReset={handleResetFilters}
            />

            {/* Duplicate Display Controls */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-duplicate-benchmarks"
                  checked={showDuplicateBenchmarks}
                  onCheckedChange={(checked) => setShowDuplicateBenchmarks(checked === true)}
                />
                <label
                  htmlFor="show-duplicate-benchmarks"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show duplicate benchmarks
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-duplicate-models"
                  checked={showDuplicateModels}
                  onCheckedChange={(checked) => setShowDuplicateModels(checked === true)}
                />
                <label
                  htmlFor="show-duplicate-models"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show duplicate models
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-duplicate-agents"
                  checked={showDuplicateAgents}
                  onCheckedChange={(checked) => setShowDuplicateAgents(checked === true)}
                />
                <label
                  htmlFor="show-duplicate-agents"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show duplicate agents
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hide-no-trace-link"
                  checked={hideNoTraceLink}
                  onCheckedChange={(checked) => setHideNoTraceLink(checked === true)}
                />
                <label
                  htmlFor="hide-no-trace-link"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Hide evals with no trace link
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hide-blacklisted"
                  checked={hideBlacklisted}
                  onCheckedChange={(checked) => setHideBlacklisted(checked === true)}
                />
                <label
                  htmlFor="hide-blacklisted"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Hide blacklisted models
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hide-base-models"
                  checked={hideBaseModels}
                  onCheckedChange={(checked) => setHideBaseModels(checked === true)}
                />
                <label
                  htmlFor="hide-base-models"
                  className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Hide base models
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-3 py-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
            {/* Row Highlighting */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Row Highlighting</p>
                  <p className="text-xs">
                    <span className="inline-block w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/60 border mr-1 align-middle" /> Base models (no base model).{' '}
                    <span className="inline-block w-3 h-3 rounded bg-neutral-200 dark:bg-neutral-800/70 border mr-1 align-middle" /> Blacklisted models.
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics Explanation */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Standard Error (±)</p>
                  <p className="text-xs">Calculated over 3 runs. Shows variability in model performance.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 ml-6">
                <div className="w-4 h-4" />
                <div>
                  <p className="font-medium text-foreground">Improvement (pp)</p>
                  <p className="text-xs">Percentage points gained over base model (e.g., +1.02 pp = 1.02% improvement). Green text indicates positive improvement, red indicates regression.</p>
                </div>
              </div>
            </div>

            {/* Sorting Explanation */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Column Sorting</p>
                  <p className="text-xs">For each benchmark, click "Acc" to sort by accuracy or "Imp" to sort by improvement over base model. Gray buttons indicate that sorting mode is inactive.</p>
                </div>
              </div>
            </div>

            {/* Traces Legend */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="font-medium text-foreground">Trace Links</p>
              </div>
              <div className="flex items-center gap-4 text-xs ml-6">
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border-2 border-primary bg-primary/10">
                    <ExternalLink className="w-3 h-3 text-primary" />
                  </div>
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-muted-foreground/20 bg-muted/50">
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                  </div>
                  <span>Unavailable</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-red-500/50 bg-red-500/10">
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  </div>
                  <span>Missing</span>
                </div>
              </div>
            </div>

            {/* Timestamp Columns Legend */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Timestamp Columns (Pacific Time)</p>
                  <p className="text-xs">All timestamps are displayed in Pacific Time (PST/PDT, America/Los_Angeles).</p>
                  <p className="text-xs mt-1"><strong>Model Added At:</strong> When the model was registered in the database.</p>
                  <p className="text-xs mt-1"><strong>First Eval At:</strong> The earliest evaluation completion time across all benchmarks for this model+agent combination.</p>
                  <p className="text-xs mt-1"><strong>Latest Eval At:</strong> The most recent evaluation completion time across all benchmarks for this model+agent combination.</p>
                </div>
              </div>
            </div>

            {/* Result Selection */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Result Selection ({selectionMode.charAt(0).toUpperCase() + selectionMode.slice(1)} mode)</p>
                  <p className="text-xs">
                    {SELECTION_MODE_DESCRIPTIONS[selectionMode]}
                    {' '}Results from equivalent benchmarks (canonical + duplicates) are merged into one pool before selection.
                  </p>
                </div>
              </div>
            </div>

            {/* Config Metadata Badges */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Config Metadata Badges</p>
                  <p className="text-xs">Each benchmark cell displays configuration badges indicating the evaluation environment settings. Badges are only shown for finished evaluations.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs ml-6">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25">T:2x</span>
                  <span>Timeout multiplier (e.g., 2x = double the default timeout)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-muted/50 text-muted-foreground/50 border-muted-foreground/20">T:N/A</span>
                  <span>Timeout not configured</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs ml-6">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border whitespace-nowrap bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">D: Snapshot</span>
                  <span>Daytona sandbox with auto-snapshot enabled</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25">D: 4/8/32</span>
                  <span>Daytona sandbox overrides: CPUs / Memory (GB) / Storage (GB). "x" = not overridden</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border whitespace-nowrap bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25">D: Default</span>
                  <span>Default Daytona sandbox config (no overrides, no snapshot)</span>
                </div>
              </div>
            </div>

          </div>

            {/* Table */}
            <LeaderboardTableWithImprovement
              data={filteredByViewMode}
              modelSearch={modelSearch}
              agentSearch={agentSearch}
              baseModelSearch={baseModelSearch}
              benchmarkSearch={benchmarkSearch}
              filters={{
                models: selectedModels,
                agents: selectedAgents,
                trainingAgents: selectedTrainingAgents,
                baseModels: selectedBaseModels,
                benchmarks: selectedBenchmarks,
                trainingTypes: selectedTrainingTypes,
                modelSizes: selectedModelSizes,
              }}
              showDuplicateBenchmarks={showDuplicateBenchmarks}
              showDuplicateModels={showDuplicateModels}
              showDuplicateAgents={showDuplicateAgents}
              hideBlacklisted={hideBlacklisted}
              hideBaseModels={hideBaseModels}
            />
          </TabsContent>

          {/* Shared content for all non-filtered tabs */}
          {(['all', 'base', 'a1', 'b1', 'c1', 'd1', 'baselineData', 'missingEval', 'guardrail', 'active', 'blacklisted'] as const).map(tabValue => (
            <TabsContent key={tabValue} value={tabValue} className="space-y-6">
              <SearchBarWithBaseModel
                modelSearch={modelSearch}
                agentSearch={agentSearch}
                baseModelSearch={baseModelSearch}
                benchmarkSearch={benchmarkSearch}
                onModelSearchChange={setModelSearch}
                onAgentSearchChange={setAgentSearch}
                onBaseModelSearchChange={setBaseModelSearch}
                onBenchmarkSearchChange={setBenchmarkSearch}
              />

              {/* Filters */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <FilterControlsWithBaseModel
                  availableModels={availableModels}
                  availableAgents={availableAgents}
                  availableEvalAgents={availableEvalAgents}
                  availableTrainingAgents={availableTrainingAgents}
                  availableBaseModels={availableBaseModels}
                  availableBenchmarks={availableBenchmarks}
                  availableTrainingTypes={availableTrainingTypes}
                  availableModelSizes={availableModelSizes}
                  selectedModels={selectedModels}
                  selectedAgents={selectedAgents}
                  selectedTrainingAgents={selectedTrainingAgents}
                  selectedBaseModels={selectedBaseModels}
                  selectedBenchmarks={selectedBenchmarks}
                  selectedTrainingTypes={selectedTrainingTypes}
                  selectedModelSizes={selectedModelSizes}
                  onModelsChange={setSelectedModels}
                  onAgentsChange={setSelectedAgents}
                  onTrainingAgentsChange={setSelectedTrainingAgents}
                  onBaseModelsChange={setSelectedBaseModels}
                  onBenchmarksChange={setSelectedBenchmarks}
                  onTrainingTypesChange={setSelectedTrainingTypes}
                  onModelSizesChange={setSelectedModelSizes}
                  onClearAll={handleClearFilters}
                  onReset={handleResetFilters}
                />

                {/* Duplicate Display Controls */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`show-duplicate-benchmarks-${tabValue}`}
                      checked={showDuplicateBenchmarks}
                      onCheckedChange={(checked) => setShowDuplicateBenchmarks(checked === true)}
                    />
                    <label
                      htmlFor={`show-duplicate-benchmarks-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Show duplicate benchmarks
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`show-duplicate-models-${tabValue}`}
                      checked={showDuplicateModels}
                      onCheckedChange={(checked) => setShowDuplicateModels(checked === true)}
                    />
                    <label
                      htmlFor={`show-duplicate-models-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Show duplicate models
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`show-duplicate-agents-${tabValue}`}
                      checked={showDuplicateAgents}
                      onCheckedChange={(checked) => setShowDuplicateAgents(checked === true)}
                    />
                    <label
                      htmlFor={`show-duplicate-agents-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Show duplicate agents
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`hide-no-trace-link-${tabValue}`}
                      checked={hideNoTraceLink}
                      onCheckedChange={(checked) => setHideNoTraceLink(checked === true)}
                    />
                    <label
                      htmlFor={`hide-no-trace-link-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Hide evals with no trace link
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`hide-blacklisted-${tabValue}`}
                      checked={hideBlacklisted}
                      onCheckedChange={(checked) => setHideBlacklisted(checked === true)}
                    />
                    <label
                      htmlFor={`hide-blacklisted-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Hide blacklisted models
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`hide-base-models-${tabValue}`}
                      checked={hideBaseModels}
                      onCheckedChange={(checked) => setHideBaseModels(checked === true)}
                    />
                    <label
                      htmlFor={`hide-base-models-${tabValue}`}
                      className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      Hide base models
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-3 py-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
                {/* Row Highlighting */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Row Highlighting</p>
                      <p className="text-xs">
                        <span className="inline-block w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/60 border mr-1 align-middle" /> Base models (no base model).{' '}
                        <span className="inline-block w-3 h-3 rounded bg-neutral-200 dark:bg-neutral-800/70 border mr-1 align-middle" /> Blacklisted models.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metrics Explanation */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Standard Error (±)</p>
                      <p className="text-xs">Calculated over 3 runs. Shows variability in model performance.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 ml-6">
                    <div className="w-4 h-4" />
                    <div>
                      <p className="font-medium text-foreground">Improvement (pp)</p>
                      <p className="text-xs">Percentage points gained over base model (e.g., +1.02 pp = 1.02% improvement). Green text indicates positive improvement, red indicates regression.</p>
                    </div>
                  </div>
                </div>

                {/* Sorting Explanation */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Column Sorting</p>
                      <p className="text-xs">For each benchmark, click "Acc" to sort by accuracy or "Imp" to sort by improvement over base model. Gray buttons indicate that sorting mode is inactive.</p>
                    </div>
                  </div>
                </div>

                {/* Traces Legend */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p className="font-medium text-foreground">Trace Links</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs ml-6">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border-2 border-primary bg-primary/10">
                        <ExternalLink className="w-3 h-3 text-primary" />
                      </div>
                      <span>Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-muted-foreground/20 bg-muted/50">
                        <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </div>
                      <span>Unavailable</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded border border-red-500/50 bg-red-500/10">
                        <AlertCircle className="w-3 h-3 text-red-500" />
                      </div>
                      <span>Missing</span>
                    </div>
                  </div>
                </div>

                {/* Timestamp Columns Legend */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Timestamp Columns</p>
                      <p className="text-xs"><strong>First Eval Ended At:</strong> The earliest evaluation completion time across all benchmarks for this model+agent combination.</p>
                      <p className="text-xs mt-1"><strong>Latest Eval Ended At:</strong> The most recent evaluation completion time across all benchmarks for this model+agent combination.</p>
                    </div>
                  </div>
                </div>

                {/* Result Selection */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Result Selection ({selectionMode.charAt(0).toUpperCase() + selectionMode.slice(1)} mode)</p>
                      <p className="text-xs">
                        {SELECTION_MODE_DESCRIPTIONS[selectionMode]}
                        {' '}Results from equivalent benchmarks (canonical + duplicates) are merged into one pool before selection.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Config Metadata Badges */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Config Metadata Badges</p>
                      <p className="text-xs">Each benchmark cell displays configuration badges indicating the evaluation environment settings.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs ml-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25">T:2x</span>
                      <span>Timeout multiplier (e.g. 2x = double the default timeout)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-muted/50 text-muted-foreground/50 border-muted-foreground/20">T:N/A</span>
                      <span>Default timeout (not configured / not found)</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs ml-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25">D:4/8/32</span>
                      <span>Daytona sandbox overrides: CPUs / Memory (GB) / Storage (GB)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] rounded-full px-2 py-0.5 border bg-muted/50 text-muted-foreground/50 border-muted-foreground/20">D:?/?/?</span>
                      <span>Default sandbox config (not configured / not found)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <LeaderboardTableWithImprovement
                data={tabFilteredData}
                modelSearch={modelSearch}
                agentSearch={agentSearch}
                baseModelSearch={baseModelSearch}
                benchmarkSearch={benchmarkSearch}
                filters={{
                  models: selectedModels,
                  agents: selectedAgents,
                  trainingAgents: selectedTrainingAgents,
                  baseModels: selectedBaseModels,
                  benchmarks: selectedBenchmarks,
                  trainingTypes: selectedTrainingTypes,
                  modelSizes: selectedModelSizes,
                }}
                showDuplicateBenchmarks={showDuplicateBenchmarks}
                showDuplicateModels={showDuplicateModels}
                showDuplicateAgents={showDuplicateAgents}
                hideBlacklisted={hideBlacklisted}
                hideBaseModels={hideBaseModels}
                filterMissingEval={tabValue === 'missingEval'}
              />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
