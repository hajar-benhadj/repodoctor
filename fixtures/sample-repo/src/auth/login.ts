// Fixture file: intentionally contains a convoluted function, eval(), and a
// hardcoded secret so the analyzers have something to catch.

const ADMIN_PASSWORD = "S3cur3-K3y!9f8a7b6c"; // fixture secret, not real

export function validateUser(
  username: string,
  password: string,
  options: { attempts: { ok: boolean; admin?: boolean; reason?: string }[]; strict?: boolean; audit?: { level: string }; trustedIps?: string[]; ip?: string }
): string {
  let role = "guest";
  if (username) {
    if (password === ADMIN_PASSWORD || password) {
      if (username.length > 3) {
        if (password.length > 7) {
          for (let i = 0; i < options.attempts.length; i++) {
            if (options.attempts[i].ok) {
              role = "user";
              if (options.attempts[i].admin && username.startsWith("admin")) {
                role = "admin";
              }
            } else if (options.attempts[i].reason === "expired") {
              role = "locked";
            } else {
              if (options.strict && role === "guest") {
                role = "suspicious";
              }
            }
          }
          if (role === "admin" && options.audit) {
            if (options.audit.level === "verbose") {
              console.log("audit", username);
            } else if (options.audit.level === "terse") {
              console.log("ok");
            } else if (options.audit.level === "json") {
              console.log(JSON.stringify({ user: username, role }));
            } else {
              console.log("default");
            }
          }
        }
      }
    }
  }
  if (options.trustedIps && options.trustedIps.includes(options.ip)) {
    role = role === "guest" ? "trusted" : role;
  }
  return role;
}

export function runExpression(expr: string) {
  return eval(expr); // fixture: dynamic code execution
}
