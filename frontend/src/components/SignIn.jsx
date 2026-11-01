import { motion } from "motion/react";
import { useState } from "react";
import { api } from "../api.js";
// The ez scene; it imports three.js lazily, so it stays out of the main bundle.
import Backdrop from "../ez/Backdrop";
import { Collapse, EASE } from "../ez/motion";

export default function SignIn({ onSignedIn }) {
	const [mode, setMode] = useState("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setError("");
		setBusy(true);
		try {
			if (mode === "signup") {
				await api("/auth/signup", {
					method: "POST",
					body: { email, password },
				});
			}
			await api("/auth/login", { method: "POST", body: { email, password } });
			await onSignedIn();
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="signin">
			<Backdrop className="ez-backdrop" opacity={0.45} nodes={18} />
			<motion.form
				className="card signin-card"
				onSubmit={submit}
				noValidate
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.42, ease: EASE }}
			>
				<div className="brand">
					<span className="mark" aria-hidden="true">
						cr
					</span>
					ezchrono
				</div>
				<h1>
					{mode === "signup" ? "Create an account" : "Sign in to ezchrono"}
				</h1>
				<p className="muted" style={{ marginTop: 6 }}>
					Schedule HTTP calls on a cron. Quotas keep it fair.
				</p>

				<label htmlFor="email">Email</label>
				<input
					id="email"
					type="email"
					autoComplete="username"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>

				<label htmlFor="password">Password</label>
				<input
					id="password"
					type="password"
					autoComplete={mode === "signup" ? "new-password" : "current-password"}
					required
					minLength={mode === "signup" ? 10 : 1}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>

				<Collapse open={!!error}>
					<p className="error small" role="alert" style={{ marginTop: 10 }}>
						{error}
					</p>
				</Collapse>

				<button type="submit" className="primary" disabled={busy}>
					{busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
				</button>
				<button
					type="button"
					className="link"
					onClick={() => {
						setMode(mode === "login" ? "signup" : "login");
						setError("");
					}}
				>
					{mode === "login"
						? "Need an account? Sign up"
						: "Have an account? Sign in"}
				</button>
			</motion.form>
		</div>
	);
}
