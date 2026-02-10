import { useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface FilterControlsWithBaseModelProps {
  availableModels: string[];
  availableAgents: string[];
  availableEvalAgents: string[];
  availableTrainingAgents: string[];
  availableBaseModels: string[];
  availableBenchmarks: string[];
  selectedModels: string[];
  selectedAgents: string[];
  selectedTrainingAgents: string[];
  selectedBaseModels: string[];
  selectedBenchmarks: string[];
  onModelsChange: (models: string[]) => void;
  onAgentsChange: (agents: string[]) => void;
  onTrainingAgentsChange: (agents: string[]) => void;
  onBaseModelsChange: (baseModels: string[]) => void;
  onBenchmarksChange: (benchmarks: string[]) => void;
  onClearAll: () => void;
  onReset: () => void;
}

export default function FilterControlsWithBaseModel({
  availableModels,
  availableAgents,
  availableEvalAgents,
  availableTrainingAgents,
  availableBaseModels,
  availableBenchmarks,
  selectedModels,
  selectedAgents,
  selectedTrainingAgents,
  selectedBaseModels,
  selectedBenchmarks,
  onModelsChange,
  onAgentsChange,
  onTrainingAgentsChange,
  onBaseModelsChange,
  onBenchmarksChange,
  onClearAll,
  onReset,
}: FilterControlsWithBaseModelProps) {
  const [modelFilterSearch, setModelFilterSearch] = useState('');
  const [agentFilterSearch, setAgentFilterSearch] = useState('');
  const [baseModelFilterSearch, setBaseModelFilterSearch] = useState('');
  const [benchmarkFilterSearch, setBenchmarkFilterSearch] = useState('');

  const filteredModels = availableModels.filter((m) =>
    m && m.toLowerCase().includes(modelFilterSearch.toLowerCase())
  );
  const filteredEvalAgents = availableEvalAgents.filter((a) =>
    a && a.toLowerCase().includes(agentFilterSearch.toLowerCase())
  );
  const filteredTrainingAgents = availableTrainingAgents.filter((a) =>
    a && a.toLowerCase().includes(agentFilterSearch.toLowerCase())
  );
  const filteredBaseModels = availableBaseModels.filter((bm) =>
    bm && bm.toLowerCase().includes(baseModelFilterSearch.toLowerCase())
  );
  const filteredBenchmarks = availableBenchmarks.filter((b) =>
    b && b.toLowerCase().includes(benchmarkFilterSearch.toLowerCase())
  );

  const toggleModel = (model: string) => {
    if (selectedModels.includes(model)) {
      onModelsChange(selectedModels.filter((m) => m !== model));
    } else {
      onModelsChange([...selectedModels, model]);
    }
  };

  const toggleAgent = (agent: string) => {
    if (selectedAgents.includes(agent)) {
      onAgentsChange(selectedAgents.filter((a) => a !== agent));
    } else {
      onAgentsChange([...selectedAgents, agent]);
    }
  };

  const toggleTrainingAgent = (agent: string) => {
    if (selectedTrainingAgents.includes(agent)) {
      onTrainingAgentsChange(selectedTrainingAgents.filter((a) => a !== agent));
    } else {
      onTrainingAgentsChange([...selectedTrainingAgents, agent]);
    }
  };

  const toggleBaseModel = (baseModel: string) => {
    if (selectedBaseModels.includes(baseModel)) {
      onBaseModelsChange(selectedBaseModels.filter((bm) => bm !== baseModel));
    } else {
      onBaseModelsChange([...selectedBaseModels, baseModel]);
    }
  };

  const toggleBenchmark = (benchmark: string) => {
    if (selectedBenchmarks.includes(benchmark)) {
      onBenchmarksChange(selectedBenchmarks.filter((b) => b !== benchmark));
    } else {
      onBenchmarksChange([...selectedBenchmarks, benchmark]);
    }
  };

  const totalFilters = selectedModels.length + selectedAgents.length + selectedTrainingAgents.length + selectedBaseModels.length + selectedBenchmarks.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Popover onOpenChange={(open) => { if (!open) setModelFilterSearch(''); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-filter-models">
              <Filter className="w-4 h-4 mr-2" />
              Models
              {selectedModels.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {selectedModels.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start" avoidCollisions={false}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filter by Model</h4>
                <button
                  onClick={() => onModelsChange([])}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Clear
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search models..."
                  value={modelFilterSearch}
                  onChange={(e) => setModelFilterSearch(e.target.value)}
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {modelFilterSearch && (
                  <button
                    onClick={() => setModelFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No matches found</p>
                ) : (
                  filteredModels.map((model) => (
                    <div key={model} className="flex items-center gap-2">
                      <Checkbox
                        id={`model-${model}`}
                        checked={selectedModels.includes(model)}
                        onCheckedChange={() => toggleModel(model)}
                        data-testid={`checkbox-model-${model}`}
                      />
                      <Label
                        htmlFor={`model-${model}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {model}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(open) => { if (!open) setAgentFilterSearch(''); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-filter-agents">
              <Filter className="w-4 h-4 mr-2" />
              Agents
              {(selectedAgents.length + selectedTrainingAgents.length) > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {selectedAgents.length + selectedTrainingAgents.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start" avoidCollisions={false}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filter by Agent</h4>
                <button
                  onClick={() => { onAgentsChange([]); onTrainingAgentsChange([]); }}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Clear
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={agentFilterSearch}
                  onChange={(e) => setAgentFilterSearch(e.target.value)}
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {agentFilterSearch && (
                  <button
                    onClick={() => setAgentFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Eval Agents</p>
                {filteredEvalAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1 text-center">No matches found</p>
                ) : (
                  filteredEvalAgents.map((agent) => (
                    <div key={`eval-${agent}`} className="flex items-center gap-2">
                      <Checkbox
                        id={`eval-agent-${agent}`}
                        checked={selectedAgents.includes(agent)}
                        onCheckedChange={() => toggleAgent(agent)}
                        data-testid={`checkbox-agent-${agent}`}
                      />
                      <Label
                        htmlFor={`eval-agent-${agent}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {agent}
                      </Label>
                    </div>
                  ))
                )}
                <div className="border-t border-border my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Training Agents</p>
                {filteredTrainingAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-1 text-center">No matches found</p>
                ) : (
                  filteredTrainingAgents.map((agent) => (
                    <div key={`training-${agent}`} className="flex items-center gap-2">
                      <Checkbox
                        id={`training-agent-${agent}`}
                        checked={selectedTrainingAgents.includes(agent)}
                        onCheckedChange={() => toggleTrainingAgent(agent)}
                        data-testid={`checkbox-training-agent-${agent}`}
                      />
                      <Label
                        htmlFor={`training-agent-${agent}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {agent}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(open) => { if (!open) setBaseModelFilterSearch(''); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-filter-basemodels">
              <Filter className="w-4 h-4 mr-2" />
              Base Models
              {selectedBaseModels.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {selectedBaseModels.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start" avoidCollisions={false}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filter by Base Model</h4>
                <button
                  onClick={() => onBaseModelsChange([])}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Clear
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search base models..."
                  value={baseModelFilterSearch}
                  onChange={(e) => setBaseModelFilterSearch(e.target.value)}
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {baseModelFilterSearch && (
                  <button
                    onClick={() => setBaseModelFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredBaseModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No matches found</p>
                ) : (
                  filteredBaseModels.map((baseModel) => (
                    <div key={baseModel} className="flex items-center gap-2">
                      <Checkbox
                        id={`basemodel-${baseModel}`}
                        checked={selectedBaseModels.includes(baseModel)}
                        onCheckedChange={() => toggleBaseModel(baseModel)}
                        data-testid={`checkbox-basemodel-${baseModel}`}
                      />
                      <Label
                        htmlFor={`basemodel-${baseModel}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {baseModel}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={(open) => { if (!open) setBenchmarkFilterSearch(''); }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-filter-benchmarks">
              <Filter className="w-4 h-4 mr-2" />
              Benchmark Columns
              {selectedBenchmarks.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {selectedBenchmarks.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start" avoidCollisions={false}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Show Benchmark Columns</h4>
                <button
                  onClick={() => onBenchmarksChange([])}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Clear
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search benchmarks..."
                  value={benchmarkFilterSearch}
                  onChange={(e) => setBenchmarkFilterSearch(e.target.value)}
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {benchmarkFilterSearch && (
                  <button
                    onClick={() => setBenchmarkFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredBenchmarks.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No matches found</p>
                ) : (
                  filteredBenchmarks.map((benchmark) => (
                    <div key={benchmark} className="flex items-center gap-2">
                      <Checkbox
                        id={`benchmark-${benchmark}`}
                        checked={selectedBenchmarks.includes(benchmark)}
                        onCheckedChange={() => toggleBenchmark(benchmark)}
                        data-testid={`checkbox-benchmark-${benchmark}`}
                      />
                      <Label
                        htmlFor={`benchmark-${benchmark}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {benchmark}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
          data-testid="button-reset-filters"
        >
          Reset to Defaults
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
          data-testid="button-clear-filters"
        >
          Clear All Filters
        </Button>
      </div>

      {totalFilters > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedModels.map((model) => (
            <Badge key={model} variant="secondary" className="gap-1" data-testid={`badge-filter-${model}`}>
              {model}
              <button
                onClick={() => toggleModel(model)}
                className="hover-elevate active-elevate-2 rounded-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedAgents.map((agent) => (
            <Badge key={`eval-${agent}`} variant="secondary" className="gap-1" data-testid={`badge-filter-${agent}`}>
              {agent}
              <button
                onClick={() => toggleAgent(agent)}
                className="hover-elevate active-elevate-2 rounded-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedTrainingAgents.map((agent) => (
            <Badge key={`training-${agent}`} variant="secondary" className="gap-1" data-testid={`badge-filter-training-${agent}`}>
              {agent} (training)
              <button
                onClick={() => toggleTrainingAgent(agent)}
                className="hover-elevate active-elevate-2 rounded-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedBaseModels.map((baseModel) => (
            <Badge key={baseModel} variant="secondary" className="gap-1" data-testid={`badge-filter-${baseModel}`}>
              {baseModel}
              <button
                onClick={() => toggleBaseModel(baseModel)}
                className="hover-elevate active-elevate-2 rounded-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {selectedBenchmarks.map((benchmark) => (
            <Badge key={benchmark} variant="secondary" className="gap-1" data-testid={`badge-filter-${benchmark}`}>
              {benchmark}
              <button
                onClick={() => toggleBenchmark(benchmark)}
                className="hover-elevate active-elevate-2 rounded-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
