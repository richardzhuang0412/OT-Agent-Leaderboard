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
  availableBaseModels: string[];
  availableBenchmarks: string[];
  selectedModels: string[];
  selectedAgents: string[];
  selectedBaseModels: string[];
  selectedBenchmarks: string[];
  onModelsChange: (models: string[]) => void;
  onAgentsChange: (agents: string[]) => void;
  onBaseModelsChange: (baseModels: string[]) => void;
  onBenchmarksChange: (benchmarks: string[]) => void;
  onClearAll: () => void;
}

export default function FilterControlsWithBaseModel({
  availableModels,
  availableAgents,
  availableBaseModels,
  availableBenchmarks,
  selectedModels,
  selectedAgents,
  selectedBaseModels,
  selectedBenchmarks,
  onModelsChange,
  onAgentsChange,
  onBaseModelsChange,
  onBenchmarksChange,
  onClearAll,
}: FilterControlsWithBaseModelProps) {
  const [modelFilterSearch, setModelFilterSearch] = useState('');
  const [agentFilterSearch, setAgentFilterSearch] = useState('');
  const [baseModelFilterSearch, setBaseModelFilterSearch] = useState('');
  const [benchmarkFilterSearch, setBenchmarkFilterSearch] = useState('');

  const filteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(modelFilterSearch.toLowerCase())
  );
  const filteredAgents = availableAgents.filter((a) =>
    a.toLowerCase().includes(agentFilterSearch.toLowerCase())
  );
  const filteredBaseModels = availableBaseModels.filter((bm) =>
    bm.toLowerCase().includes(baseModelFilterSearch.toLowerCase())
  );
  const filteredBenchmarks = availableBenchmarks.filter((b) =>
    b.toLowerCase().includes(benchmarkFilterSearch.toLowerCase())
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

  const totalFilters = selectedModels.length + selectedAgents.length + selectedBaseModels.length + selectedBenchmarks.length;

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
          <PopoverContent className="w-64" align="start">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Filter by Model</h4>
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
              {selectedAgents.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                  {selectedAgents.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Filter by Agent</h4>
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
                {filteredAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No matches found</p>
                ) : (
                  filteredAgents.map((agent) => (
                    <div key={agent} className="flex items-center gap-2">
                      <Checkbox
                        id={`agent-${agent}`}
                        checked={selectedAgents.includes(agent)}
                        onCheckedChange={() => toggleAgent(agent)}
                        data-testid={`checkbox-agent-${agent}`}
                      />
                      <Label
                        htmlFor={`agent-${agent}`}
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
          <PopoverContent className="w-64" align="start">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Filter by Base Model</h4>
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
          <PopoverContent className="w-64" align="start">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Show Benchmark Columns</h4>
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

        {totalFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            data-testid="button-clear-filters"
          >
            Clear All
          </Button>
        )}
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
            <Badge key={agent} variant="secondary" className="gap-1" data-testid={`badge-filter-${agent}`}>
              {agent}
              <button
                onClick={() => toggleAgent(agent)}
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
