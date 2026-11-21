const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 3_000;

type FaqCache = {
  csv: string;
  fetchedAt: number;
};

let cache: FaqCache | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function getFaqCsv(timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.csv;
  }

  const controller = new AbortController();
  const timeout = Math.min(FETCH_TIMEOUT_MS, Math.max(0, timeoutMs));
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = process.env.SHEET_CSV_URL;
    if (!url) {
      throw new Error("SHEET_CSV_URL is not configured");
    }

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`FAQ sheet request failed with status ${response.status}`);
    }

    const csv = await response.text();
    if (!csv.trim()) {
      throw new Error("FAQ sheet returned empty data");
    }

    cache = { csv, fetchedAt: Date.now() };
    return csv;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "sheet_fetch_error",
        message: errorMessage(error),
        usingStaleCache: Boolean(cache)
      })
    );

    if (cache) {
      return cache.csv;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
