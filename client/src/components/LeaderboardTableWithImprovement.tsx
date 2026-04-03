import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, AlertCircle, AlertTriangle, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BLACKLISTED_MODELS } from '@/config/blacklistedModels';
import { DEFAULT_VISIBLE_BENCHMARKS } from '@/config/benchmarkConfig';

// Hide scrollbar while keeping scroll functionality
const scrollbarHidingStyles = `
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
`;

export interface PivotedLeaderboardRowWithImprovement {
  modelName: string;
  agentName: string;
  trainingAgentName: string;
  isNoEval: boolean;
  firstEvalEndedAt?: string;
  latestEvalEndedAt?: string;
  modelCreatedAt?: string;
  modelId: string;
  baseModelName: string;
  // Training type
  trainingType?: string;
  // Model size in billions
  modelSizeB?: number;
  // Duplicate tracking fields
  modelDuplicateOf: string | null;
  canonicalModelName: string;
  canonicalBaseModelName: string;
  benchmarks: Record<string, {
    accuracy: number | null;
    standardError: number | null;
    hfTracesLink?: string;
    baseModelAccuracy?: number;
    improvement?: number;
    // Additional accuracy values for duplicate-aware improvement recalculation
    canonicalBenchmarkBaseModelAccuracy?: number;
    canonicalBaseModelAccuracy?: number;
    canonicalBothBaseModelAccuracy?: number;
    // Duplicate tracking for benchmarks
    benchmarkDuplicateOf: string | null;
    canonicalBenchmarkName: string;
    // Source benchmark (tracks which actual benchmark the result came from)
    sourceBenchmarkName?: string;
    sourceBenchmarkId?: string;
    // Eval config metadata
    timeoutMultiplier?: number;
    daytonaOverrideCpus?: number;
    daytonaOverrideMemoryMb?: number;
    daytonaOverrideStorageMb?: number;
    autoSnapshot?: boolean;
    // Job status for progress tracking
    jobStatus?: string | null;
    username?: string | null;
    jobCreatedAt?: string;
  }>;
}

interface LeaderboardTableWithImprovementProps {
  data: PivotedLeaderboardRowWithImprovement[];
  modelSearch: string;
  agentSearch: string;
  baseModelSearch: string;
  benchmarkSearch: string;
  filters: {
    models: string[];
    agents: string[];
    trainingAgents: string[];
    baseModels: string[];
    benchmarks: string[];
    trainingTypes: string[];
    modelSizes: string[];
  };
  // Duplicate display controls
  showDuplicateBenchmarks: boolean;
  showDuplicateModels: boolean;
  // When true, only show models missing a finished eval on at least one default benchmark
  filterMissingEval?: boolean;
  // When true, hide blacklisted models
  hideBlacklisted?: boolean;
  // When true, hide base models (baseModelName === 'None')
  hideBaseModels?: boolean;
}

type SortField = 'modelName' | 'agentName' | 'baseModelName' | 'trainingType' | 'modelCreatedAt' | 'firstEvalEndedAt' | 'latestEvalEndedAt' | string; // string for dynamic benchmark names
type SortDirection = 'asc' | 'desc' | null;
type SortMode = 'accuracy' | 'improvement';

function formatModelSize(sizeB: number): string {
  return `${Math.floor(sizeB)}B`;
}

function modelSizeColor(sizeB: number): string {
  const s = Math.floor(sizeB);
  switch (s) {
    case 8: return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
    case 32: return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
    case 4: return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    case 14: return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
    case 7: return 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300';
    case 72: return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    case 30: return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300';
    case 2: return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

export default function LeaderboardTableWithImprovement({
  data,
  modelSearch,
  agentSearch,
  baseModelSearch,
  benchmarkSearch,
  filters,
  showDuplicateBenchmarks,
  showDuplicateModels,
  filterMissingEval,
  hideBlacklisted,
  hideBaseModels
}: LeaderboardTableWithImprovementProps) {
  const [sortField, setSortField] = useState<SortField>('modelCreatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [sortModePerBenchmark, setSortModePerBenchmark] = useState<Record<string, SortMode>>({});
  const tableScrollContainerRef = useRef<HTMLDivElement>(null);
  const topScrollBarRef = useRef<HTMLDivElement>(null);

  // Sync top scrollbar width with table content width
  useEffect(() => {
    const syncScrollWidth = () => {
      if (tableScrollContainerRef.current && topScrollBarRef.current) {
        const topInner = topScrollBarRef.current.children[0] as HTMLElement;
        if (topInner) {
          topInner.style.width = tableScrollContainerRef.current.scrollWidth + 'px';
        }
      }
    };

    // Use a small delay to ensure DOM is updated
    const timer = setTimeout(syncScrollWidth, 100);

    // Also sync when window resizes
    window.addEventListener('resize', syncScrollWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', syncScrollWidth);
    };
  }, [data.length]);

  // Build a map of duplicate benchmark -> canonical benchmark from the data
  const benchmarkDuplicateMap = useMemo(() => {
    const map = new Map<string, string>(); // duplicateName -> canonicalName
    data.forEach(row => {
      Object.entries(row.benchmarks).forEach(([benchmarkName, benchmarkData]) => {
        if (benchmarkData.benchmarkDuplicateOf && benchmarkData.canonicalBenchmarkName) {
          map.set(benchmarkName, benchmarkData.canonicalBenchmarkName);
        }
      });
    });
    return map;
  }, [data]);

  // Helper function to recalculate improvement based on display settings
  const recalculateImprovement = (
    benchmarkData: {
      accuracy: number | null;
      baseModelAccuracy?: number;
      canonicalBenchmarkBaseModelAccuracy?: number;
      canonicalBaseModelAccuracy?: number;
      canonicalBothBaseModelAccuracy?: number;
    },
    useCanonicalBaseModel: boolean,
    useCanonicalBenchmark: boolean
  ): { baseModelAccuracy?: number; improvement?: number } => {
    // No improvement calculation for Pending/Started jobs (null accuracy)
    if (benchmarkData.accuracy === null) {
      return { baseModelAccuracy: undefined, improvement: undefined };
    }

    // Determine which base model accuracy to use based on display settings
    let newBaseModelAccuracy: number | undefined;

    if (useCanonicalBaseModel && useCanonicalBenchmark) {
      // Both duplicates hidden: use canonical base model on canonical benchmark
      newBaseModelAccuracy = benchmarkData.canonicalBothBaseModelAccuracy ?? benchmarkData.baseModelAccuracy;
    } else if (useCanonicalBaseModel) {
      // Only duplicate models hidden: use canonical base model on same benchmark
      newBaseModelAccuracy = benchmarkData.canonicalBaseModelAccuracy ?? benchmarkData.baseModelAccuracy;
    } else if (useCanonicalBenchmark) {
      // Only duplicate benchmarks hidden: use original base model on canonical benchmark
      newBaseModelAccuracy = benchmarkData.canonicalBenchmarkBaseModelAccuracy ?? benchmarkData.baseModelAccuracy;
    } else {
      // Both shown: use original values
      newBaseModelAccuracy = benchmarkData.baseModelAccuracy;
    }

    const newImprovement = newBaseModelAccuracy !== undefined
      ? benchmarkData.accuracy - newBaseModelAccuracy
      : undefined;

    return { baseModelAccuracy: newBaseModelAccuracy, improvement: newImprovement };
  };

  // Process data to handle duplicate models and recalculate improvements
  const processedData = useMemo(() => {
    let processed = data;

    // Determine flags for improvement recalculation
    const useCanonicalBaseModel = !showDuplicateModels;
    const useCanonicalBenchmark = !showDuplicateBenchmarks;

    // If not showing duplicate models, merge duplicate rows into canonical rows then filter
    if (!showDuplicateModels) {
      // Step 1: Separate canonical and duplicate rows
      const canonicalRows = new Map<string, typeof processed[0]>();
      const duplicateRows: typeof processed = [];

      for (const row of processed) {
        if (row.modelDuplicateOf === null) {
          const key = `${row.modelName}|||${row.agentName}`;
          canonicalRows.set(key, { ...row, benchmarks: { ...row.benchmarks } });
        } else {
          duplicateRows.push(row);
        }
      }

      // Step 2: Merge duplicate rows into canonical rows
      for (const dupRow of duplicateRows) {
        const canonicalKey = `${dupRow.canonicalModelName}|||${dupRow.agentName}`;
        let canonicalRow = canonicalRows.get(canonicalKey);

        // Step 3: Create orphan row if canonical doesn't exist
        if (!canonicalRow) {
          canonicalRow = {
            ...dupRow,
            modelName: dupRow.canonicalModelName,
            baseModelName: dupRow.canonicalBaseModelName,
            modelDuplicateOf: null,
            benchmarks: {}
          };
          canonicalRows.set(canonicalKey, canonicalRow);
        }

        // Merge benchmarks: fill gaps, and prefer Finished over Pending/Started
        for (const [benchmarkName, benchmarkData] of Object.entries(dupRow.benchmarks)) {
          const existing = canonicalRow.benchmarks[benchmarkName];
          if (!existing) {
            canonicalRow.benchmarks[benchmarkName] = { ...benchmarkData };
          } else if (existing.accuracy === null && benchmarkData.accuracy !== null) {
            // Canonical has Pending/Started, duplicate has Finished — prefer Finished
            canonicalRow.benchmarks[benchmarkName] = { ...benchmarkData };
          }
        }

        // Merge timestamps
        if (dupRow.firstEvalEndedAt && (!canonicalRow.firstEvalEndedAt || dupRow.firstEvalEndedAt < canonicalRow.firstEvalEndedAt)) {
          canonicalRow.firstEvalEndedAt = dupRow.firstEvalEndedAt;
        }
        if (dupRow.latestEvalEndedAt && (!canonicalRow.latestEvalEndedAt || dupRow.latestEvalEndedAt > canonicalRow.latestEvalEndedAt)) {
          canonicalRow.latestEvalEndedAt = dupRow.latestEvalEndedAt;
        }
      }

      // Step 4: Convert back, substitute base model names, recalculate improvements
      processed = Array.from(canonicalRows.values()).map(row => ({
        ...row,
        baseModelName: row.canonicalBaseModelName,
        benchmarks: Object.fromEntries(
          Object.entries(row.benchmarks).map(([benchmarkName, benchmarkData]) => {
            const { baseModelAccuracy, improvement } = recalculateImprovement(
              benchmarkData, useCanonicalBaseModel, useCanonicalBenchmark
            );
            return [benchmarkName, { ...benchmarkData, baseModelAccuracy, improvement }];
          })
        )
      }));

      // Step 5: Remove NO EVAL rows for models that have real eval rows
      // (duplicate models may produce orphan NO EVAL rows under the canonical name)
      const modelsWithRealEvals = new Set<string>();
      for (const row of processed) {
        if (!row.isNoEval) modelsWithRealEvals.add(row.modelName);
      }
      processed = processed.filter(row => !(row.isNoEval && modelsWithRealEvals.has(row.modelName)));
    }

    // If not showing duplicate benchmarks, merge duplicate benchmark results into canonical columns
    if (!showDuplicateBenchmarks) {
      processed = processed.map(row => {
        const newBenchmarks = { ...row.benchmarks };

        // For each duplicate benchmark, check if we should merge into canonical
        benchmarkDuplicateMap.forEach((canonicalName, duplicateName) => {
          const duplicateData = newBenchmarks[duplicateName];
          const canonicalData = newBenchmarks[canonicalName];

          // Copy duplicate data if canonical is missing or canonical is Pending/Started and duplicate is Finished
          if (duplicateData && (!canonicalData || (canonicalData.accuracy === null && duplicateData.accuracy !== null))) {
            // Recalculate improvement for merged data (comparing to canonical benchmark)
            const { baseModelAccuracy, improvement } = recalculateImprovement(
              duplicateData,
              useCanonicalBaseModel,
              true // Always use canonical benchmark since we're merging into canonical column
            );

            newBenchmarks[canonicalName] = {
              ...duplicateData,
              // Update the canonical name reference
              canonicalBenchmarkName: canonicalName,
              benchmarkDuplicateOf: null,
              // Update base model accuracy and improvement
              baseModelAccuracy,
              improvement
            };
          }
        });

        return {
          ...row,
          benchmarks: newBenchmarks
        };
      });
    }

    return processed;
  }, [data, showDuplicateModels, showDuplicateBenchmarks, benchmarkDuplicateMap]);

  // Get all unique benchmark names from the processed data
  const allBenchmarks = useMemo(() => {
    const benchmarkSet = new Set<string>();
    processedData.forEach(row => {
      Object.keys(row.benchmarks).forEach(benchmark => benchmarkSet.add(benchmark));
    });
    return Array.from(benchmarkSet).sort();
  }, [processedData]);

  // Filter which benchmark columns to show based on search, filters, and duplicate settings
  const visibleBenchmarks = useMemo(() => {
    let visible = allBenchmarks;

    // If not showing duplicate benchmarks, filter them out (show only canonical benchmarks)
    if (!showDuplicateBenchmarks) {
      visible = visible.filter(benchmark => !benchmarkDuplicateMap.has(benchmark));
    }

    // Filter by benchmark search
    if (benchmarkSearch) {
      const query = benchmarkSearch.toLowerCase();
      visible = visible.filter(benchmark => benchmark.toLowerCase().includes(query));
    }

    // Filter by benchmark filters (if any selected, show only those)
    if (filters.benchmarks.length > 0) {
      visible = visible.filter(benchmark => filters.benchmarks.includes(benchmark));
    }

    return visible;
  }, [allBenchmarks, benchmarkSearch, filters.benchmarks, showDuplicateBenchmarks, benchmarkDuplicateMap]);

  // Filter and sort the processed data (after duplicate handling)
  const filteredAndSortedData = useMemo(() => {
    let filtered = processedData;

    // Missing eval filter: only show models missing a finished eval on at least one default benchmark
    // Applied after duplicate merging so it sees the same data as the All Models view
    if (filterMissingEval) {
      const modelsWithAllBenchmarks = new Set<string>();
      const modelBenchmarkCoverage = new Map<string, Set<string>>();
      for (const row of filtered) {
        if (row.isNoEval) continue;
        let covered = modelBenchmarkCoverage.get(row.modelName);
        if (!covered) {
          covered = new Set<string>();
          modelBenchmarkCoverage.set(row.modelName, covered);
        }
        for (const bm of DEFAULT_VISIBLE_BENCHMARKS) {
          const b = row.benchmarks[bm];
          if (b && b.accuracy !== null) covered.add(bm);
        }
      }
      modelBenchmarkCoverage.forEach((covered, modelName) => {
        if (DEFAULT_VISIBLE_BENCHMARKS.every(bm => covered.has(bm))) {
          modelsWithAllBenchmarks.add(modelName);
        }
      });
      filtered = filtered.filter(row => !modelsWithAllBenchmarks.has(row.modelName));
    }

    // Hide blacklisted models
    if (hideBlacklisted) {
      filtered = filtered.filter(row => !BLACKLISTED_MODELS.has(row.modelName));
    }

    // Hide base models
    if (hideBaseModels) {
      filtered = filtered.filter(row => row.baseModelName !== 'None');
    }

    // Filter by model search
    if (modelSearch) {
      const query = modelSearch.toLowerCase();
      filtered = filtered.filter(row => row.modelName?.toLowerCase().includes(query));
    }

    // Filter by agent search (matches both eval agent and training agent)
    if (agentSearch) {
      const query = agentSearch.toLowerCase();
      filtered = filtered.filter(row =>
        row.agentName?.toLowerCase().includes(query) ||
        row.trainingAgentName?.toLowerCase().includes(query)
      );
    }

    // Filter by base model search
    if (baseModelSearch) {
      const query = baseModelSearch.toLowerCase();
      filtered = filtered.filter(row => row.baseModelName?.toLowerCase().includes(query));
    }

    // Filter by model filters
    if (filters.models.length > 0) {
      filtered = filtered.filter(row => filters.models.includes(row.modelName));
    }

    // Filter by agent filters
    if (filters.agents.length > 0) {
      filtered = filtered.filter(row => filters.agents.includes(row.agentName));
    }

    // Filter by training agent filters (check both trainingAgentName and agentName)
    if (filters.trainingAgents.length > 0) {
      filtered = filtered.filter(row =>
        filters.trainingAgents.includes(row.trainingAgentName) ||
        filters.trainingAgents.includes(row.agentName)
      );
    }

    // Filter by base model filters
    if (filters.baseModels.length > 0) {
      filtered = filtered.filter(row => filters.baseModels.includes(row.baseModelName));
    }

    // Filter by training type filters
    if (filters.trainingTypes.length > 0) {
      filtered = filtered.filter(row => filters.trainingTypes.includes(row.trainingType || 'None'));
    }

    // Filter by model size filters
    if (filters.modelSizes.length > 0) {
      filtered = filtered.filter(row => {
        const sizeLabel = row.modelSizeB != null ? `${Math.floor(row.modelSizeB)}B` : 'Unknown';
        return filters.modelSizes.includes(sizeLabel);
      });
    }

    // Sort the data
    if (sortDirection && sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: string | number | Date | undefined;
        let bVal: string | number | Date | undefined;

        if (sortField === 'modelName') {
          aVal = a.modelName;
          bVal = b.modelName;
        } else if (sortField === 'agentName') {
          aVal = a.agentName;
          bVal = b.agentName;
        } else if (sortField === 'baseModelName') {
          aVal = a.baseModelName;
          bVal = b.baseModelName;
        } else if (sortField === 'trainingType') {
          aVal = a.trainingType || '';
          bVal = b.trainingType || '';
        } else if (sortField === 'modelCreatedAt') {
          const ad = a.modelCreatedAt ? new Date(a.modelCreatedAt) : undefined;
          const bd = b.modelCreatedAt ? new Date(b.modelCreatedAt) : undefined;
          aVal = ad && !isNaN(ad.getTime()) ? ad : undefined;
          bVal = bd && !isNaN(bd.getTime()) ? bd : undefined;
        } else if (sortField === 'firstEvalEndedAt') {
          const ad = a.firstEvalEndedAt ? new Date(a.firstEvalEndedAt) : undefined;
          const bd = b.firstEvalEndedAt ? new Date(b.firstEvalEndedAt) : undefined;
          aVal = ad && !isNaN(ad.getTime()) ? ad : undefined;
          bVal = bd && !isNaN(bd.getTime()) ? bd : undefined;
        } else if (sortField === 'latestEvalEndedAt') {
          const ad = a.latestEvalEndedAt ? new Date(a.latestEvalEndedAt) : undefined;
          const bd = b.latestEvalEndedAt ? new Date(b.latestEvalEndedAt) : undefined;
          aVal = ad && !isNaN(ad.getTime()) ? ad : undefined;
          bVal = bd && !isNaN(bd.getTime()) ? bd : undefined;
        } else {
          // Sorting by a benchmark column
          const sortMode = sortModePerBenchmark[sortField] || 'accuracy';
          if (sortMode === 'improvement') {
            // Sort by improvement
            aVal = a.benchmarks[sortField]?.improvement;
            bVal = b.benchmarks[sortField]?.improvement;
          } else {
            // Sort by accuracy — null accuracy (Pending/Started) treated as undefined to sort to bottom
            aVal = a.benchmarks[sortField]?.accuracy ?? undefined;
            bVal = b.benchmarks[sortField]?.accuracy ?? undefined;
          }
        }

        // Handle undefined/null values (missing benchmark data, Pending/Started, or timestamp)
        if (aVal === undefined && bVal === undefined) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        if (aVal instanceof Date && bVal instanceof Date) {
          return sortDirection === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
        }

        return 0;
      });
    }

    return filtered;
  }, [processedData, modelSearch, agentSearch, baseModelSearch, filters, sortField, sortDirection, sortModePerBenchmark, filterMissingEval, hideBlacklisted, hideBaseModels]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField('modelName');
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSortMode = (benchmark: string) => {
    setSortModePerBenchmark(prev => ({
      ...prev,
      [benchmark]: prev[benchmark] === 'improvement' ? 'accuracy' : 'improvement'
    }));
  };

  const handleTableScroll = () => {
    if (tableScrollContainerRef.current && topScrollBarRef.current) {
      topScrollBarRef.current.scrollLeft = tableScrollContainerRef.current.scrollLeft;
      // Ensure the top scrollbar's inner div has the same scroll width as the table
      const topInner = topScrollBarRef.current.children[0] as HTMLElement;
      if (topInner && tableScrollContainerRef.current.scrollWidth) {
        topInner.style.width = tableScrollContainerRef.current.scrollWidth + 'px';
      }
    }
  };

  const handleTopScrollBarScroll = () => {
    if (tableScrollContainerRef.current && topScrollBarRef.current) {
      tableScrollContainerRef.current.scrollLeft = topScrollBarRef.current.scrollLeft;
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="w-4 h-4 text-primary" />;
    }
    if (sortDirection === 'desc') {
      return <ChevronDown className="w-4 h-4 text-primary" />;
    }
    return <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />;
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportMenu]);

  const handleExport = (column: string) => {
    let values: string[];
    if (column === 'modelName' || column === 'agentName' || column === 'baseModelName' || column === 'trainingType') {
      values = filteredAndSortedData.map(row => row[column] || '');
    } else {
      // Benchmark column — export accuracy per row
      values = filteredAndSortedData.map(row => {
        const acc = row.benchmarks[column]?.accuracy;
        return acc != null ? `${acc.toFixed(1)}%` : '—';
      });
    }
    const blob = new Blob([values.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${column}_export.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return 'text-chart-2';
    if (accuracy >= 70) return 'text-chart-3';
    return 'text-foreground';
  };

  const getImprovementColor = (improvement: number | undefined) => {
    if (improvement === undefined) return 'text-muted-foreground';
    if (improvement >= 5) return 'text-green-600 dark:text-green-400';
    if (improvement >= 0) return 'text-green-500 dark:text-green-300';
    if (improvement >= -5) return 'text-orange-500 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formatBenchmarkCell = (
    benchmarkData?: {
      accuracy: number | null;
      standardError: number | null;
      hfTracesLink?: string;
      baseModelAccuracy?: number;
      improvement?: number;
      timeoutMultiplier?: number;
      daytonaOverrideCpus?: number;
      daytonaOverrideMemoryMb?: number;
      daytonaOverrideStorageMb?: number;
      autoSnapshot?: boolean;
      jobStatus?: string | null;
      username?: string | null;
      jobCreatedAt?: string;
    },
    benchmarkName?: string
  ) => {
    if (!benchmarkData) {
      return <span className="text-muted-foreground text-sm">—</span>;
    }

    // Pending/Started jobs: show status badge instead of accuracy
    const jobStatus = benchmarkData.jobStatus;
    if (jobStatus === 'Pending' || jobStatus === 'Started') {
      const isPending = jobStatus === 'Pending';
      const badgeClass = isPending
        ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
        : 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      const label = isPending ? 'Pending' : 'Running';
      const tooltipParts: string[] = [];
      if (benchmarkData.username) tooltipParts.push(`User: ${benchmarkData.username}`);

      // Check if job is stale (>24h old)
      let isStale = false;
      let elapsedText = '';
      if (benchmarkData.jobCreatedAt) {
        const createdMs = new Date(benchmarkData.jobCreatedAt).getTime();
        if (!isNaN(createdMs)) {
          const elapsedMs = Date.now() - createdMs;
          const elapsedHours = elapsedMs / (1000 * 60 * 60);
          isStale = elapsedHours >= 24;
          if (isStale) {
            const days = Math.floor(elapsedHours / 24);
            const hours = Math.floor(elapsedHours % 24);
            elapsedText = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
            tooltipParts.push(`Submitted ${elapsedText} ago — may be stuck`);
          }
        }
      }

      return (
        <div className="flex items-center gap-2 justify-end">
          {/* Status badge */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {isStale && (
                <span title={`Submitted ${elapsedText} ago`}>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                title={tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined}
              >
                {label}
              </span>
            </div>
            {benchmarkData.username && (
              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[100px]">
                {benchmarkData.username}
              </span>
            )}
            {isStale && (
              <span className="font-mono text-[10px] text-red-500">
                {elapsedText} ago
              </span>
            )}
          </div>
        </div>
      );
    }

    // Finished jobs (or legacy rows without jobStatus): show accuracy as before

    // Special handling for dev_set_71_tasks: show red warning flag for missing links
    const isDevSet71Tasks = benchmarkName === 'dev_set_71_tasks';

    return (
      <div className="flex items-center gap-2 justify-end">
        {benchmarkData.hfTracesLink ? (
          <a
            href={benchmarkData.hfTracesLink}
            target="_blank"
            rel="noopener noreferrer"
            title="View traces"
            className="inline-flex items-center justify-center w-5 h-5 rounded border-2 border-primary bg-primary/10 hover:bg-primary/20 hover:border-primary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-primary" />
          </a>
        ) : isDevSet71Tasks ? (
          <div
            title="Traces link missing for dev_set_71_tasks"
            className="inline-flex items-center justify-center w-5 h-5 rounded border border-red-500/50 bg-red-500/10 cursor-not-allowed"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          </div>
        ) : (
          <div
            title="Traces link not available"
            className="inline-flex items-center justify-center w-5 h-5 rounded border border-muted-foreground/20 bg-muted/50 cursor-not-allowed"
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40" />
          </div>
        )}
        {/* Config metadata badges — stacked vertically in the middle */}
        <div className="flex flex-col gap-1 items-start w-[5.5rem]">
          <span className={`font-mono text-[10px] rounded-full px-2 py-0.5 border ${
            benchmarkData.timeoutMultiplier != null
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25'
              : 'bg-muted/50 text-muted-foreground/50 border-muted-foreground/20'
          }`}>
            T:{benchmarkData.timeoutMultiplier != null ? `${benchmarkData.timeoutMultiplier}x` : 'N/A'}
          </span>
          <span className={`font-mono text-[10px] rounded-full px-2 py-0.5 border whitespace-nowrap ${
            benchmarkData.autoSnapshot
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              : (benchmarkData.daytonaOverrideCpus != null || benchmarkData.daytonaOverrideMemoryMb != null || benchmarkData.daytonaOverrideStorageMb != null)
                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25'
                : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25'
          }`}>
            {benchmarkData.autoSnapshot
              ? 'D: Snapshot'
              : (benchmarkData.daytonaOverrideCpus != null || benchmarkData.daytonaOverrideMemoryMb != null || benchmarkData.daytonaOverrideStorageMb != null)
                ? `D: ${benchmarkData.daytonaOverrideCpus ?? 'x'}/${benchmarkData.daytonaOverrideMemoryMb != null ? (benchmarkData.daytonaOverrideMemoryMb / 1024).toFixed(0) : 'x'}/${benchmarkData.daytonaOverrideStorageMb != null ? (benchmarkData.daytonaOverrideStorageMb / 1024).toFixed(0) : 'x'}`
                : 'D: Default'}
          </span>
        </div>
        {/* Numbers column — right-aligned */}
        <div className="flex flex-col items-end gap-1">
          {benchmarkData.accuracy != null ? (
            <span className={`font-mono font-semibold text-sm ${getAccuracyColor(benchmarkData.accuracy)}`}>
              {benchmarkData.accuracy.toFixed(1)}%
            </span>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">--</span>
          )}
          {benchmarkData.standardError != null ? (
            <span className="font-mono text-xs text-muted-foreground">
              ±{benchmarkData.standardError.toFixed(2)}
            </span>
          ) : null}
          {benchmarkData.improvement !== undefined && (
            <span className={`font-mono text-xs font-medium ${getImprovementColor(benchmarkData.improvement)}`}>
              {benchmarkData.improvement >= 0 ? '+' : ''}{benchmarkData.improvement.toFixed(2)} pp
            </span>
          )}
        </div>
      </div>
    );
  };

  const totalColumns = 8 + visibleBenchmarks.length; // # + model + agent + base model + trainingType + modelCreatedAt + firstEvalEndedAt + latestEvalEndedAt + benchmark columns

  return (
    <>
      <style>{scrollbarHidingStyles}</style>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">
          {filteredAndSortedData.length} result{filteredAndSortedData.length !== 1 ? 's' : ''}
        </span>
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            title="Export column to TXT"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md py-1 max-h-72 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fields</div>
              {(['modelName', 'agentName', 'baseModelName', 'trainingType'] as const).map(field => (
                <button
                  key={field}
                  onClick={() => handleExport(field)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  {{ modelName: 'Model Name', agentName: 'Agent Name', baseModelName: 'Base Model', trainingType: 'Training Type' }[field]}
                </button>
              ))}
              {visibleBenchmarks.length > 0 && (
                <>
                  <div className="border-t border-border my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Benchmarks</div>
                  {visibleBenchmarks.map(benchmark => (
                    <button
                      key={benchmark}
                      onClick={() => handleExport(benchmark)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors truncate"
                      title={benchmark}
                    >
                      {benchmark}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <div
          ref={topScrollBarRef}
          onScroll={handleTopScrollBarScroll}
          style={{
            height: '16px',
            backgroundColor: 'hsl(var(--muted))',
            borderBottom: '1px solid hsl(var(--border))',
            overflowX: 'auto',
            overflowY: 'hidden'
          }}
        >
          <div style={{ height: '1px', minWidth: '100%' }} />
        </div>
        <div
          className="overflow-x-auto"
          ref={tableScrollContainerRef}
          onScroll={handleTableScroll}
        >
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-20 bg-muted/50 w-12 px-2 py-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">#</th>
                <th className="text-left px-6 py-4 min-w-[200px] sticky left-12 z-20 bg-muted/50">
                  <button
                    onClick={() => handleSort('modelName')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-model"
                  >
                    Model Name
                    <SortIcon field="modelName" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 min-w-[200px]">
                  <button
                    onClick={() => handleSort('agentName')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-agent"
                  >
                    Agent Name
                    <SortIcon field="agentName" />
                  </button>
                </th>
                {visibleBenchmarks.map(benchmark => (
                  <th key={benchmark} className="text-right px-6 py-4 min-w-[220px]">
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => handleSort(benchmark)}
                        className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                        data-testid={`button-sort-${benchmark}`}
                      >
                        {benchmark}
                        <SortIcon field={benchmark} />
                      </button>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <button
                          onClick={() => toggleSortMode(benchmark)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            (sortModePerBenchmark[benchmark] || 'accuracy') === 'accuracy'
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                          }`}
                          title="Sort by accuracy"
                        >
                          Acc
                        </button>
                        <button
                          onClick={() => toggleSortMode(benchmark)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            (sortModePerBenchmark[benchmark] || 'accuracy') === 'improvement'
                              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                          }`}
                          title="Sort by improvement"
                        >
                          Imp
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
                <th className="text-left px-6 py-4 min-w-[200px]">
                  <button
                    onClick={() => handleSort('baseModelName')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-basemodel"
                  >
                    Base Model
                    <SortIcon field="baseModelName" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 min-w-[120px]">
                  <button
                    onClick={() => handleSort('trainingType')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-trainingType"
                  >
                    Training Type
                    <SortIcon field="trainingType" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 min-w-[180px]">
                  <button
                    onClick={() => handleSort('modelCreatedAt')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-modelCreatedAt"
                  >
                    Model Added At (PT)
                    <SortIcon field="modelCreatedAt" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 min-w-[180px]">
                  <button
                    onClick={() => handleSort('firstEvalEndedAt')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-firstEvalEndedAt"
                  >
                    First Eval At (PT)
                    <SortIcon field="firstEvalEndedAt" />
                  </button>
                </th>
                <th className="text-left px-6 py-4 min-w-[180px]">
                  <button
                    onClick={() => handleSort('latestEvalEndedAt')}
                    className="flex items-center gap-2 font-medium text-sm uppercase tracking-wide hover-elevate active-elevate-2 -mx-2 px-2 py-1 rounded-md"
                    data-testid="button-sort-latestEvalEndedAt"
                  >
                    Latest Eval At (PT)
                    <SortIcon field="latestEvalEndedAt" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={totalColumns} className="px-6 py-12 text-center text-muted-foreground">
                    No results found
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((row, index) => {
                  const isBaseModel = row.baseModelName === 'None';
                  const isBlacklisted = BLACKLISTED_MODELS.has(row.modelName);
                  const rowBgClass = isBaseModel
                    ? 'bg-blue-100 dark:bg-blue-900/60'
                    : isBlacklisted
                      ? 'bg-neutral-200 dark:bg-neutral-800/70'
                      : index % 2 === 0 ? 'bg-background' : 'bg-muted/20';
                  const stickyCellBgClass = isBaseModel
                    ? 'bg-blue-100 dark:bg-blue-900/60'
                    : isBlacklisted
                      ? 'bg-neutral-200 dark:bg-neutral-800/70'
                      : 'bg-background';

                  return (
                    <tr
                      key={`${row.modelName}-${row.agentName}`}
                      className={`border-b border-border hover-elevate ${rowBgClass}`}
                      data-testid={`row-result-${row.modelName}-${row.agentName}`}
                    >
                      <td className={`sticky left-0 z-20 ${stickyCellBgClass} w-12 px-2 py-4 text-center text-xs text-muted-foreground font-mono`}>{index + 1}</td>
                      <td className={`px-6 py-4 sticky left-12 z-20 ${stickyCellBgClass}`}>
                        <span className="font-semibold text-foreground">{row.modelName}</span>
                        {row.modelSizeB != null && (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-mono font-medium ${modelSizeColor(row.modelSizeB)}`}>
                            {formatModelSize(row.modelSizeB)}
                          </span>
                        )}
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                          row.trainingType === 'SFT'
                            ? 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200'
                            : row.trainingType === 'RL'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                              : 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
                        }`}>
                          {row.trainingType || 'Base'}
                        </span>
                      </td>
                    <td className="px-6 py-4">
                      {row.isNoEval ? (
                        <span className="text-red-500 font-semibold">NO EVAL</span>
                      ) : (
                        <span className="text-muted-foreground">{row.agentName}</span>
                      )}
                    </td>
                      {visibleBenchmarks.map(benchmark => (
                        <td key={benchmark} className="px-6 py-4 text-right">
                          {formatBenchmarkCell(row.benchmarks[benchmark], benchmark)}
                        </td>
                      ))}
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground">{row.baseModelName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground">{row.trainingType || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground font-mono text-sm">
                        {row.modelCreatedAt || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground font-mono text-sm">
                        {row.firstEvalEndedAt || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground font-mono text-sm">
                        {row.latestEvalEndedAt || '—'}
                      </span>
                    </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
