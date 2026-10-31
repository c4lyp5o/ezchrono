import { Cron } from "croner";
import { ApiError } from "./http";

// croner's paused mode never starts a timer, so these calls are side-effect free.
export function nextRunAfter(
	expression: string,
	timezone: string,
	from: Date,
): Date | null {
	return new Cron(expression, { paused: true, timezone }).nextRun(from);
}

/**
 * Validates a cron expression and enforces the tenant's minimum interval by
 * looking at the next 10 fire times. The smallest gap must be at least
 * minIntervalSeconds, so "every second" can't slip past a 5-minute quota.
 */
export function assertValidSchedule(
	expression: string,
	timezone: string,
	minIntervalSeconds: number,
	now: Date = new Date(),
): void {
	let runs: Date[];
	try {
		runs = new Cron(expression, { paused: true, timezone }).nextRuns(10, now);
	} catch (err) {
		const reason = err instanceof Error ? err.message : "unknown error";
		throw new ApiError(400, `Invalid schedule: ${reason}`);
	}
	if (runs.length < 2) return; // fires at most once, e.g. a yearly job
	let smallest = Number.POSITIVE_INFINITY;
	for (let i = 1; i < runs.length; i++) {
		smallest = Math.min(smallest, (runs[i].getTime() - runs[i - 1].getTime()) / 1000);
	}
	if (smallest < minIntervalSeconds) {
		throw new ApiError(
			400,
			`Schedule fires every ${Math.round(smallest)}s; your minimum interval is ${minIntervalSeconds}s`,
		);
	}
}
