import { useState } from "react";

// Dark is the default; light is an explicit opt-out. Same key as every ez app.
function read() {
	try {
		return localStorage.getItem("ez.theme") === "light" ? "light" : "dark";
	} catch {
		return "dark";
	}
}

export default function ThemeSwitch() {
	const [theme, setTheme] = useState(read);
	const next = theme === "dark" ? "light" : "dark";
	function flip() {
		const root = document.documentElement;
		root.classList.toggle("dark", next === "dark");
		root.classList.toggle("light", next === "light");
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute("content", next === "dark" ? "#171719" : "#f9fafb");
		try {
			localStorage.setItem("ez.theme", next);
		} catch {
			/* the class still applies */
		}
		window.dispatchEvent(new Event("ez-theme"));
		setTheme(next);
	}
	return (
		<button
			type="button"
			className="icon-btn"
			role="switch"
			aria-checked={theme === "dark"}
			aria-label={`Theme: ${theme}. Switch to ${next} mode`}
			title={`Switch to ${next} mode`}
			onClick={flip}
		>
			{theme === "dark" ? (
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
				>
					<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
				</svg>
			) : (
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
				>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
				</svg>
			)}
		</button>
	);
}
