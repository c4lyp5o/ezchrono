import { describe, expect, test } from "bun:test";
import {
	relativeTime,
	statusTone,
	percent,
	quotaTone,
} from "../../src/format.js";

describe("relativeTime", () => {
	const now = Date.parse("2026-01-02T00:00:00Z");
	test("renders past and future", () => {
		expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
		expect(relativeTime(now + 2 * 3_600_000, now)).toBe("in 2h");
	});
	test("renders missing values as a dash", () => {
		expect(relativeTime(null, now)).toBe("—");
	});
	test("sub-second is just now", () => {
		expect(relativeTime(now + 200, now)).toBe("just now");
	});
});

describe("status and quota tones", () => {
	test("maps run status to a tone", () => {
		expect(statusTone("ok")).toBe("ok");
		expect(statusTone("quota")).toBe("warn");
		expect(statusTone("failed")).toBe("bad");
		expect(statusTone(null)).toBe("idle");
	});
	test("quota tone shifts at 80% and 100%", () => {
		expect(quotaTone(79, 100)).toBe("ok");
		expect(quotaTone(80, 100)).toBe("warn");
		expect(quotaTone(100, 100)).toBe("bad");
	});
	test("percent is capped and safe on a zero limit", () => {
		expect(percent(250, 100)).toBe(100);
		expect(percent(5, 0)).toBe(0);
	});
});
