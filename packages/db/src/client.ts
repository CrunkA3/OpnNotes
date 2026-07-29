import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createClient(url: string): Sql {
  return postgres(url, { onnotice: () => {} });
}
