import { replitProxyFetch } from "../replit_integrations/connectors";

export interface LinearGraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

export interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: LinearGraphQLError[];
}

export class LinearAPIError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly graphqlErrors?: LinearGraphQLError[],
  ) {
    super(message);
    this.name = "LinearAPIError";
  }
}

export async function linearQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await replitProxyFetch("linear", "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new LinearAPIError(
      `Linear HTTP ${response.status}: ${response.statusText}`,
      response.status,
    );
  }

  const payload = (await response.json()) as LinearGraphQLResponse<T>;

  if (payload.errors && payload.errors.length > 0) {
    throw new LinearAPIError(
      `Linear GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`,
      response.status,
      payload.errors,
    );
  }

  if (!payload.data) {
    throw new LinearAPIError("Linear GraphQL returned no data");
  }

  return payload.data;
}

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
}

export async function getViewer(): Promise<LinearViewer> {
  const data = await linearQuery<{ viewer: LinearViewer }>(
    `query { viewer { id name email } }`,
  );
  return data.viewer;
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export async function listTeams(): Promise<LinearTeam[]> {
  const data = await linearQuery<{ teams: { nodes: LinearTeam[] } }>(
    `query { teams { nodes { id key name } } }`,
  );
  return data.teams.nodes;
}
