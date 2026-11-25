/*
 * An agent's usage limits as its own usage command prints them (Claude Code's and Antigravity CLI's `/usage`), and
 * when each resets: the bars of its tile's page.
 */

/** A limit: its name as the agent says it, how much of it is used, and when it resets. */
export interface UsageLine {
	readonly name: string;
	/** The models it is of, as the agent names them (Antigravity CLI: `Gemini Models`); none: all of them. */
	readonly group?: string;
	readonly percent: number;
	readonly resets?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The wall clock of a time zone at an instant. */
function zoneParts(date: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
	const parts: Record<string, string> = {};
	for (const part of new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date)) {
		parts[part.type] = part.value;
	}
	return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second };
}

/** The instant a zone's wall clock shows this time (the earlier one in a repeated hour). */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	const offsetAt = (t: number) => {
		const p = zoneParts(new Date(t), zone);
		return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
	};
	let t = wall - offsetAt(wall);
	t = wall - offsetAt(t);
	return new Date(t);
}

/**
 * When a limit resets, as an agent writes it. Antigravity CLI: an instant (`2026-12-02T09:56:31Z`). Claude Code:
 * `Nov 22, 12:49am (America/Los_Angeles)` or `4pm (Europe/Paris)`, the time of the zone it runs in, which may not
 * be this computer's (Claude Code in WSL keeps its own); the year and, with no date, the day are the next ones
 * from now. Undefined when it reads otherwise.
 */
export function resetInstant(raw: string, now: Date): Date | undefined {
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim())) {
		const at = Date.parse(raw.trim());
		return Number.isFinite(at) ? new Date(at) : undefined;
	}
	const m = /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)$/i.exec(raw.trim());
	if (!m) {
		return undefined;
	}
	const zone = m[6].trim();
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
	} catch {
		return undefined;
	}
	const clock = Number(m[3]);
	const minute = m[4] ? Number(m[4]) : 0;
	// A 12-hour clock: 1 to 12.
	if (clock < 1 || clock > 12 || minute > 59) {
		return undefined;
	}
	const hour = (clock % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0);
	const today = zoneParts(now, zone);
	const options: Date[] = [];
	if (m[1]) {
		const month = MONTHS.indexOf(m[1].toLowerCase());
		const day = Number(m[2]);
		if (month < 0 || day < 1 || day > 31) {
			return undefined;
		}
		for (const year of [today.year, today.year + 1]) {
			options.push(zonedInstant(year, month + 1, day, hour, minute, zone));
		}
	} else {
		for (const ahead of [0, 1]) {
			const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
			options.push(zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, zone));
		}
	}
	// A reset just passed still reads as itself; otherwise the first one ahead.
	return options.find(d => d.getTime() >= now.getTime() - 60 * 60 * 1000);
}
