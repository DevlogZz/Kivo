export const DYNAMIC_TEMPLATE_VARIABLES = [
  { key: "$uuid", preview: "UUID v4" },
  { key: "$guid", preview: "UUID v4 alias" },
  { key: "$timestamp", preview: "unix seconds" },
  { key: "$timestampMs", preview: "unix milliseconds" },
  { key: "$isoTimestamp", preview: "ISO datetime" },
  { key: "$randomInt", preview: "0-9999" },
  { key: "$randomFloat", preview: "0.000000-0.999999" },
  { key: "$randomBoolean", preview: "true or false" },
  { key: "$randomHexColor", preview: "#RRGGBB" },
  { key: "$randomAlpha", preview: "12 letters" },
  { key: "$randomAlphanumeric", preview: "16 chars" },
  { key: "$randomFirstName", preview: "sample first name" },
  { key: "$randomLastName", preview: "sample last name" },
  { key: "$randomFullName", preview: "first + last name" },
  { key: "$randomUsername", preview: "username" },
  { key: "$randomEmail", preview: "email address" },
  { key: "$randomDomain", preview: "domain" },
  { key: "$randomIpv4", preview: "IPv4 address" },
  { key: "$randomPort", preview: "1024-65535" },
  { key: "$randomCountry", preview: "country" },
  { key: "$randomCity", preview: "city" },
  { key: "$randomCompany", preview: "company" },
  { key: "$randomJobTitle", preview: "job title" },
];

const DYNAMIC_VARIABLE_SET = new Set(DYNAMIC_TEMPLATE_VARIABLES.map((item) => item.key.toLowerCase()));

const FIRST_NAMES = ["Ava", "Noah", "Liam", "Mia", "Emma", "Aria", "Ethan", "Olivia", "Leo", "Zoe"];
const LAST_NAMES = ["Smith", "Brown", "Miller", "Davis", "Wilson", "Moore", "Taylor", "Thomas", "White", "Clark"];
const COUNTRIES = ["USA", "India", "Germany", "Canada", "Japan", "Brazil", "France", "Australia", "Spain", "Italy"];
const CITIES = ["New York", "Bengaluru", "Berlin", "Toronto", "Tokyo", "Sao Paulo", "Paris", "Sydney", "Madrid", "Milan"];
const COMPANIES = ["Acme Labs", "Nova Systems", "OrbitSoft", "BluePeak", "Nimbus Works", "Vertex Digital"];
const JOB_TITLES = ["Software Engineer", "Product Manager", "QA Analyst", "DevOps Engineer", "Data Analyst", "UX Designer"];
const DOMAINS = ["example.com", "mail.test", "api.demo", "kivo.dev", "acme.io", "sample.org"];
const ALPHA = "abcdefghijklmnopqrstuvwxyz";
const ALPHANUM = `${ALPHA}0123456789`;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomString(chars, len) {
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[randomInt(0, chars.length - 1)];
  }
  return out;
}

function randomUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = randomInt(0, 15);
    const v = c === "x" ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

export function isDynamicTemplateVariable(key) {
  return DYNAMIC_VARIABLE_SET.has(String(key ?? "").trim().toLowerCase());
}

function resolveDynamicVariable(key) {
  const normalizedKey = String(key ?? "").trim().toLowerCase();
  if (!isDynamicTemplateVariable(normalizedKey)) {
    return null;
  }

  switch (normalizedKey) {
    case "$uuid":
    case "$guid":
      return randomUuid();
    case "$timestamp":
      return String(Math.floor(Date.now() / 1000));
    case "$timestampms":
      return String(Date.now());
    case "$isotimestamp":
      return new Date().toISOString();
    case "$randomint":
      return String(randomInt(0, 9999));
    case "$randomfloat":
      return Math.random().toFixed(6);
    case "$randomboolean":
      return String(Math.random() < 0.5);
    case "$randomhexcolor":
      return `#${randomInt(0, 0xffffff).toString(16).padStart(6, "0")}`;
    case "$randomalpha":
      return randomString(ALPHA, 12);
    case "$randomalphanumeric":
      return randomString(ALPHANUM, 16);
    case "$randomfirstname":
      return randomFrom(FIRST_NAMES);
    case "$randomlastname":
      return randomFrom(LAST_NAMES);
    case "$randomfullname":
      return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
    case "$randomusername":
      return `${randomFrom(FIRST_NAMES).toLowerCase()}_${randomString(ALPHANUM, 4)}`;
    case "$randomemail": {
      const user = `${randomFrom(FIRST_NAMES).toLowerCase()}.${randomFrom(LAST_NAMES).toLowerCase()}${randomInt(1, 999)}`;
      return `${user}@${randomFrom(DOMAINS)}`;
    }
    case "$randomdomain":
      return randomFrom(DOMAINS);
    case "$randomipv4":
      return `${randomInt(1, 223)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
    case "$randomport":
      return String(randomInt(1024, 65535));
    case "$randomcountry":
      return randomFrom(COUNTRIES);
    case "$randomcity":
      return randomFrom(CITIES);
    case "$randomcompany":
      return randomFrom(COMPANIES);
    case "$randomjobtitle":
      return randomFrom(JOB_TITLES);
    default:
      return null;
  }
}

export function resolveTemplateVariables(value, mergedEnv = {}, options = {}) {
  const preserveUnknown = options.preserveUnknown ?? false;
  const normalizedEnv = Object.entries(mergedEnv ?? {}).reduce((acc, [key, entryValue]) => {
    const normalizedKey = String(key ?? "").trim().toLowerCase();
    if (normalizedKey && !(normalizedKey in acc)) {
      acc[normalizedKey] = entryValue;
    }
    return acc;
  }, {});

  return String(value ?? "").replace(/\{\{([^}]+)\}\}/g, (full, rawKey) => {
    const key = String(rawKey ?? "").trim();

    if (Object.prototype.hasOwnProperty.call(mergedEnv, key)) {
      return String(mergedEnv[key] ?? "");
    }

    const normalizedKey = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(normalizedEnv, normalizedKey)) {
      return String(normalizedEnv[normalizedKey] ?? "");
    }

    const dynamicValue = resolveDynamicVariable(key);
    if (dynamicValue !== null) {
      return dynamicValue;
    }

    return preserveUnknown ? full : "";
  });
}
