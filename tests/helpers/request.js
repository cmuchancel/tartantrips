export function createMockRequest({
  body,
  headers = {},
  url = "https://example.com/api/test"
} = {}) {
  return {
    url,
    headers: new Headers(headers),
    async json() {
      if (body instanceof Error) {
        throw body;
      }

      return body;
    }
  };
}

export async function readJson(response) {
  return response.json();
}
