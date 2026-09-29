import { validateUser } from "../src/auth/login";

// Fixture: a single minimal test for a codebase that needs many more.
test("guest by default", () => {
  expect(validateUser("", "", { attempts: [] })).toBe("guest");
});
