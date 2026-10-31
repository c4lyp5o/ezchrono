import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../api.js";

const PRESETS = [
	{ label: "Every 5 min", value: "*/5 * * * *" },
	{ label: "Hourly", value: "0 * * * *" },
	{ label: "Daily 09:00", value: "0 9 * * *" },
	{ label: "Weekdays 08:30", value: "30 8 * * 1-5" },
];

export default function JobForm({ job, quota, onClose, onSaved }) {
	const [name, setName] = useState(job?.name ?? "");
	const [schedule, setSchedule] = useState(job?.schedule ?? PRESETS[0].value);
	const [url, setUrl] = useState(job?.target_url ?? "https://");
	const [method, setMethod] = useState(job?.method ?? "GET");
	const [body, setBody] = useState(job?.body ?? "");
	const [timeoutS, setTimeoutS] = useState(
		String((job?.timeout_ms ?? 10000) / 1000),
	);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setError("");
		const timeoutMs = Math.round(Number(timeoutS) * 1000);
		if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
			setError("Timeout must be between 1 and 30 seconds");
			return;
		}
		if (method === "GET" && body.trim()) {
			setError(
				"A GET request cannot have a body. Switch to POST or clear the body.",
			);
			return;
		}
		const payload = {
			name: name.trim(),
			schedule: schedule.trim(),
			target_url: url.trim(),
			method,
			body: method === "POST" && body.trim() ? body : null,
			timeout_ms: timeoutMs,
		};
		setBusy(true);
		try {
			if (job) await api(`/jobs/${job.id}`, { method: "PATCH", body: payload });
			else await api("/jobs", { method: "POST", body: payload });
			onSaved();
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<motion.div
			className="sheet-wrap"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={onClose}
		>
			<motion.form
				className="card sheet"
				role="dialog"
				aria-modal="true"
				aria-label={job ? "Edit cron" : "Add cron"}
				onSubmit={submit}
				noValidate
				initial={{ y: 16, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: 16, opacity: 0 }}
				onClick={(e) => e.stopPropagation()}
			>
				<h3>{job ? "Edit cron" : "Add cron"}</h3>

				<label htmlFor="job-name">Name</label>
				<input
					id="job-name"
					required
					maxLength={80}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>

				<label htmlFor="job-schedule">
					Schedule (5-field cron, UTC unless set by the operator)
				</label>
				<input
					id="job-schedule"
					className="mono"
					required
					maxLength={120}
					value={schedule}
					onChange={(e) => setSchedule(e.target.value)}
				/>
				<div className="presets">
					{PRESETS.map((p) => (
						<button
							key={p.value}
							type="button"
							className="chip-btn"
							onClick={() => setSchedule(p.value)}
						>
							{p.label}
						</button>
					))}
				</div>
				<p className="muted small">
					Shortest allowed gap: {quota.minIntervalSeconds}s.
				</p>

				<label htmlFor="job-url">Target URL (public http or https only)</label>
				<input
					id="job-url"
					type="url"
					className="mono"
					required
					value={url}
					onChange={(e) => setUrl(e.target.value)}
				/>

				<div className="row">
					<div>
						<label htmlFor="job-method">Method</label>
						<select
							id="job-method"
							value={method}
							onChange={(e) => setMethod(e.target.value)}
						>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
						</select>
					</div>
					<div>
						<label htmlFor="job-timeout">Timeout (seconds)</label>
						<input
							id="job-timeout"
							type="number"
							min={1}
							max={30}
							step={1}
							value={timeoutS}
							onChange={(e) => setTimeoutS(e.target.value)}
						/>
					</div>
				</div>

				{method === "POST" && (
					<>
						<label htmlFor="job-body">JSON body</label>
						<textarea
							id="job-body"
							rows={4}
							maxLength={4096}
							className="mono"
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
					</>
				)}

				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}

				<div className="sheet-actions">
					<button type="button" className="ghost" onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className="primary" disabled={busy}>
						{busy ? "Saving…" : job ? "Save" : "Add cron"}
					</button>
				</div>
			</motion.form>
		</motion.div>
	);
}
