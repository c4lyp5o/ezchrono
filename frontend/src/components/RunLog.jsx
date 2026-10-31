import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "../api.js";
import { relativeTime } from "../format.js";

export default function RunLog({ job, onClose }) {
	const [runs, setRuns] = useState(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let alive = true;
		api(`/jobs/${job.id}/runs?limit=50`)
			.then((d) => alive && setRuns(d.runs))
			.catch((err) => alive && setError(err.message));
		return () => {
			alive = false;
		};
	}, [job.id]);

	return (
		<motion.div
			className="sheet-wrap"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={onClose}
		>
			<motion.section
				className="card sheet"
				role="dialog"
				aria-modal="true"
				aria-label={`History for ${job.name}`}
				initial={{ y: 16, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: 16, opacity: 0 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="page-head">
					<h3>History: {job.name}</h3>
					<button type="button" className="ghost" onClick={onClose}>
						Close
					</button>
				</div>
				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}
				{runs === null && !error && <p className="muted">Loading…</p>}
				{runs && runs.length === 0 && <p className="muted">No runs yet.</p>}
				{runs && runs.length > 0 && (
					<ul className="runs">
						{runs.map((r) => (
							<li key={r.id}>
								<span
									className={`dot ${r.status === "ok" ? "ok" : r.status === "quota" ? "warn" : "bad"}`}
									aria-hidden="true"
								/>
								<span className="mono small">{relativeTime(r.started_at)}</span>
								<span className="chip">{r.trigger}</span>
								<strong>{r.status}</strong>
								<span className="muted small">
									{r.http_status ? `HTTP ${r.http_status}` : ""}{" "}
									{r.duration_ms !== null ? `· ${r.duration_ms} ms` : ""}
								</span>
								{r.error && <span className="small error-text">{r.error}</span>}
							</li>
						))}
					</ul>
				)}
			</motion.section>
		</motion.div>
	);
}
