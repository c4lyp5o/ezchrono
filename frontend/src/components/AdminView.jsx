import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { relativeTime, quotaTone, percent } from "../format.js";

export default function AdminView() {
	const [overview, setOverview] = useState(null);
	const [users, setUsers] = useState([]);
	const [jobs, setJobs] = useState([]);
	const [error, setError] = useState("");
	const [drafts, setDrafts] = useState({});

	const load = useCallback(async () => {
		try {
			const [o, u, j] = await Promise.all([
				api("/admin/overview"),
				api("/admin/users"),
				api("/admin/jobs?limit=200"),
			]);
			setOverview(o);
			setUsers(u.users);
			setJobs(j.jobs);
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

	async function patchUser(id, patch) {
		try {
			await api(`/admin/users/${id}`, { method: "PATCH", body: patch });
			setDrafts((d) => {
				const next = { ...d };
				delete next[id];
				return next;
			});
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	async function deleteUser(u) {
		if (
			!window.confirm(
				`Delete ${u.email} and all of their jobs and runs? This cannot be undone.`,
			)
		)
			return;
		try {
			await api(`/admin/users/${u.id}`, { method: "DELETE" });
			await load();
		} catch (err) {
			setError(err.message);
		}
	}

	function draft(id, field, value) {
		setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
	}

	return (
		<section className="stack">
			<div className="page-head">
				<div>
					<h2>Admin</h2>
					<p className="muted">
						All tenants. Changes apply on the next request.
					</p>
				</div>
			</div>

			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}

			{overview && (
				<dl className="stats">
					<Stat
						label="Users"
						value={overview.users}
						sub={`${overview.disabled_users} disabled`}
					/>
					<Stat
						label="Jobs"
						value={overview.jobs}
						sub={`${overview.enabled_jobs} active`}
					/>
					<Stat label="Runs, 24h" value={overview.runs_24h} />
					<Stat
						label="Failed, 24h"
						value={overview.failed_24h}
						tone={overview.failed_24h > 0 ? "warn" : "ok"}
					/>
				</dl>
			)}

			<h3>Users</h3>
			<div className="card table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Email</th>
							<th scope="col">Role</th>
							<th scope="col">Jobs</th>
							<th scope="col">Runs 24h</th>
							<th scope="col">Max jobs</th>
							<th scope="col">Max runs/day</th>
							<th scope="col">Min gap (s)</th>
							<th scope="col">Status</th>
							<th scope="col">
								<span className="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => {
							const d = drafts[u.id] ?? {};
							return (
								<tr key={u.id} className={u.disabled ? "row-off" : ""}>
									<td className="mono small">{u.email}</td>
									<td>{u.role}</td>
									<td>
										<QuotaCell used={u.job_count} limit={u.max_jobs} />
									</td>
									<td>
										<QuotaCell used={u.runs_24h} limit={u.max_runs_per_day} />
									</td>
									<td>
										<NumInput
											value={d.max_jobs ?? u.max_jobs}
											label={`Max jobs for ${u.email}`}
											onChange={(v) => draft(u.id, "max_jobs", v)}
										/>
									</td>
									<td>
										<NumInput
											value={d.max_runs_per_day ?? u.max_runs_per_day}
											label={`Max runs per day for ${u.email}`}
											onChange={(v) => draft(u.id, "max_runs_per_day", v)}
										/>
									</td>
									<td>
										<NumInput
											value={d.min_interval_seconds ?? u.min_interval_seconds}
											min={60}
											label={`Minimum interval for ${u.email}`}
											onChange={(v) => draft(u.id, "min_interval_seconds", v)}
										/>
									</td>
									<td>{u.disabled ? "disabled" : "active"}</td>
									<td className="actions">
										{Object.keys(d).length > 0 && (
											<button
												type="button"
												className="primary small-btn"
												onClick={() => patchUser(u.id, d)}
											>
												Save
											</button>
										)}
										<button
											type="button"
											className="ghost small-btn"
											onClick={() => patchUser(u.id, { disabled: !u.disabled })}
										>
											{u.disabled ? "Enable" : "Disable"}
										</button>
										<button
											type="button"
											className="ghost small-btn"
											onClick={() =>
												patchUser(u.id, {
													role: u.role === "admin" ? "user" : "admin",
												})
											}
										>
											{u.role === "admin" ? "Demote" : "Make admin"}
										</button>
										<button
											type="button"
											className="danger small-btn"
											onClick={() => deleteUser(u)}
										>
											Delete
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			<h3>Recent jobs</h3>
			<div className="card table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Owner</th>
							<th scope="col">Name</th>
							<th scope="col">Schedule</th>
							<th scope="col">Target</th>
							<th scope="col">Last run</th>
							<th scope="col">Last status</th>
						</tr>
					</thead>
					<tbody>
						{jobs.map((j) => (
							<tr key={j.id} className={j.enabled ? "" : "row-off"}>
								<td className="mono small">{j.owner}</td>
								<td>{j.name}</td>
								<td className="mono small">{j.schedule}</td>
								<td className="mono small truncate">{j.target_url}</td>
								<td>{relativeTime(j.last_run_at)}</td>
								<td>{j.last_status ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function Stat({ label, value, sub, tone = "ok" }) {
	return (
		<div className={`card stat ${tone}`}>
			<dt>{label}</dt>
			<dd className="mono">{value}</dd>
			{sub && <small className="muted">{sub}</small>}
		</div>
	);
}

function QuotaCell({ used, limit }) {
	return (
		<span className={`mono small quota ${quotaTone(used, limit)}`}>
			{used}/{limit} ({percent(used, limit)}%)
		</span>
	);
}

function NumInput({ value, onChange, label, min = 0 }) {
	return (
		<input
			type="number"
			className="num"
			aria-label={label}
			min={min}
			value={value}
			onChange={(e) => onChange(Number(e.target.value))}
		/>
	);
}
