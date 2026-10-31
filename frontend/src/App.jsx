import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "./api.js";
import SignIn from "./components/SignIn.jsx";
import UserView from "./components/UserView.jsx";
import AdminView from "./components/AdminView.jsx";

export default function App() {
	// undefined = still checking the session, null = signed out
	const [me, setMe] = useState(undefined);
	const [view, setView] = useState("jobs");

	const refresh = useCallback(async () => {
		try {
			setMe(await api("/auth/me"));
		} catch {
			setMe(null);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function signOut() {
		await api("/auth/logout", { method: "POST" }).catch(() => {});
		setMe(null);
		setView("jobs");
	}

	if (me === undefined) {
		return <div className="boot">Loading…</div>;
	}

	return (
		<AnimatePresence mode="wait">
			{me === null ? (
				<motion.div
					key="signin"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					<SignIn onSignedIn={refresh} />
				</motion.div>
			) : (
				<motion.div
					key="app"
					className="shell"
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2 }}
				>
					<header className="topbar">
						<div className="brand">
							ez<span>chrono</span>
						</div>
						<nav className="tabs" aria-label="Sections">
							<button
								type="button"
								className={view === "jobs" ? "tab active" : "tab"}
								aria-current={view === "jobs" ? "page" : undefined}
								onClick={() => setView("jobs")}
							>
								My jobs
							</button>
							{me.role === "admin" && (
								<button
									type="button"
									className={view === "admin" ? "tab active" : "tab"}
									aria-current={view === "admin" ? "page" : undefined}
									onClick={() => setView("admin")}
								>
									Admin
								</button>
							)}
						</nav>
						<div className="who">
							<span className="email">{me.email}</span>
							<button type="button" className="ghost" onClick={signOut}>
								Sign out
							</button>
						</div>
					</header>
					<main className="content">
						{view === "admin" && me.role === "admin" ? (
							<AdminView key="admin" />
						) : (
							<UserView key="jobs" quota={me.quota} />
						)}
					</main>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
