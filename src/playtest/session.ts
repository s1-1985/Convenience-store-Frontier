export const PLAYTEST_ISSUE_IDS = [
  "queue",
  "empty_shelf",
  "closed_demand",
  "work_backlog",
  "waste",
] as const;

export type PlaytestIssueId = (typeof PLAYTEST_ISSUE_IDS)[number];

export const PLAYTEST_POLICY_DIMENSIONS = [
  "opening_hours",
  "ordering_policy",
  "delivery_policy",
  "staffing",
  "task_priorities",
  "category_area",
] as const;

export type PlaytestPolicyDimension = (typeof PLAYTEST_POLICY_DIMENSIONS)[number];

export const PLAYTEST_CONTROL_IDS = [
  "play_toggle",
  "advance_slot",
  "advance_day",
  "advance_week",
  "run_to_end",
  "reset",
  "report_interaction",
] as const;

export type PlaytestControlId = (typeof PLAYTEST_CONTROL_IDS)[number];

export type PlaytestFinishReason = "completed" | "reset" | "reloaded" | "manual";

export interface PlaytestPolicySnapshot {
  openingHour: number;
  closingHour: number;
  orderingPolicy: string;
  deliveryPolicy: string;
  staffing: Record<string, number>;
  taskPriorities: string[];
  categoryArea: Record<string, number>;
}

export interface PlaytestPolicyDecision {
  sequence: number;
  day: number;
  timeLabel: string;
  elapsedMs: number;
  changedDimensions: PlaytestPolicyDimension[];
  policy: PlaytestPolicySnapshot;
}

export interface PlaytestVisualDetection {
  issueId: PlaytestIssueId;
  day: number;
  timeLabel: string;
  elapsedMs: number;
  beforeReportInteraction: boolean;
}

export interface PlaytestAutoStop {
  day: number;
  timeLabel: string;
  elapsedMs: number;
  reason: string;
}

export interface PlaytestCampaignCheckpoint {
  id: string;
  title: string;
  day: number;
  firstSeenElapsedMs: number;
  acknowledgedElapsedMs: number | null;
}

export interface PlaytestFinalEvaluation {
  grade: string;
  title: string;
  score: number;
}

export interface PlaytestSession {
  schemaVersion: 1;
  sessionId: string;
  seed: number;
  scenarioName: string;
  startedAt: string;
  startedAtEpochMs: number;
  updatedAt: string;
  elapsedMs: number;
  runningSinceEpochMs: number | null;
  completedDay: number;
  finished: boolean;
  finishReason: PlaytestFinishReason | null;
  finishedAt: string | null;
  initialPolicy: PlaytestPolicySnapshot;
  currentPolicy: PlaytestPolicySnapshot;
  controls: Record<PlaytestControlId, number>;
  reportInteractionDays: number[];
  policyDecisions: PlaytestPolicyDecision[];
  visualDetections: PlaytestVisualDetection[];
  autoStops: PlaytestAutoStop[];
  campaignCheckpoints: PlaytestCampaignCheckpoint[];
  finalEvaluation: PlaytestFinalEvaluation | null;
}

export interface PlaytestSessionAssessment {
  completedThirtyDays: boolean;
  durationMinutes: number;
  durationInTargetRange: boolean;
  meaningfulDecisionCount: number;
  minimumDecisionsMet: boolean;
  visualDetectionCount: number;
  visualDetectionCoverage: number;
  visualDiscoveryRate: number;
  visualDiscoveryTargetMet: boolean;
  passesSessionTargets: boolean;
}

export interface PlaytestAggregateSummary {
  sessionCount: number;
  completedSessionCount: number;
  completionRate: number;
  medianCompletedMinutes: number;
  targetDurationRate: number;
  minimumDecisionRate: number;
  visualDiscoveryRate: number;
  visualTesterPassRate: number;
  sampleReady: boolean;
  visualTesterThresholdMet: boolean;
  acceptanceEvidenceReady: boolean;
}

export interface CreatePlaytestSessionInput {
  seed: number;
  scenarioName: string;
  initialPolicy: PlaytestPolicySnapshot;
  nowEpochMs: number;
  sessionId?: string;
}

export interface PlaytestMoment {
  day: number;
  timeLabel: string;
  nowEpochMs: number;
}

function iso(nowEpochMs: number): string {
  return new Date(nowEpochMs).toISOString();
}

function cloneRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

export function clonePlaytestPolicy(policy: PlaytestPolicySnapshot): PlaytestPolicySnapshot {
  return {
    openingHour: policy.openingHour,
    closingHour: policy.closingHour,
    orderingPolicy: policy.orderingPolicy,
    deliveryPolicy: policy.deliveryPolicy,
    staffing: cloneRecord(policy.staffing),
    taskPriorities: [...policy.taskPriorities],
    categoryArea: cloneRecord(policy.categoryArea),
  };
}

function equalNumberRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.every((key) => left[key] === right[key]);
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function changedPolicyDimensions(
  previous: PlaytestPolicySnapshot,
  next: PlaytestPolicySnapshot,
): PlaytestPolicyDimension[] {
  const changed: PlaytestPolicyDimension[] = [];
  if (previous.openingHour !== next.openingHour || previous.closingHour !== next.closingHour) {
    changed.push("opening_hours");
  }
  if (previous.orderingPolicy !== next.orderingPolicy) changed.push("ordering_policy");
  if (previous.deliveryPolicy !== next.deliveryPolicy) changed.push("delivery_policy");
  if (!equalNumberRecord(previous.staffing, next.staffing)) changed.push("staffing");
  if (!equalStrings(previous.taskPriorities, next.taskPriorities)) changed.push("task_priorities");
  if (!equalNumberRecord(previous.categoryArea, next.categoryArea)) changed.push("category_area");
  return changed;
}

function emptyControls(): Record<PlaytestControlId, number> {
  return Object.fromEntries(PLAYTEST_CONTROL_IDS.map((id) => [id, 0])) as Record<
    PlaytestControlId,
    number
  >;
}

function elapsedAt(session: PlaytestSession, nowEpochMs: number): number {
  if (session.runningSinceEpochMs === null) return session.elapsedMs;
  return session.elapsedMs + Math.max(0, nowEpochMs - session.runningSinceEpochMs);
}

function updated(session: PlaytestSession, nowEpochMs: number): PlaytestSession {
  return { ...session, updatedAt: iso(nowEpochMs) };
}

export function createPlaytestSession(input: CreatePlaytestSessionInput): PlaytestSession {
  const sessionId = input.sessionId ?? `playtest-${input.seed}-${input.nowEpochMs}`;
  const initialPolicy = clonePlaytestPolicy(input.initialPolicy);
  return {
    schemaVersion: 1,
    sessionId,
    seed: input.seed,
    scenarioName: input.scenarioName,
    startedAt: iso(input.nowEpochMs),
    startedAtEpochMs: input.nowEpochMs,
    updatedAt: iso(input.nowEpochMs),
    elapsedMs: 0,
    runningSinceEpochMs: input.nowEpochMs,
    completedDay: 0,
    finished: false,
    finishReason: null,
    finishedAt: null,
    initialPolicy,
    currentPolicy: clonePlaytestPolicy(initialPolicy),
    controls: emptyControls(),
    reportInteractionDays: [],
    policyDecisions: [],
    visualDetections: [],
    autoStops: [],
    campaignCheckpoints: [],
    finalEvaluation: null,
  };
}

export function refreshPlaytestElapsed(
  session: PlaytestSession,
  nowEpochMs: number,
): PlaytestSession {
  if (session.finished || session.runningSinceEpochMs === null) return updated(session, nowEpochMs);
  return {
    ...session,
    elapsedMs: elapsedAt(session, nowEpochMs),
    runningSinceEpochMs: nowEpochMs,
    updatedAt: iso(nowEpochMs),
  };
}

export function pausePlaytestSession(
  session: PlaytestSession,
  nowEpochMs: number,
): PlaytestSession {
  if (session.finished || session.runningSinceEpochMs === null) return updated(session, nowEpochMs);
  return {
    ...session,
    elapsedMs: elapsedAt(session, nowEpochMs),
    runningSinceEpochMs: null,
    updatedAt: iso(nowEpochMs),
  };
}

export function resumePlaytestSession(
  session: PlaytestSession,
  nowEpochMs: number,
): PlaytestSession {
  if (session.finished || session.runningSinceEpochMs !== null) return updated(session, nowEpochMs);
  return { ...session, runningSinceEpochMs: nowEpochMs, updatedAt: iso(nowEpochMs) };
}

export function updatePlaytestProgress(
  session: PlaytestSession,
  completedDay: number,
  nowEpochMs: number,
): PlaytestSession {
  return updated(
    { ...session, completedDay: Math.max(session.completedDay, Math.min(30, completedDay)) },
    nowEpochMs,
  );
}

export function recordPlaytestControl(
  session: PlaytestSession,
  controlId: PlaytestControlId,
  nowEpochMs: number,
): PlaytestSession {
  return updated(
    {
      ...session,
      controls: { ...session.controls, [controlId]: session.controls[controlId] + 1 },
    },
    nowEpochMs,
  );
}

export function markPlaytestReportInteraction(
  session: PlaytestSession,
  day: number,
  nowEpochMs: number,
): PlaytestSession {
  if (session.reportInteractionDays.includes(day)) {
    return recordPlaytestControl(session, "report_interaction", nowEpochMs);
  }
  const withControl = recordPlaytestControl(session, "report_interaction", nowEpochMs);
  return {
    ...withControl,
    reportInteractionDays: [...withControl.reportInteractionDays, day].sort((a, b) => a - b),
  };
}

export function recordPlaytestPolicyDecision(
  session: PlaytestSession,
  policy: PlaytestPolicySnapshot,
  moment: PlaytestMoment,
): PlaytestSession {
  const nextPolicy = clonePlaytestPolicy(policy);
  const changedDimensions = changedPolicyDimensions(session.currentPolicy, nextPolicy);
  if (changedDimensions.length === 0) return updated(session, moment.nowEpochMs);
  const elapsedMs = elapsedAt(session, moment.nowEpochMs);
  return {
    ...session,
    currentPolicy: nextPolicy,
    policyDecisions: [
      ...session.policyDecisions,
      {
        sequence: session.policyDecisions.length + 1,
        day: moment.day,
        timeLabel: moment.timeLabel,
        elapsedMs,
        changedDimensions,
        policy: nextPolicy,
      },
    ],
    updatedAt: iso(moment.nowEpochMs),
  };
}

export function recordPlaytestVisualDetection(
  session: PlaytestSession,
  issueId: PlaytestIssueId,
  moment: PlaytestMoment,
): PlaytestSession {
  if (session.visualDetections.some((detection) => detection.issueId === issueId)) {
    return updated(session, moment.nowEpochMs);
  }
  return {
    ...session,
    visualDetections: [
      ...session.visualDetections,
      {
        issueId,
        day: moment.day,
        timeLabel: moment.timeLabel,
        elapsedMs: elapsedAt(session, moment.nowEpochMs),
        beforeReportInteraction: !session.reportInteractionDays.includes(moment.day),
      },
    ],
    updatedAt: iso(moment.nowEpochMs),
  };
}

export function recordPlaytestAutoStop(
  session: PlaytestSession,
  reason: string,
  moment: PlaytestMoment,
): PlaytestSession {
  if (
    session.autoStops.some(
      (entry) => entry.day === moment.day && entry.timeLabel === moment.timeLabel && entry.reason === reason,
    )
  ) {
    return updated(session, moment.nowEpochMs);
  }
  return {
    ...session,
    autoStops: [
      ...session.autoStops,
      {
        day: moment.day,
        timeLabel: moment.timeLabel,
        elapsedMs: elapsedAt(session, moment.nowEpochMs),
        reason,
      },
    ],
    updatedAt: iso(moment.nowEpochMs),
  };
}

export function recordPlaytestCampaignCheckpoint(
  session: PlaytestSession,
  checkpoint: { id: string; title: string; day: number; acknowledged?: boolean },
  nowEpochMs: number,
): PlaytestSession {
  const index = session.campaignCheckpoints.findIndex((entry) => entry.id === checkpoint.id);
  const elapsedMs = elapsedAt(session, nowEpochMs);
  if (index < 0) {
    return {
      ...session,
      campaignCheckpoints: [
        ...session.campaignCheckpoints,
        {
          id: checkpoint.id,
          title: checkpoint.title,
          day: checkpoint.day,
          firstSeenElapsedMs: elapsedMs,
          acknowledgedElapsedMs: checkpoint.acknowledged ? elapsedMs : null,
        },
      ],
      updatedAt: iso(nowEpochMs),
    };
  }
  const existing = session.campaignCheckpoints[index];
  if (!existing || !checkpoint.acknowledged || existing.acknowledgedElapsedMs !== null) {
    return updated(session, nowEpochMs);
  }
  const next = [...session.campaignCheckpoints];
  next[index] = { ...existing, acknowledgedElapsedMs: elapsedMs };
  return { ...session, campaignCheckpoints: next, updatedAt: iso(nowEpochMs) };
}

export function recordPlaytestFinalEvaluation(
  session: PlaytestSession,
  evaluation: PlaytestFinalEvaluation,
  nowEpochMs: number,
): PlaytestSession {
  return {
    ...session,
    finalEvaluation: { ...evaluation },
    updatedAt: iso(nowEpochMs),
  };
}

export function finishPlaytestSession(
  session: PlaytestSession,
  reason: PlaytestFinishReason,
  nowEpochMs: number,
): PlaytestSession {
  if (session.finished) return updated(session, nowEpochMs);
  return {
    ...session,
    elapsedMs: elapsedAt(session, nowEpochMs),
    runningSinceEpochMs: null,
    finished: true,
    finishReason: reason,
    finishedAt: iso(nowEpochMs),
    completedDay: reason === "completed" ? 30 : session.completedDay,
    updatedAt: iso(nowEpochMs),
  };
}

export function assessPlaytestSession(
  session: PlaytestSession,
  nowEpochMs = session.finishedAt ? Date.parse(session.finishedAt) : session.startedAtEpochMs,
): PlaytestSessionAssessment {
  const elapsedMs = session.finished ? session.elapsedMs : elapsedAt(session, nowEpochMs);
  const durationMinutes = elapsedMs / 60_000;
  const beforeReportCount = session.visualDetections.filter(
    (detection) => detection.beforeReportInteraction,
  ).length;
  const visualDiscoveryRate =
    session.visualDetections.length === 0 ? 0 : beforeReportCount / session.visualDetections.length;
  const visualDetectionCoverage = session.visualDetections.length / PLAYTEST_ISSUE_IDS.length;
  const completedThirtyDays = session.finished && session.completedDay >= 30;
  const durationInTargetRange = completedThirtyDays && durationMinutes >= 45 && durationMinutes <= 70;
  const meaningfulDecisionCount = session.policyDecisions.length;
  const minimumDecisionsMet = meaningfulDecisionCount >= 6;
  const visualDiscoveryTargetMet =
    session.visualDetections.length >= 3 && visualDiscoveryRate >= 0.6;
  return {
    completedThirtyDays,
    durationMinutes,
    durationInTargetRange,
    meaningfulDecisionCount,
    minimumDecisionsMet,
    visualDetectionCount: session.visualDetections.length,
    visualDetectionCoverage,
    visualDiscoveryRate,
    visualDiscoveryTargetMet,
    passesSessionTargets:
      completedThirtyDays &&
      durationInTargetRange &&
      minimumDecisionsMet &&
      visualDiscoveryTargetMet,
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const center = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return center;
  return ((sorted[middle - 1] ?? center) + center) / 2;
}

export function summarizePlaytestSessions(
  sessions: readonly PlaytestSession[],
): PlaytestAggregateSummary {
  const assessments = sessions.map((session) => assessPlaytestSession(session));
  const completed = assessments.filter((assessment) => assessment.completedThirtyDays);
  const rate = (count: number): number => (sessions.length === 0 ? 0 : count / sessions.length);
  const totalDetections = sessions.reduce((sum, session) => sum + session.visualDetections.length, 0);
  const beforeReportDetections = sessions.reduce(
    (sum, session) =>
      sum + session.visualDetections.filter((detection) => detection.beforeReportInteraction).length,
    0,
  );
  const visualTesterPassRate = rate(
    assessments.filter((assessment) => assessment.visualDiscoveryTargetMet).length,
  );
  const sampleReady = sessions.length >= 5;
  const visualTesterThresholdMet = visualTesterPassRate >= 0.6;
  return {
    sessionCount: sessions.length,
    completedSessionCount: completed.length,
    completionRate: rate(completed.length),
    medianCompletedMinutes: median(completed.map((assessment) => assessment.durationMinutes)),
    targetDurationRate: rate(
      assessments.filter((assessment) => assessment.durationInTargetRange).length,
    ),
    minimumDecisionRate: rate(
      assessments.filter((assessment) => assessment.minimumDecisionsMet).length,
    ),
    visualDiscoveryRate:
      totalDetections === 0 ? 0 : beforeReportDetections / totalDetections,
    visualTesterPassRate,
    sampleReady,
    visualTesterThresholdMet,
    acceptanceEvidenceReady: sampleReady && visualTesterThresholdMet && completed.length > 0,
  };
}
