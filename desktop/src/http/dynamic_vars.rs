use chrono::Utc;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use uuid::Uuid;

fn resolve_dynamic_variable(name: &str) -> Option<String> {
    let key = name.trim().to_ascii_lowercase();
    let first_names = [
        "Ava", "Noah", "Liam", "Mia", "Emma", "Aria", "Ethan", "Olivia", "Leo", "Zoe",
    ];
    let last_names = [
        "Smith", "Brown", "Miller", "Davis", "Wilson", "Moore", "Taylor", "Thomas", "White", "Clark",
    ];
    let countries = [
        "USA", "India", "Germany", "Canada", "Japan", "Brazil", "France", "Australia", "Spain", "Italy",
    ];
    let cities = [
        "New York", "Bengaluru", "Berlin", "Toronto", "Tokyo", "Sao Paulo", "Paris", "Sydney", "Madrid", "Milan",
    ];
    let companies = [
        "Acme Labs", "Nova Systems", "OrbitSoft", "BluePeak", "Nimbus Works", "Vertex Digital",
    ];
    let job_titles = [
        "Software Engineer", "Product Manager", "QA Analyst", "DevOps Engineer", "Data Analyst", "UX Designer",
    ];
    let domains = ["example.com", "mail.test", "api.demo", "kivo.dev", "acme.io", "sample.org"];

    match key.as_str() {
        "$uuid" | "$guid" => Some(Uuid::new_v4().to_string()),
        "$timestamp" => Some(Utc::now().timestamp().to_string()),
        "$timestampms" => Some(Utc::now().timestamp_millis().to_string()),
        "$isotimestamp" => Some(Utc::now().to_rfc3339()),
        "$randomint" => Some(random_inclusive_u64(0, 9_999).to_string()),
        "$randomfloat" => {
            let value = random_inclusive_u64(0, 999_999) as f64 / 1_000_000.0;
            Some(format!("{value:.6}"))
        }
        "$randomboolean" => Some((random_inclusive_u64(0, 1) == 1).to_string()),
        "$randomhexcolor" => Some(format!("#{:06x}", random_inclusive_u64(0, 0xFF_FFFF))),
        "$randomalpha" => Some(random_string("abcdefghijklmnopqrstuvwxyz", 12)),
        "$randomalphanumeric" => Some(random_string("abcdefghijklmnopqrstuvwxyz0123456789", 16)),
        "$randomfirstname" => Some(random_choice(&first_names).to_string()),
        "$randomlastname" => Some(random_choice(&last_names).to_string()),
        "$randomfullname" => Some(format!(
            "{} {}",
            random_choice(&first_names),
            random_choice(&last_names)
        )),
        "$randomusername" => Some(format!(
            "{}_{}",
            random_choice(&first_names).to_ascii_lowercase(),
            random_string("abcdefghijklmnopqrstuvwxyz0123456789", 4)
        )),
        "$randomemail" => {
            let user = format!(
                "{}.{}{}",
                random_choice(&first_names).to_ascii_lowercase(),
                random_choice(&last_names).to_ascii_lowercase(),
                random_inclusive_u64(1, 999)
            );
            Some(format!("{}@{}", user, random_choice(&domains)))
        }
        "$randomdomain" => Some(random_choice(&domains).to_string()),
        "$randomipv4" => Some(format!(
            "{}.{}.{}.{}",
            random_inclusive_u64(1, 223),
            random_inclusive_u64(0, 255),
            random_inclusive_u64(0, 255),
            random_inclusive_u64(1, 254)
        )),
        "$randomport" => Some(random_inclusive_u64(1_024, 65_535).to_string()),
        "$randomcountry" => Some(random_choice(&countries).to_string()),
        "$randomcity" => Some(random_choice(&cities).to_string()),
        "$randomcompany" => Some(random_choice(&companies).to_string()),
        "$randomjobtitle" => Some(random_choice(&job_titles).to_string()),
        _ => None,
    }
}

fn random_seed() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or(Utc::now().timestamp_micros() * 1_000) as u64;
    let bytes = Uuid::new_v4().as_u128().to_le_bytes();
    let uuid_bits = u64::from_le_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]);
    counter ^ nanos.rotate_left(13) ^ uuid_bits
}

fn random_inclusive_u64(min: u64, max: u64) -> u64 {
    if max <= min {
        return min;
    }
    let seed = random_seed();
    let span = max - min + 1;
    min + (seed % span)
}

fn random_choice<'a>(items: &'a [&'a str]) -> &'a str {
    let idx = random_inclusive_u64(0, (items.len() - 1) as u64) as usize;
    items[idx]
}

fn random_string(chars: &str, len: usize) -> String {
    let mut seed = random_seed();
    let bytes = chars.as_bytes();
    let mut out = String::with_capacity(len);

    for _ in 0..len {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        let idx = (seed % bytes.len() as u64) as usize;
        out.push(bytes[idx] as char);
    }

    out
}

pub fn resolve_template_variables(input: &str, vars: &HashMap<String, String>) -> String {
    let mut normalized_vars: HashMap<String, &String> = HashMap::new();
    for (key, value) in vars {
        normalized_vars
            .entry(key.trim().to_ascii_lowercase())
            .or_insert(value);
    }

    let mut out = String::with_capacity(input.len());
    let mut cursor = 0usize;

    while let Some(open_rel) = input[cursor..].find("{{") {
        let open = cursor + open_rel;
        out.push_str(&input[cursor..open]);

        let after_open = open + 2;
        let Some(close_rel) = input[after_open..].find("}}") else {
            out.push_str(&input[open..]);
            return out;
        };

        let close = after_open + close_rel;
        let raw_key = &input[after_open..close];
        let key = raw_key.trim();

        if let Some(value) = vars.get(key) {
            out.push_str(value);
        } else if let Some(value) = normalized_vars.get(&key.to_ascii_lowercase()) {
            out.push_str(value);
        } else if let Some(value) = resolve_dynamic_variable(key) {
            out.push_str(&value);
        } else {
            out.push_str("{{");
            out.push_str(raw_key);
            out.push_str("}}");
        }

        cursor = close + 2;
    }

    out.push_str(&input[cursor..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_env_and_dynamic_placeholders() {
        let mut vars = HashMap::new();
        vars.insert("HOST".to_string(), "api.example.com".to_string());

        let out = resolve_template_variables("https://{{HOST}}/{{$uuid}}/{{$timestamp}}", &vars);
        assert!(out.starts_with("https://api.example.com/"));

        let parts: Vec<&str> = out.split('/').collect();
        let uuid_part = parts[3];
        let ts_part = parts[4];

        assert_eq!(uuid_part.len(), 36);
        assert!(uuid_part.chars().all(|c| c.is_ascii_hexdigit() || c == '-'));
        assert!(ts_part.parse::<i64>().is_ok());
    }

    #[test]
    fn unknown_placeholders_are_preserved() {
        let out = resolve_template_variables("{{MISSING}}/{{$unknown}}", &HashMap::new());
        assert_eq!(out, "{{MISSING}}/{{$unknown}}");
    }

    #[test]
    fn resolves_env_keys_case_insensitively() {
        let mut vars = HashMap::new();
        vars.insert("base_url".to_string(), "postman-echo.com".to_string());

        let out = resolve_template_variables("https://{{BASE_URL}}/get", &vars);
        assert_eq!(out, "https://postman-echo.com/get");
    }

    #[test]
    fn resolves_dynamic_variable_catalog() {
        let keys = [
            "$uuid",
            "$guid",
            "$timestamp",
            "$timestampMs",
            "$isoTimestamp",
            "$randomInt",
            "$randomFloat",
            "$randomBoolean",
            "$randomHexColor",
            "$randomAlpha",
            "$randomAlphanumeric",
            "$randomFirstName",
            "$randomLastName",
            "$randomFullName",
            "$randomUsername",
            "$randomEmail",
            "$randomDomain",
            "$randomIpv4",
            "$randomPort",
            "$randomCountry",
            "$randomCity",
            "$randomCompany",
            "$randomJobTitle",
        ];

        for key in keys {
            let out = resolve_template_variables(&format!("{{{{{key}}}}}"), &HashMap::new());
            assert!(!out.starts_with("{{"), "expected resolved value for {key}, got {out}");
            assert!(!out.is_empty(), "expected non-empty value for {key}");
        }
    }
}
