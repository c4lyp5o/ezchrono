import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../api.js";

export default function PasswordForm({ onClose, onSaved }) {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setError("");
		if (next.length < 10) {
			setError("New password must be at least 10 characters.");
			return;
		}
		if (next !== confirm) {
			setError("New passwords do not match.");
			return;
		}
		setBusy(true);
		try {
			await api("/auth/change-password", {
				method: "POST",
				body: { current_password: current, new_password: next },
			});
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
				aria-label="Change password"
				onSubmit={submit}
				noValidate
				initial={{ y: 16, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: 16, opacity: 0 }}
				onClick={(e) => e.stopPropagation()}
			>
				<h3>Change password</h3>

				<label htmlFor="pw-current">Current password</label>
				<input
					id="pw-current"
					type="password"
					autoComplete="current-password"
					required
					value={current}
					onChange={(e) => setCurrent(e.target.value)}
				/>

				<label htmlFor="pw-new">New password (10+ characters)</label>
				<input
					id="pw-new"
					type="password"
					autoComplete="new-password"
					required
					minLength={10}
					value={next}
					onChange={(e) => setNext(e.target.value)}
				/>

				<label htmlFor="pw-confirm">Confirm new password</label>
				<input
					id="pw-confirm"
					type="password"
					autoComplete="new-password"
					required
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
				/>

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
						{busy ? "Saving…" : "Change password"}
					</button>
				</div>
			</motion.form>
		</motion.div>
	);
}
