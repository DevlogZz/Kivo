export function isDynamicTemplateVariable(key) {
  return key === "$timestamp" || key === "$uuid";
}

function resolveDynamicVariable(key) {
  if (!isDynamicTemplateVariable(key)) {
    return null;
  }

  if (key === "$timestamp") {
    return String(Math.floor(Date.now() / 1000));
  }

  if (key === "$uuid") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === "x" ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  return null;
}

export function resolveTemplateVariables(value, mergedEnv = {}, options = {}) {
  const preserveUnknown = options.preserveUnknown ?? false;

  return String(value ?? "").replace(/\{\{([^}]+)\}\}/g, (full, rawKey) => {
    const key = String(rawKey ?? "").trim();

    if (Object.prototype.hasOwnProperty.call(mergedEnv, key)) {
      return String(mergedEnv[key] ?? "");
    }

    const dynamicValue = resolveDynamicVariable(key);
    if (dynamicValue !== null) {
      return dynamicValue;
    }

    return preserveUnknown ? full : "";
  });
}
