import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Info, ExternalLink, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import LeaderboardTableWithImprovement, { type PivotedLeaderboardRowWithImprovement } from '@/components/LeaderboardTableWithImprovement';
import SearchBarWithBaseModel from '@/components/SearchBarWithBaseModel';
import FilterControlsWithBaseModel from '@/components/FilterControlsWithBaseModel';
import ViewModeControls from '@/components/ViewModeControls';
import ThemeToggle from '@/components/ThemeToggle';
import { DEFAULT_VISIBLE_BENCHMARKS } from '@/config/benchmarkConfig';

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState<'filtered' | 'all'>('filtered');
  const [topN, setTopN] = useState<number>(50);
  const [recentN, setRecentN] = useState<number>(50);
  const [modelSearch, setModelSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [baseModelSearch, setBaseModelSearch] = useState('');
  const [benchmarkSearch, setBenchmarkSearch] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedBaseModels, setSelectedBaseModels] = useState<string[]>([]);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([]);

  // Always fetch improvement metrics data
  const { data: pivotedData = [], isLoading, refetch } = useQuery<PivotedLeaderboardRowWithImprovement[]>({
    queryKey: ['/api/leaderboard-pivoted-with-improvement'],
  });

  const handleRefresh = () => {
    refetch();
  };

  const availableModels = useMemo(() => {
    return Array.from(new Set(pivotedData.map((item) => item.modelName))).sort();
  }, [pivotedData]);

  const availableAgents = useMemo(() => {
    return Array.from(new Set(pivotedData.map((item) => item.agentName))).sort();
  }, [pivotedData]);

  const availableBaseModels = useMemo(() => {
    return Array.from(new Set(
      pivotedData.map((item) => item.baseModelName)
    )).sort();
  }, [pivotedData]);

  const availableBenchmarks = useMemo(() => {
    const benchmarkSet = new Set<string>();
    pivotedData.forEach(row => {
      Object.keys(row.benchmarks).forEach(benchmark => benchmarkSet.add(benchmark));
    });
    return Array.from(benchmarkSet).sort();
  }, [pivotedData]);

  // Filter by view mode: Top N + Recent N
  const filteredByViewMode = useMemo(() => {
    if (activeTab === 'all') {
      return pivotedData; // No filtering
    }

    // Filter: only rows with dev_set_71_tasks benchmark
    const dataWithDevSet = pivotedData.filter(row =>
      row.benchmarks['dev_set_71_tasks'] !== undefined
    );

    // Filter: only rows with valid latestEvalEndedAt timestamp
    const dataWithTimestamp = pivotedData.filter(row =>
      row.latestEvalEndedAt && row.latestEvalEndedAt !== '—'
    );

    // Top N by dev_set_71_tasks accuracy (descending)
    const topPerformers = [...dataWithDevSet]
      .sort((a, b) => {
        const accuracyA = a.benchmarks['dev_set_71_tasks']?.accuracy ?? -Infinity;
        const accuracyB = b.benchmarks['dev_set_71_tasks']?.accuracy ?? -Infinity;
        return accuracyB - accuracyA;
      })
      .slice(0, topN === Number.MAX_SAFE_INTEGER ? undefined : topN);

    // Recent N by latestEvalEndedAt timestamp (descending)
    const mostRecent = [...dataWithTimestamp]
      .sort((a, b) => {
        const dateA = new Date(a.latestEvalEndedAt!).getTime();
        const dateB = new Date(b.latestEvalEndedAt!).getTime();
        return dateB - dateA;
      })
      .slice(0, recentN === Number.MAX_SAFE_INTEGER ? undefined : recentN);

    // Union: Remove duplicates using Map
    const uniqueMap = new Map<string, PivotedLeaderboardRowWithImprovement>();
    topPerformers.forEach(row => {
      uniqueMap.set(`${row.modelName}|||${row.agentName}`, row);
    });
    mostRecent.forEach(row => {
      uniqueMap.set(`${row.modelName}|||${row.agentName}`, row);
    });

    return Array.from(uniqueMap.values());
  }, [pivotedData, activeTab, topN, recentN]);

  // Initialize selectedBenchmarks with defaults when data first loads
  useEffect(() => {
    if (pivotedData.length > 0 && selectedBenchmarks.length === 0) {
      // Filter defaults to only include benchmarks that exist in the data
      const validDefaults = DEFAULT_VISIBLE_BENCHMARKS.filter(benchmark =>
        availableBenchmarks.includes(benchmark)
      );
      if (validDefaults.length > 0) {
        setSelectedBenchmarks(validDefaults);
      }
    }
  }, [pivotedData, availableBenchmarks, selectedBenchmarks.length]);

  const handleClearFilters = () => {
    setSelectedModels([]);
    setSelectedAgents([]);
    setSelectedBaseModels([]);
    // Reset benchmarks to defaults instead of clearing
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
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
                LLM Agent Benchmark
              </h1>
              <Badge variant="secondary" data-testid="text-total-entries">
                {pivotedData.length} rows
              </Badge>
            </div>
            <div className="flex items-center gap-2">
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

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'filtered' | 'all')}>
          <TabsList>
            <TabsTrigger value="filtered">Filtered View</TabsTrigger>
            <TabsTrigger value="all">All Models</TabsTrigger>
          </TabsList>

          <TabsContent value="filtered" className="space-y-6">
            <ViewModeControls
              topN={topN}
              recentN={recentN}
              onTopNChange={setTopN}
              onRecentNChange={setRecentN}
              currentCount={filteredByViewMode.length}
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
          <FilterControlsWithBaseModel
            availableModels={availableModels}
            availableAgents={availableAgents}
            availableBaseModels={availableBaseModels}
            availableBenchmarks={availableBenchmarks}
            selectedModels={selectedModels}
            selectedAgents={selectedAgents}
            selectedBaseModels={selectedBaseModels}
            selectedBenchmarks={selectedBenchmarks}
            onModelsChange={setSelectedModels}
            onAgentsChange={setSelectedAgents}
            onBaseModelsChange={setSelectedBaseModels}
            onBenchmarksChange={setSelectedBenchmarks}
            onClearAll={handleClearFilters}
          />

          <div className="space-y-4 px-3 py-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
            {/* Row Highlighting */}
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Base Model Highlighting</p>
                  <p className="text-xs">Rows with a blue background indicate base models (models with no base model). These are the foundation models that other models are fine-tuned from.</p>
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
                baseModels: selectedBaseModels,
                benchmarks: selectedBenchmarks,
              }}
            />
          </TabsContent>

          <TabsContent value="all" className="space-y-6">
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
            <FilterControlsWithBaseModel
              availableModels={availableModels}
              availableAgents={availableAgents}
              availableBaseModels={availableBaseModels}
              availableBenchmarks={availableBenchmarks}
              selectedModels={selectedModels}
              selectedAgents={selectedAgents}
              selectedBaseModels={selectedBaseModels}
              selectedBenchmarks={selectedBenchmarks}
              onModelsChange={setSelectedModels}
              onAgentsChange={setSelectedAgents}
              onBaseModelsChange={setSelectedBaseModels}
              onBenchmarksChange={setSelectedBenchmarks}
              onClearAll={handleClearFilters}
            />

            <div className="space-y-4 px-3 py-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
              {/* Row Highlighting */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Base Model Highlighting</p>
                    <p className="text-xs">Rows with a blue background indicate base models (models with no base model). These are the foundation models that other models are fine-tuned from.</p>
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
            </div>

            {/* Table */}
            <LeaderboardTableWithImprovement
              data={pivotedData}
              modelSearch={modelSearch}
              agentSearch={agentSearch}
              baseModelSearch={baseModelSearch}
              benchmarkSearch={benchmarkSearch}
              filters={{
                models: selectedModels,
                agents: selectedAgents,
                baseModels: selectedBaseModels,
                benchmarks: selectedBenchmarks,
              }}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
