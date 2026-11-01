// Page footer, ezhost style: the running version, a dot, the repo link.
// __APP_VERSION__ / __APP_REPO__ come from vite.config.js `define`.
const VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
const REPO = typeof __APP_REPO__ !== "undefined" ? __APP_REPO__ : "";

export default function Footer() {
	return (
		<footer className="footer">
			{VERSION && <span className="mono">v{VERSION}</span>}
			{VERSION && REPO && <span aria-hidden="true">·</span>}
			{REPO && (
				<a
					href={REPO}
					target="_blank"
					rel="noopener noreferrer"
					title="Source on GitHub"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
					</svg>
					<span className="sr-only">Source on GitHub</span>
				</a>
			)}
		</footer>
	);
}
