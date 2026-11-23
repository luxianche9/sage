import type {
  TestOperationSnapshot, TestPlan, TestResult, TestRunEvent, TestStep
} from "@sage/contracts/testing";

/** `notSelected`: a 功能组 the run was not asked to run (a skip with reason `notSelected`). */
type StepRunState = "waiting" | "running" | "Pass" | "Fail" | "Error" | "skipped" | "notSelected" | "Aborted";
interface StepProjection { state: StepRunState; durationMs?: number; startedAt?: string; completedAt?: string }

interface TraceIteration {
  index: number;
  count?: number;
  state: StepRunState;
  verdict?: string;
  children: ExecutionTraceNode[];
}

export interface ExecutionTraceNode extends StepProjection {
  executionId: string;
  stepId: string;
  step: TestStep;
  region: "prepare" | "test" | "cleanup";
  parentExecutionId?: string;
  branch?: "children" | "elseChildren";
  branchIndex?: number;
  iterationIndex?: number;
  iterationCount?: number;
  attemptIndex?: number;
  attemptCount?: number;
  selectedBranch?: "children" | "elseChildren";
  children: ExecutionTraceNode[];
  iterations: TraceIteration[];
  attempts: TraceIteration[];
  results: TestResult[];
  relatedAssertions: TestResult[];
  operations: TestOperationSnapshot[];
  pending: boolean;
}

export interface ExecutionTrace {
  regions: Record<"prepare" | "test" | "cleanup", ExecutionTraceNode[]>;
  byExecutionId: Map<string, ExecutionTraceNode>;
  unmatchedResults: TestResult[];
  unmatchedOperations: TestOperationSnapshot[];
}

type Region = ExecutionTraceNode["region"];
const regionNames = ["prepare", "test", "cleanup"] as const;

const emptyCollections = () => ({
  children: [], iterations: [], attempts: [], results: [], relatedAssertions: [], operations: []
});

export function buildExecutionTrace(
  plan: TestPlan,
  events: TestRunEvent[],
  results: TestResult[],
  operations: TestOperationSnapshot[]
): ExecutionTrace {
  const orderedEvents = [...events].sort((left, right) => left.sequence - right.sequence);
  const stepIndex = indexPlanSteps(plan);
  const byExecutionId = new Map<string, ExecutionTraceNode>();
  for (const event of orderedEvents) {
    if (!event.type.startsWith("step.")) continue;
    if (typeof event.executionId !== "string" || typeof event.stepId !== "string") continue;
    const step = stepIndex.get(event.stepId);
    if (!step) continue;
    const node = byExecutionId.get(event.executionId) ?? createNode(step, event);
    applyStepEvent(node, event);
    byExecutionId.set(event.executionId, node);
  }

  for (const event of orderedEvents) {
    if (typeof event.executionId !== "string") continue;
    const node = byExecutionId.get(event.executionId);
    if (!node) continue;
    const selected = event.selectedBranch;
    if (event.type === "control.branch.selected" && (selected === "children" || selected === "elseChildren")) {
      node.selectedBranch = selected;
    }
    if (event.type === "loop.iteration.started" || event.type === "loop.iteration.completed") {
      applyScopeEvent(node, event, "iteration");
    }
    if (event.type === "retry.attempt.started" || event.type === "retry.attempt.completed") {
      applyScopeEvent(node, event, "attempt");
    }
  }

  const regions: ExecutionTrace["regions"] = { prepare: [], test: [], cleanup: [] };
  const startSequence = startSequences(orderedEvents);
  const orderedNodes = [...byExecutionId.values()]
    .sort((left, right) => executionOrder(left, right, startSequence));
  for (const node of orderedNodes) {
    const parent = node.parentExecutionId ? byExecutionId.get(node.parentExecutionId) : undefined;
    if (parent) parent.children.push(node);
    else regions[node.region].push(node);
  }
  for (const node of orderedNodes) {
    node.children.sort(childOrder);
    node.iterations = mergeScopeChildren(node.iterations, node.children, "iterationIndex");
    node.attempts = mergeScopeChildren(node.attempts, node.children, "attemptIndex");
    appendPendingContainerChildren(node);
  }
  appendPendingRegionSteps(plan, regions);

  const unmatchedResults = attachResults(results, byExecutionId);
  attachRelatedAssertions(results, byExecutionId);
  const unmatchedOperations = attachOperations(operations, byExecutionId);
  return { regions, byExecutionId, unmatchedResults, unmatchedOperations };
}

function createNode(step: TestStep, event: TestRunEvent): ExecutionTraceNode {
  const region = event.region === "prepare" || event.region === "cleanup" ? event.region : "test";
  return {
    executionId: event.executionId!, stepId: event.stepId!, step, region,
    state: "waiting", ...emptyCollections(), pending: false,
    ...(typeof event.parentExecutionId === "string" ? { parentExecutionId: event.parentExecutionId } : {}),
    ...(event.branch === "children" || event.branch === "elseChildren" ? { branch: event.branch } : {}),
    ...(typeof event.branchIndex === "number" ? { branchIndex: event.branchIndex } : {}),
    ...(typeof event.iterationIndex === "number" ? { iterationIndex: event.iterationIndex } : {}),
    ...(typeof event.iterationCount === "number" ? { iterationCount: event.iterationCount } : {}),
    ...(typeof event.attemptIndex === "number" ? { attemptIndex: event.attemptIndex } : {}),
    ...(typeof event.attemptCount === "number" ? { attemptCount: event.attemptCount } : {})
  };
}

function applyStepEvent(node: ExecutionTraceNode, event: TestRunEvent): void {
  if (event.type === "step.started") { node.state = "running"; node.startedAt = event.at; }
  if (event.type === "step.skipped") { node.state = skipState(event); node.completedAt = event.at; }
  if (event.type === "step.completed") Object.assign(node, projectionFromCompletion(event));
}

function skipState(event: TestRunEvent): StepRunState {
  return event.reason === "notSelected" ? "notSelected" : "skipped";
}

function projectionFromCompletion(event: TestRunEvent): StepProjection {
  return {
    state: scopeState(String(event.verdict ?? "Pass")),
    ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
    completedAt: event.at
  };
}

function applyScopeEvent(node: ExecutionTraceNode, event: TestRunEvent, kind: "iteration" | "attempt"): void {
  const index = kind === "iteration" ? event.iterationIndex : event.attemptIndex;
  const count = kind === "iteration" ? event.iterationCount : event.attemptCount;
  if (typeof index !== "number") return;
  const target = kind === "iteration" ? node.iterations : node.attempts;
  const scope = target.find((item) => item.index === index) ?? { index, state: "waiting" as const, children: [] };
  if (!target.includes(scope)) target.push(scope);
  if (typeof count === "number") scope.count = count;
  scope.state = event.type.endsWith(".started") ? "running" : scopeState(String(event.verdict ?? "Pass"));
  if (event.type.endsWith(".completed")) scope.verdict = String(event.verdict ?? "Pass");
  target.sort((left, right) => left.index - right.index);
}

function mergeScopeChildren(
  scopes: TraceIteration[],
  children: ExecutionTraceNode[],
  key: "iterationIndex" | "attemptIndex"
): TraceIteration[] {
  const output = [...scopes];
  for (const child of children) {
    const index = child[key];
    if (typeof index !== "number") continue;
    const scope = output.find((item) => item.index === index) ?? { index, state: child.state, children: [] };
    if (!output.includes(scope)) output.push(scope);
    if (!scope.children.includes(child)) scope.children.push(child);
    const escalates = child.state === "running" || child.state === "Error" || child.state === "Fail";
    if (scope.state === "waiting" || escalates) scope.state = child.state;
  }
  return output.sort((left, right) => left.index - right.index);
}

function appendPendingRegionSteps(plan: TestPlan, regions: ExecutionTrace["regions"]): void {
  for (const region of regionNames) {
    const represented = new Set(regions[region].map((node) => node.stepId));
    for (const step of plan.regions[region]) {
      if (!represented.has(step.id)) regions[region].push(pendingNode(step, region));
    }
  }
}

function appendPendingContainerChildren(node: ExecutionTraceNode): void {
  if (!["Sequence", "Group", "Feature", "Parallel", "If"].includes(node.step.type)) return;
  const represented = new Set(node.children.map((child) => child.stepId));
  const expected = node.step.type === "If" && node.selectedBranch
    ? node.step[node.selectedBranch] ?? []
    : node.step.children ?? [];
  for (const step of expected) {
    if (represented.has(step.id)) continue;
    const pending = pendingNode(step, node.region, node.executionId);
    if (node.step.type === "If" && node.selectedBranch) pending.branch = node.selectedBranch;
    node.children.push(pending);
  }
}

function pendingNode(step: TestStep, region: Region, parentExecutionId?: string): ExecutionTraceNode {
  const executionId = `pending:${parentExecutionId ?? region}:${step.id}`;
  const node: ExecutionTraceNode = {
    executionId, stepId: step.id, step, region, state: "waiting", ...emptyCollections(), pending: true,
    ...(parentExecutionId ? { parentExecutionId } : {})
  };
  node.children = (step.children ?? []).map((child) => pendingNode(child, region, executionId));
  return node;
}

/** The only node for a step, when the step ran exactly once (safe fallback attribution). */
function soleNode(byStep: Map<string, ExecutionTraceNode[]>, stepId: unknown): ExecutionTraceNode | undefined {
  if (typeof stepId !== "string" || !stepId) return undefined;
  const nodes = byStep.get(stepId);
  return nodes?.length === 1 ? nodes[0] : undefined;
}

function attachResults(results: TestResult[], byExecutionId: Map<string, ExecutionTraceNode>): TestResult[] {
  const byStep = nodesByStep(byExecutionId);
  const unmatched: TestResult[] = [];
  for (const result of results) {
    const direct = typeof result.executionId === "string" ? byExecutionId.get(result.executionId) : undefined;
    const target = direct ?? soleNode(byStep, result.sourceStepId);
    if (target) target.results.push(result); else unmatched.push(result);
  }
  return unmatched;
}

function attachOperations(
  operations: TestOperationSnapshot[],
  byExecutionId: Map<string, ExecutionTraceNode>
): TestOperationSnapshot[] {
  const byStep = nodesByStep(byExecutionId);
  const unmatched: TestOperationSnapshot[] = [];
  for (const operation of operations) {
    const direct = operation.executionId ? byExecutionId.get(operation.executionId) : undefined;
    const target = direct ?? soleNode(byStep, operation.stepId);
    if (target) target.operations.push(operation); else unmatched.push(operation);
  }
  return unmatched;
}

function attachRelatedAssertions(results: TestResult[], byExecutionId: Map<string, ExecutionTraceNode>): void {
  const byStep = nodesByStep(byExecutionId);
  for (const result of results) {
    if (result.kind !== "assertion") continue;
    const directId = result.sourceMeasurementExecutionId;
    const direct = typeof directId === "string" ? byExecutionId.get(directId) : undefined;
    const target = direct ?? soleNode(byStep, result.sourceMeasurementStepId);
    if (target) target.relatedAssertions.push(result);
  }
}

function nodesByStep(byExecutionId: Map<string, ExecutionTraceNode>): Map<string, ExecutionTraceNode[]> {
  const output = new Map<string, ExecutionTraceNode[]>();
  for (const node of byExecutionId.values()) output.set(node.stepId, [...(output.get(node.stepId) ?? []), node]);
  return output;
}

function indexPlanSteps(plan: TestPlan): Map<string, TestStep> {
  const output = new Map<string, TestStep>();
  visitPlanSteps(plan, (step) => output.set(step.id, step));
  return output;
}

function visitPlanSteps(plan: Pick<TestPlan, "regions">, visitor: (step: TestStep, depth: number) => void): void {
  const visit = (steps: TestStep[], depth: number) => {
    for (const step of steps) {
      visitor(step, depth);
      visit(step.children ?? [], depth + 1);
      visit(step.elseChildren ?? [], depth + 1);
    }
  };
  visit(plan.regions.prepare, 0); visit(plan.regions.test, 0); visit(plan.regions.cleanup, 0);
}

/** executionId → sequence of its first `step.started` event. */
function startSequences(events: TestRunEvent[]): Map<string, number> {
  const output = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "step.started" || typeof event.executionId !== "string") continue;
    if (!output.has(event.executionId)) output.set(event.executionId, event.sequence);
  }
  return output;
}

function executionOrder(left: ExecutionTraceNode, right: ExecutionTraceNode, starts: Map<string, number>): number {
  const sequence = (node: ExecutionTraceNode) => starts.get(node.executionId) ?? Number.MAX_SAFE_INTEGER;
  return sequence(left) - sequence(right);
}

function childOrder(left: ExecutionTraceNode, right: ExecutionTraceNode): number {
  const position = (node: ExecutionTraceNode) => node.branchIndex ?? node.iterationIndex ?? node.attemptIndex ?? 0;
  return position(left) - position(right);
}

function scopeState(verdict: string): StepRunState {
  return verdict === "Fail" || verdict === "Error" || verdict === "Aborted" ? verdict : "Pass";
}
