import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE, spring } from "./ez/motion";
import Footer from "./components/Footer.jsx";
import ThemeSwitch from "./components/ThemeSwitch.jsx";
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
		return <div className="boot">Checking your session…</div>;
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
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.32, ease: EASE }}
				>
					<header className="topbar">
						<div className="brand">
							<span className="mark" aria-hidden="true">
								cr
							</span>
							ezchrono
							<span className="scope">Cron for HTTP</span>
						</div>
						<nav className="tabs" aria-label="Sections">
							<button
								type="button"
								className={view === "jobs" ? "tab active" : "tab"}
								aria-current={view === "jobs" ? "page" : undefined}
								onClick={() => setView("jobs")}
							>
								My jobs
								{view === "jobs" && (
									<motion.span
										layoutId="tab-line"
										className="sel-line"
										transition={spring}
									/>
								)}
							</button>
							{me.role === "admin" && (
								<button
									type="button"
									className={view === "admin" ? "tab active" : "tab"}
									aria-current={view === "admin" ? "page" : undefined}
									onClick={() => setView("admin")}
								>
									Admin
									{view === "admin" && (
										<motion.span
											layoutId="tab-line"
											className="sel-line"
											transition={spring}
										/>
									)}
								</button>
							)}
						</nav>
						<div className="who">
							<span className="email">{me.email}</span>
							<ThemeSwitch />
							<button
								type="button"
								className="ghost small-btn"
								onClick={signOut}
							>
								Sign out
							</button>
						</div>
					</header>
					<main className="content">
						<AnimatePresence mode="wait">
							<motion.div
								key={view}
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{
									opacity: 0,
									y: -6,
									transition: { duration: 0.14, ease: EASE },
								}}
								transition={{ duration: 0.32, ease: EASE }}
							>
								{view === "admin" && me.role === "admin" ? (
									<AdminView />
								) : (
									<UserView quota={me.quota} />
								)}
							</motion.div>
						</AnimatePresence>
					</main>
					<Footer />
				</motion.div>
			)}
		</AnimatePresence>
	);
}
