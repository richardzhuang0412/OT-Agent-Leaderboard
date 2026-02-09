import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBenchmarkResultSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all benchmark results
  app.get("/api/benchmark-results", async (req, res) => {
    try {
      const results = await storage.getAllBenchmarkResults();
      res.json(results);
    } catch (error) {
      console.error("Error fetching benchmark results:", error);
      res.status(500).json({ error: "Failed to fetch benchmark results" });
    }
  });

  // Get single benchmark result
  app.get("/api/benchmark-results/:id", async (req, res) => {
    try {
      const result = await storage.getBenchmarkResult(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Benchmark result not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching benchmark result:", error);
      res.status(500).json({ error: "Failed to fetch benchmark result" });
    }
  });

  // Create new benchmark result
  app.post("/api/benchmark-results", async (req, res) => {
    try {
      const validatedData = insertBenchmarkResultSchema.parse(req.body);
      const result = await storage.createBenchmarkResult(validatedData);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating benchmark result:", error);
      res.status(500).json({ error: "Failed to create benchmark result" });
    }
  });

  // Delete benchmark result
  app.delete("/api/benchmark-results/:id", async (req, res) => {
    try {
      await storage.deleteBenchmarkResult(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting benchmark result:", error);
      res.status(500).json({ error: "Failed to delete benchmark result" });
    }
  });

  // Get pivoted leaderboard data (benchmarks as columns)
  app.get("/api/leaderboard-pivoted", async (req, res) => {
    try {
      const results = await storage.getAllBenchmarkResults();

      // Group by (model, agent) combination
      const groupedData = new Map<string, {
        modelName: string;
        agentName: string;
        firstEvalEndedAt?: string;
        latestEvalEndedAt?: string;
        benchmarks: Record<string, { accuracy: number; standardError: number; hfTracesLink?: string }>;
      }>();

      for (const result of results) {
        const key = `${result.modelName}|||${result.agentName}`;

        if (!groupedData.has(key)) {
          groupedData.set(key, {
            modelName: result.modelName,
            agentName: result.agentName,
            firstEvalEndedAt: result.endedAt,
            latestEvalEndedAt: result.endedAt,
            benchmarks: {}
          });
        }

        const group = groupedData.get(key)!;
        // Update firstEvalEndedAt to the earliest timestamp
        if (!group.firstEvalEndedAt || (result.endedAt && result.endedAt < group.firstEvalEndedAt)) {
          group.firstEvalEndedAt = result.endedAt;
        }
        // Update latestEvalEndedAt to the latest timestamp
        if (!group.latestEvalEndedAt || (result.endedAt && result.endedAt > group.latestEvalEndedAt)) {
          group.latestEvalEndedAt = result.endedAt;
        }
        group.benchmarks[result.benchmarkName] = {
          accuracy: result.accuracy,
          standardError: result.standardError,
          hfTracesLink: result.hfTracesLink
        };
      }

      // Convert to array and sort by model name, then agent name
      const pivotedData = Array.from(groupedData.values()).sort((a, b) => {
        const modelCompare = a.modelName.localeCompare(b.modelName);
        if (modelCompare !== 0) return modelCompare;
        return a.agentName.localeCompare(b.agentName);
      });

      res.json(pivotedData);
    } catch (error) {
      console.error("Error fetching pivoted leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch pivoted leaderboard" });
    }
  });

  // Get pivoted leaderboard data with improvement metrics
  app.get("/api/leaderboard-pivoted-with-improvement", async (req, res) => {
    try {
      const results = await storage.getAllBenchmarkResultsWithImprovement();

      // Group by (model, agent) combination
      const groupedData = new Map<string, {
        modelName: string;
        agentName: string;
        modelId: string;
        baseModelName: string;
        firstEvalEndedAt?: string;
        latestEvalEndedAt?: string;
        modelCreatedAt?: string;
        // Duplicate tracking fields
        modelDuplicateOf: string | null;
        canonicalModelName: string;
        canonicalBaseModelName: string;
        benchmarks: Record<string, {
          accuracy: number;
          standardError: number;
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
          sourceBenchmarkName: string;
          sourceBenchmarkId: string;
        }>;
      }>();

      for (const result of results) {
        const key = `${result.modelName}|||${result.agentName}`;

        if (!groupedData.has(key)) {
          groupedData.set(key, {
            modelName: result.modelName,
            agentName: result.agentName,
            modelId: result.modelId,
            baseModelName: result.baseModelName,
            firstEvalEndedAt: result.endedAt,
            latestEvalEndedAt: result.endedAt,
            // Duplicate tracking fields
            modelDuplicateOf: result.modelDuplicateOf,
            canonicalModelName: result.canonicalModelName,
            canonicalBaseModelName: result.canonicalBaseModelName,
            benchmarks: {}
          });
        }

        const group = groupedData.get(key)!;
        // Update firstEvalEndedAt to the earliest timestamp
        if (!group.firstEvalEndedAt || (result.endedAt && result.endedAt < group.firstEvalEndedAt)) {
          group.firstEvalEndedAt = result.endedAt;
        }
        // Update latestEvalEndedAt to the latest timestamp
        if (!group.latestEvalEndedAt || (result.endedAt && result.endedAt > group.latestEvalEndedAt)) {
          group.latestEvalEndedAt = result.endedAt;
        }
        // Calculate improvement as absolute difference (percentage points)
        const improvement = result.baseModelAccuracy !== undefined
          ? result.accuracy - result.baseModelAccuracy
          : undefined;

        group.benchmarks[result.benchmarkName] = {
          accuracy: result.accuracy,
          standardError: result.standardError,
          hfTracesLink: result.hfTracesLink,
          baseModelAccuracy: result.baseModelAccuracy,
          improvement: improvement,
          // Additional accuracy values for duplicate-aware improvement recalculation
          canonicalBenchmarkBaseModelAccuracy: result.canonicalBenchmarkBaseModelAccuracy,
          canonicalBaseModelAccuracy: result.canonicalBaseModelAccuracy,
          canonicalBothBaseModelAccuracy: result.canonicalBothBaseModelAccuracy,
          // Duplicate tracking for benchmarks
          benchmarkDuplicateOf: result.benchmarkDuplicateOf,
          canonicalBenchmarkName: result.canonicalBenchmarkName,
          // Source benchmark (tracks which actual benchmark the result came from)
          sourceBenchmarkName: result.sourceBenchmarkName,
          sourceBenchmarkId: result.sourceBenchmarkId
        };
      }

      // Fetch all registered models and merge those without evaluations
      const allModels = await storage.getAllModels();

      // Build a map of modelId -> creationTime for adding modelCreatedAt to all entries
      const modelCreationTimeMap = new Map<string, string>();
      for (const model of allModels) {
        if (model.creationTime) {
          modelCreationTimeMap.set(model.modelId, model.creationTime);
        }
      }

      // Add modelCreatedAt to existing entries
      groupedData.forEach((group) => {
        const creationTime = modelCreationTimeMap.get(group.modelId);
        if (creationTime) {
          group.modelCreatedAt = new Date(creationTime).toISOString().split('T')[0] + ' ' + new Date(creationTime).toTimeString().split(' ')[0];
        }
      });

      // Add models without evaluations
      for (const model of allModels) {
        const key = `${model.modelName}|||${model.agentName}`;
        if (!groupedData.has(key)) {
          groupedData.set(key, {
            modelName: model.modelName,
            agentName: model.agentName,
            modelId: model.modelId,
            baseModelName: model.baseModelName,
            firstEvalEndedAt: undefined,
            latestEvalEndedAt: undefined,
            modelCreatedAt: model.creationTime
              ? new Date(model.creationTime).toISOString().split('T')[0] + ' ' + new Date(model.creationTime).toTimeString().split(' ')[0]
              : undefined,
            modelDuplicateOf: model.modelDuplicateOf,
            canonicalModelName: model.canonicalModelName,
            canonicalBaseModelName: model.canonicalBaseModelName,
            benchmarks: {}
          });
        }
      }

      // Convert to array and sort by model name, then agent name
      const pivotedData = Array.from(groupedData.values()).sort((a, b) => {
        const modelCompare = a.modelName.localeCompare(b.modelName);
        if (modelCompare !== 0) return modelCompare;
        return a.agentName.localeCompare(b.agentName);
      });

      res.json(pivotedData);
    } catch (error) {
      console.error("Error fetching pivoted leaderboard with improvement:", error);
      res.status(500).json({ error: "Failed to fetch pivoted leaderboard with improvement" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
