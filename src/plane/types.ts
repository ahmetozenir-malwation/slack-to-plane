export type PlaneProject = {
  id: string;
  name: string;
  identifier: string;
  is_member?: boolean;
};

export type PlaneState = {
  id: string;
  name: string;
  group: string;
  default: boolean;
  sort_order?: number;
};

export type PlaneMember = {
  id: string;
  display_name: string;
  email?: string;
};

export type PlaneLabel = {
  id: string;
  name: string;
  color?: string;
};

export type PlaneCycle = {
  id: string;
  name: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
};
export type PlaneModule = { id: string; name: string; status?: string };

export type PlaneIssue = {
  id: string;
  sequence_id: number;
  name: string;
  project: string;
};

export type PlanePriority = "none" | "urgent" | "high" | "medium" | "low";

export type CreateIssueInput = {
  projectId: string;
  name: string;
  description?: string;
  stateId?: string;
  priority?: PlanePriority;
  assigneeIds?: string[];
  labelIds?: string[];
  startDate?: string; // "YYYY-MM-DD"
  targetDate?: string; // "YYYY-MM-DD"
};

export type PlaneErrorCode =
  | "PLANE_TOKEN_INVALID"
  | "PLANE_4XX"
  | "PLANE_5XX"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export class PlaneApiError extends Error {
  constructor(
    public readonly code: PlaneErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PlaneApiError";
  }
}
