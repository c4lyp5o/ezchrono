import { useState } from "react";
import { api } from "../api.js";
import { lazy, Suspense } from "react";

// three.js is only needed on this screen, so keep it out of the main bundle.
const Backdrop = lazy(() => import("./Backdrop.jsx"));

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
			<Suspense fallback={null}>
				<Backdrop />
			</Suspense>
			<form className="card signin-card" onSubmit={submit} noValidate>
				<h1>
					ez<span>chrono</span>
				</h1>
				<p className="muted">
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

				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}

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
			</form>
		</div>
	);
}
