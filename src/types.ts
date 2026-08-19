export type Page = "catalog" | "run" | "results" | "setup" | "agentic";

export type EnvName = "dev" | "uat" | "sit" | "prod";

export type EnvEndpoints = {
  backendUrl: string;
  agentUrl: string;
};

export type TriggerFocus = {
  domainId: string;
  profileId?: string;
  runId?: number;
};

export type Datasource = {
  name: string;
  type: string;
  tags?: string[];
};

export type Profile = {
  domainId: string;
  profileId: string;
  id: string;
  sourceDatasource: string;
  sourceType: string;
  targetDatasource: string;
  targetType: string;
  migrationKeyType: string | null;
  migrationKeyColumns: string[];
  hashingStrategy: string | null;
  reconMode: string;
  conditionFields: string[];
  tags?: string[];
};

export type Domain = {
  id: string;
  hashingStrategy: string | null;
  sourceDatasource: string | null;
  targetDatasource: string | null;
  tags?: string[];
  profiles: Profile[];
};

/** FULL = complete compare; INCREMENTAL = only keys changed since baselineRunId. */
export type RunScope = "FULL" | "INCREMENTAL" | string;

export type Run = {
  id: number;
  datasetId: string;
  domainId: string;
  profileId: string | null;
  domainRunId: number | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  sourceCount: number;
  targetCount: number;
  matchedCount: number;
  mismatchedCount: number;
  sourceOnlyCount: number;
  targetOnlyCount: number;
  errorMessage: string | null;
  active: boolean;
  reconMode: string | null;
  sourceQuery: string | null;
  targetQuery: string | null;
  conditionFields: string[] | null;
  runScope: RunScope | null;
  baselineRunId: number | null;
};

export type RecRecord = {
  migrationKey: string;
  sourceHash: string | null;
  targetHash: string | null;
  status: string;
  fieldDiffs: string | null;
  sourcePayload?: string | null;
  targetPayload?: string | null;
};

export type ReconRunBody = {
  mode?: string;
  conditionFields?: string[];
  /** When true, force FULL even if an active prior run exists. Default is incremental. */
  forceFull?: boolean;
};

export type Connection = {
  env: EnvName;
  backendUrl: string;
  agentUrl: string;
  user: string;
  password: string;
  endpoints: Record<EnvName, EnvEndpoints>;
};
