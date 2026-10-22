// Test double for the Supabase client used by the data-access modules.
// Every builder call is recorded so tests can assert on the query that was
// sent (table, filters, ordering), and awaited queries resolve to responses
// queued per table or rpc name. Unqueued queries resolve to an empty result.

export interface FakeResponse {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export type Responder = FakeResponse | ((calls: readonly RecordedCall[]) => FakeResponse);

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  target: string;
  calls: RecordedCall[];
}

const EMPTY: FakeResponse = { data: null, error: null, count: null };

export interface FakeSupabase {
  client: unknown;
  queries: RecordedQuery[];
  /** Queue a response for the next awaited query on `table` (or `rpc:name`). */
  respond(target: string, response: Responder): FakeSupabase;
  /** Queries sent to one table or rpc, in order. */
  queriesFor(target: string): RecordedQuery[];
  setUser(user: { id: string; email?: string } | null): FakeSupabase;
  reset(): void;
}

function settle(response: FakeResponse) {
  return { data: response.data ?? null, error: response.error ?? null, count: response.count ?? null };
}

export function createFakeSupabase(): FakeSupabase {
  const queues = new Map<string, Responder[]>();
  const queries: RecordedQuery[] = [];
  let user: { id: string; email?: string } | null = null;

  const next = (target: string, calls: readonly RecordedCall[]): FakeResponse => {
    const queue = queues.get(target) ?? [];
    const responder = queue.shift();
    if (!responder) return EMPTY;
    return typeof responder === "function" ? responder(calls) : responder;
  };

  const builder = (target: string, first: RecordedCall | null): unknown => {
    const query: RecordedQuery = { target, calls: first ? [first] : [] };
    queries.push(query);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_obj, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(settle(next(target, query.calls))).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            query.calls.push({ method: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const client = {
    from: (table: string) => builder(table, null),
    rpc: (name: string, params?: unknown) => builder(`rpc:${name}`, { method: "rpc", args: [params] }),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getClaims: async () => ({ data: user ? { claims: { sub: user.id, email: user.email } } : null, error: null }),
    },
  };

  const fake: FakeSupabase = {
    client,
    queries,
    respond(target, response) {
      queues.set(target, [...(queues.get(target) ?? []), response]);
      return fake;
    },
    queriesFor: (target) => queries.filter((q) => q.target === target),
    setUser(next) {
      user = next;
      return fake;
    },
    reset() {
      queues.clear();
      queries.length = 0;
      user = null;
    },
  };
  return fake;
}

/** The arguments of the first call to `method` in a recorded query. */
export function callArgs(query: RecordedQuery | undefined, method: string): unknown[] | undefined {
  return query?.calls.find((c) => c.method === method)?.args;
}

/** Every call to `method` in a recorded query. */
export function allCalls(query: RecordedQuery | undefined, method: string): unknown[][] {
  return query?.calls.filter((c) => c.method === method).map((c) => c.args) ?? [];
}
