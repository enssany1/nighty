type RecoveryInput = {
  state: "IN_DEVELOPMENT" | "DELIVERED" | "UNDER_REVIEW";
  leaseExpired: boolean;
  ownedProcessAlive: boolean;
  artifact: { digest: string; recordedDigest: string | null } | null;
};

type RecoveryDecision = {
  action:
    | "WAIT"
    | "MARK_EXECUTION_FAILED"
    | "VALIDATE_DELIVERY"
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
  if (input.ownedProcessAlive && !input.leaseExpired) {
    return { action: "WAIT", reason: "owned process and lease are live" };
  }
  if (input.state === "UNDER_REVIEW" && input.leaseExpired && !input.ownedProcessAlive) {
    return {
      action: "RETRY_REVIEW",
      reason: "delivery is preserved and reviewer lease expired",
    };
  }
  if (
    input.state === "IN_DEVELOPMENT"
    && input.artifact
    && input.artifact.recordedDigest === null
  ) {
    return { action: "VALIDATE_DELIVERY", reason: "unrecorded delivery is present" };
  }
  if (input.state === "IN_DEVELOPMENT" && input.leaseExpired && !input.ownedProcessAlive) {
    return {
      action: "MARK_EXECUTION_FAILED",
      reason: "lease expired and owned process is absent",
    };
  }
  return { action: "WAIT", reason: "no safe recovery transition is currently justified" };
}
