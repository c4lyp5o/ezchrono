// Display helpers. Kept pure so they can be unit tested without a DOM.

export function relativeTime(ts, now = Date.now()) {
	if (ts === null || ts === undefined) return "—";
	const diff = ts - now;
	const abs = Math.abs(diff);
	const units = [
		["d", 86_400_000],
		["h", 3_600_000],
		["m", 60_000],
		["s", 1_000],
	];
	for (const [label, size] of units) {
		if (abs >= size) {
			const n = Math.floor(abs / size);
			return diff >= 0 ? `in ${n}${label}` : `${n}${label} ago`;
		}
	}
	return "just now";
}

export function statusTone(status) {
	if (status === "ok") return "ok";
	if (status === null || status === undefined) return "idle";
	if (status === "quota") return "warn";
	return "bad";
}

export function percent(used, limit) {
	if (!limit) return 0;
	return Math.min(100, Math.round((used / limit) * 100));
}

export function quotaTone(used, limit) {
	const p = percent(used, limit);
	if (p >= 100) return "bad";
	if (p >= 80) return "warn";
	return "ok";
}
