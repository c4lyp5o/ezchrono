// Thin fetch wrapper. Every call sends the session cookie and throws an Error
// carrying the server's message, so screens can show it directly.
export class ApiFailure extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

export async function api(path, { method = "GET", body } = {}) {
	const res = await fetch(`/api/v1${path}`, {
		method,
		credentials: "same-origin",
		headers:
			body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (res.status === 204) return null;
	let data = null;
	try {
		data = await res.json();
	} catch {
		// non-JSON body (e.g. a proxy error page)
	}
	if (!res.ok) {
		throw new ApiFailure(
			res.status,
			data?.error || `Request failed (${res.status})`,
		);
	}
	return data;
}
