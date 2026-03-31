export function parseHeaders(source) {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((headers, line) => {
      const separator = line.indexOf(":");

      if (separator === -1) {
        return headers;
      }

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();

      if (key) {
        headers[key] = value;
      }

      return headers;
    }, {});
}
