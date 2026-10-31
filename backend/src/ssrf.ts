import dns from "node:dns/promises";
import net from "node:net";
import { allowPrivateTargets } from "./config";

export class TargetError extends Error {}

function isPrivateIPv4(ip: string): boolean {
	const [a, b] = ip.split(".").map(Number);
	return (
		a === 0 || // "this" network
		a === 10 || // RFC1918
		a === 127 || // loopback
		(a === 100 && b >= 64 && b <= 127) || // CGNAT
		(a === 169 && b === 254) || // link-local, cloud metadata
		(a === 172 && b >= 16 && b <= 31) || // RFC1918
		(a === 192 && b === 0) || // IETF protocol assignments
		(a === 192 && b === 168) || // RFC1918
		(a === 198 && (b === 18 || b === 19)) || // benchmarking
		a >= 224 // multicast, reserved, broadcast
	);
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === "::" || lower === "::1") return true;
	if (lower.startsWith("::ffff:")) {
		const v4 = lower.slice(7);
		return net.isIPv4(v4) ? isPrivateIPv4(v4) : true;
	}
	return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
}

export function isPrivateAddress(ip: string): boolean {
	if (net.isIPv4(ip)) return isPrivateIPv4(ip);
	if (net.isIPv6(ip)) return isPrivateIPv6(ip);
	return true; // not an IP at all: refuse
}

/**
 * Rejects anything that is not a public http(s) URL. Checked at creation and
 * again at every run, because DNS can change between the two.
 */
export async function assertPublicTarget(rawUrl: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new TargetError("Target is not a valid URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new TargetError("Only http and https targets are allowed");
	}
	if (url.username || url.password) {
		throw new TargetError("Credentials in the URL are not allowed");
	}
	if (allowPrivateTargets()) return url;

	const host = url.hostname.replace(/^\[|\]$/g, "");
	let addresses: string[];
	if (net.isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
		} catch {
			throw new TargetError("Target host does not resolve");
		}
	}
	if (addresses.length === 0) throw new TargetError("Target host does not resolve");
	if (addresses.some(isPrivateAddress)) {
		throw new TargetError("Target resolves to a private or reserved address");
	}
	return url;
}
