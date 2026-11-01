import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Collapse, EASE, SlideRow, Stagger, StaggerItem } from "../ez/motion";
import { api } from "../api.js";
import { relativeTime, statusTone, quotaTone, percent } from "../format.js";
import JobForm from "./JobForm.jsx";
import PasswordForm from "./PasswordForm.jsx";
import RunLog from "./RunLog.jsx";

export default function UserView({ quota }) {
	const [jobs, setJobs] = useState(null);
	const [usage, setUsage] = useState(null);
	const [editing, setEditing] = useState(null); // null | "new" | job
	const [openJob, setOpenJob] = useState(null);
	const [pwOpen, setPwOpen] = useState(false);
	const [error, setError] = useState("");

	const load = useCallback(async () => {
		try {
			const [j, u] = await Promise.all([api("/jobs"), api("/jobs/usage")]);
			setJobs(j.jobs);
			setUsage(u);
			setError("");
		} catch (err) {
			setError(err.message);
		}
	}, []);

	useEffect(() => {
		load();
		const id = setInterval(load, 15_000);
		return () => clearInterval(id);
	}, [load]);

	async function remove(job) {
		if (!window.confirm(`Delete "${job.name}"? Its run history goes too.`))
			return;
		try {
			await api(`/jobs/${job.id}`, { method: "DELETE" });
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function toggle(job) {
		try {
			await api(`/jobs/${job.id}`, {
				method: "PATCH",
				body: { enabled: !job.enabled },
			});
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function runNow(job) {
		try {
			await api(`/jobs/${job.id}/run`, { method: "POST" });
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	const jobsUsed = usage?.jobs.used ?? 0;
	const jobsLimit = usage?.jobs.limit ?? quota.maxJobs;
	const runsUsed = usage?.runs24h.used ?? 0;
	const runsLimit = usage?.runs24h.limit ?? quota.maxRunsPerDay;

	return (
		<Stagger as="section" className="stack">
			<StaggerItem className="page-head">
				<div>
					<h2>My jobs</h2>
					<p className="muted">
						Minimum interval{" "}
						<span className="num-face">{quota.minIntervalSeconds}</span> s. Runs
						count toward a daily limit.
					</p>
				</div>
				<button
					type="button"
					className="primary"
					onClick={() => setEditing("new")}
					disabled={jobsUsed >= jobsLimit}
				>
					Add cron
				</button>
				<button type="button" className="ghost" onClick={() => setPwOpen(true)}>
					Change password
				</button>
			</StaggerItem>

			<StaggerItem className="quota-row">
				<Meter label="Jobs" used={jobsUsed} limit={jobsLimit} />
				<Meter label="Runs, last 24 hours" used={runsUsed} limit={runsLimit} />
			</StaggerItem>

			<Collapse open={!!error}>
				<p className="error" role="alert">
					{error}
				</p>
			</Collapse>

			<StaggerItem>
				{jobs === null ? (
					<p className="muted">Loading jobs…</p>
				) : jobs.length === 0 ? (
					<div className="card empty">
						<p>
							No jobs yet. Add one and ezchrono will call the URL on schedule.
						</p>
					</div>
				) : (
					<ul className="job-list">
						<AnimatePresence initial={false}>
							{jobs.map((job) => (
								<SlideRow as="li" key={job.id} className="card job">
									<div className="job-main">
										<div className="job-title">
											<span
												className={`dot ${statusTone(job.last_status)}`}
												aria-hidden="true"
											/>
											<strong>{job.name}</strong>
											{!job.enabled && (
												<span className="chip warn">Paused</span>
											)}
										</div>
										<code className="mono small">
											{job.schedule} · {job.method} {job.target_url}
										</code>
										<div className="job-meta small muted">
											Next {job.enabled ? relativeTime(job.next_run_at) : "—"} ·
											Last {relativeTime(job.last_run_at)} ·{" "}
											{job.last_status ?? "never run"}
										</div>
									</div>
									<div className="job-actions">
										<button
											type="button"
											className="ghost"
											onClick={() => runNow(job)}
										>
											Run now
										</button>
										<button
											type="button"
											className="ghost"
											onClick={() => toggle(job)}
										>
											{job.enabled ? "Pause" : "Resume"}
										</button>
										<button
											type="button"
											className="ghost"
											onClick={() => setOpenJob(job)}
										>
											History
										</button>
										<button
											type="button"
											className="danger"
											onClick={() => remove(job)}
										>
											Delete
										</button>
									</div>
								</SlideRow>
							))}
						</AnimatePresence>
					</ul>
				)}
			</StaggerItem>

			<AnimatePresence>
				{editing && (
					<JobForm
						key="form"
						job={editing === "new" ? null : editing}
						quota={quota}
						onClose={() => setEditing(null)}
						onSaved={() => {
							setEditing(null);
							load();
						}}
					/>
				)}
				{pwOpen && (
					<PasswordForm
						key="pw"
						onClose={() => setPwOpen(false)}
						onSaved={() => {
							setPwOpen(false);
							setError("");
						}}
					/>
				)}
				{openJob && (
					<RunLog key="log" job={openJob} onClose={() => setOpenJob(null)} />
				)}
			</AnimatePresence>
		</Stagger>
	);
}

function Meter({ label, used, limit }) {
	const p = percent(used, limit);
	const tone = quotaTone(used, limit);
	return (
		<div className="card meter">
			<div className="meter-head">
				<span>{label}</span>
				<span>
					<span className="figure">{used.toLocaleString("en-US")}</span> of{" "}
					{limit.toLocaleString("en-US")}
				</span>
			</div>
			<div className="bar">
				<motion.span
					className={`fill ${tone}`}
					initial={{ scaleX: 0 }}
					animate={{ scaleX: p / 100 }}
					transition={{ duration: 0.42, ease: EASE }}
				/>
			</div>
		</div>
	);
}
