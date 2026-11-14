export type RecoveryState =
  | "IN_DEVELOPMENT"
  | "DELIVERED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUIRED"
  | "READY_FOR_CORRECTION"
  | "HUMAN_REVIEW";

type RecoveryInput = {
  state: RecoveryState;
  leaseExpired: boolean;
  ownedProcessAlive: boolean;
  /** A recorded child/descendant of the owned process is still alive. */
  producerDescendantAlive?: boolean;
  artifact: { digest: string; recordedDigest: string | null } | null;
  correctionsExhausted?: boolean;
  producerFailed?: boolean;
};

type RecoveryDecision = {
  action:
    | "WAIT"
    | "MARK_EXECUTION_FAILED"
    | "VALIDATE_DELIVERY"
    | "ADVANCE_DELIVERY"
    | "RETRY_REVIEW"
    | "HUMAN_REVIEW";
  reason: string;
};

export function decideRecovery(input: RecoveryInput): RecoveryDecision {
  if (
    input.artifact?.recordedDigest !== null
    && input.artifact?.recordedDigest !== undefined
    && input.artifact.recordedDigest !== input.artifact.digest
  ) {
    return {
      action: "HUMAN_REVIEW",
      reason: "artifact digest conflicts with recorded identity",
    };
  }
  // Safety boundary: an artifact that may still be under active production is
  // never consumed, even when its lease has expired.
  if (input.producerDescendantAlive === true) {
    return {
      action: "WAIT",
      reason: "an owned producer descendant is still alive",
    };
  }
  if (input.ownedProcessAlive) {
    if (input.leaseExpired) {
      return {
        action: "WAIT",
        reason: "owned process is still alive after lease expiry",
      };
    }
    return { action: "WAIT", reason: "owned process and lease are live" };
  }
  if (input.producerFailed === true) {
    return {
      action: "MARK_EXECUTION_FAILED",
      reason: "provider run already failed; late output is not accepted",
    };
  }
  if (input.state === "UNDER_REVIEW" && input.leaseExpired) {
    return {
      action: "RETRY_REVIEW",
      reason: "delivery is preserved and reviewer lease expired",
    };
  }
  if (input.state === "HUMAN_REVIEW") {
    return { action: "WAIT", reason: "task is waiting for human review" };
  }
  if (input.correctionsExhausted === true) {
    return { action: "HUMAN_REVIEW", reason: "correction attempts exhausted" };
  }
  if (
    input.state === "IN_DEVELOPMENT"
    && input.artifact
    && input.artifact.recordedDigest === input.artifact.digest
  ) {
    return {
      action: "ADVANCE_DELIVERY",
      reason: "delivery is recorded but state has not advanced",
    };
  }
  if (
    input.state === "IN_DEVELOPMENT"
    && input.artifact
    && input.artifact.recordedDigest === null
  ) {
    return { action: "VALIDATE_DELIVERY", reason: "unrecorded delivery is present" };
  }
  if (
    (input.state === "IN_DEVELOPMENT" || input.state === "READY_FOR_CORRECTION")
    && input.leaseExpired
  ) {
    return {
      action: "MARK_EXECUTION_FAILED",
      reason: "lease expired and owned process is absent",
    };
  }
  return { action: "WAIT", reason: "no safe recovery transition is currently justified" };
}
