import { Trophy, Clock, CalendarPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ViewModeControlsProps {
  topN: number;
  recentlyAddedN: number;
  recentlyEvaledN: number;
  onTopNChange: (value: number) => void;
  onRecentlyAddedNChange: (value: number) => void;
  onRecentlyEvaledNChange: (value: number) => void;
  currentCount: number;
  availableBenchmarks: string[];
  topPerformerBenchmark: string;
  onTopPerformerBenchmarkChange: (value: string) => void;
}

const DISPLAY_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: 'all', label: 'All' },
] as const;

export default function ViewModeControls({
  topN,
  recentlyAddedN,
  recentlyEvaledN,
  onTopNChange,
  onRecentlyAddedNChange,
  onRecentlyEvaledNChange,
  currentCount,
  availableBenchmarks,
  topPerformerBenchmark,
  onTopPerformerBenchmarkChange,
}: ViewModeControlsProps) {
  const handleTopNChange = (value: string) => {
    const numValue = value === 'all' ? Number.MAX_SAFE_INTEGER : parseInt(value, 10);
    onTopNChange(numValue);
  };

  const handleRecentlyAddedNChange = (value: string) => {
    const numValue = value === 'all' ? Number.MAX_SAFE_INTEGER : parseInt(value, 10);
    onRecentlyAddedNChange(numValue);
  };

  const handleRecentlyEvaledNChange = (value: string) => {
    const numValue = value === 'all' ? Number.MAX_SAFE_INTEGER : parseInt(value, 10);
    onRecentlyEvaledNChange(numValue);
  };

  const getCurrentValueString = (num: number): string => {
    if (num === Number.MAX_SAFE_INTEGER) return 'all';
    return num.toString();
  };

  return (
    <div className="bg-muted/30 rounded-md px-3 py-3">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Top N Performers Dropdown */}
          <div className="flex items-center gap-3">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <label htmlFor="top-n-select" className="text-sm font-medium text-foreground">
              Top
            </label>
            <Select
              value={getCurrentValueString(topN)}
              onValueChange={handleTopNChange}
            >
              <SelectTrigger id="top-n-select" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm font-medium text-foreground">Performers by</span>
            <Select
              value={topPerformerBenchmark}
              onValueChange={onTopPerformerBenchmarkChange}
            >
              <SelectTrigger id="benchmark-select" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableBenchmarks.map((benchmark) => (
                  <SelectItem key={benchmark} value={benchmark}>
                    {benchmark}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* N Most Recently Added Dropdown */}
          <div className="flex items-center gap-3">
            <CalendarPlus className="w-4 h-4 text-muted-foreground" />
            <label htmlFor="recently-added-n-select" className="text-sm font-medium text-foreground">
              N Most Recently Added:
            </label>
            <Select
              value={getCurrentValueString(recentlyAddedN)}
              onValueChange={handleRecentlyAddedNChange}
            >
              <SelectTrigger id="recently-added-n-select" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* N Most Recently Eval'd Dropdown */}
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <label htmlFor="recently-evaled-n-select" className="text-sm font-medium text-foreground">
              N Most Recently Eval'd:
            </label>
            <Select
              value={getCurrentValueString(recentlyEvaledN)}
              onValueChange={handleRecentlyEvaledNChange}
            >
              <SelectTrigger id="recently-evaled-n-select" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Current Count Badge */}
        <Badge variant="secondary" className="text-xs">
          Showing {currentCount} models
        </Badge>
      </div>
    </div>
  );
}
