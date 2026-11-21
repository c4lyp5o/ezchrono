// The brand row every ez app uses: the shared ez icon (the favicon file),
// the lowercase name, and an optional scope after a divider.
export function Brand({ name, scope, size = 20 }) {
	return (
		<div className="brand">
			<img
				className="mark"
				src="/icons/icon-192.png"
				alt=""
				width={size}
				height={size}
			/>
			{name}
			{scope && <span className="scope">{scope}</span>}
		</div>
	);
}
