import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = 'http://localhost:8080';

// ─── Metrics ─────────────────────────────────────────
const successRate = new Rate('success_rate');
const redirectDuration = new Trend('redirect_duration', true);
const storeDuration = new Trend('store_duration', true);
const cacheHit = new Counter('cache_hit');
const cacheMiss = new Counter('cache_miss');

// ─── Options (LOCAL SAFE LIMITS) ─────────────────────
export const options = {
	scenarios: {
		// 80% traffic — redirects
		redirect_traffic: {
			executor: 'ramping-arrival-rate',
			startRate: 50,
			timeUnit: '1s',
			preAllocatedVUs: 30,
			maxVUs: 150,
			exec: 'redirect',

			stages: [
				{ target: 100, duration: '1m' },
				{ target: 250, duration: '2m' }, // sustainable peak
				{ target: 400, duration: '1m' }, // stress spike
				{ target: 150, duration: '1m' }, // recovery
				{ target: 0, duration: '30s' },
			],
		},

		// 20% traffic — stores
		store_traffic: {
			executor: 'constant-arrival-rate',
			rate: 60,
			timeUnit: '1s',
			duration: '5m',
			preAllocatedVUs: 20,
			maxVUs: 80,
			exec: 'store',
		},
	},

	thresholds: {
		http_req_failed: ['rate<0.01'],
		success_rate: ['rate>0.99'],

		redirect_duration: ['p(95)<300'], // relaxed for local env
		store_duration: ['p(95)<500'],
	},
};

// ─── Setup ───────────────────────────────────────────
export function setup() {
	const tokens = [];

	// small but reusable dataset (important for cache realism)
	for (let i = 0; i < 100; i++) {
		const res = http.post(
			`${BASE_URL}/api/url/store`,
			JSON.stringify({
				url: `https://example.com/${i}-${Date.now()}`,
			}),
			{ headers: { 'Content-Type': 'application/json' } },
		);

		if (res.status === 201) {
			try {
				const token = JSON.parse(res.body).url.split('/r/').pop();
				if (token) tokens.push(token);
			} catch (_) {}
		}
	}

	return { tokens };
}

// ─── Redirect (hotspot traffic) ──────────────────────
export function redirect(data) {
	const tokens = data.tokens;

	const hotSize = Math.floor(tokens.length * 0.2);
	const pool = Math.random() < 0.8 ? tokens.slice(0, hotSize) : tokens;

	const token = pool[Math.floor(Math.random() * pool.length)];

	const start = Date.now();
	const res = http.get(`${BASE_URL}/r/${token}`, {
		redirects: 0,
	});
	const duration = Date.now() - start;

	redirectDuration.add(duration);

	if (duration < 15) cacheHit.add(1);
	else cacheMiss.add(1);

	const ok = check(res, {
		'redirect ok': (r) => r.status === 301 || r.status === 302,
	});

	successRate.add(ok);
}

// ─── Store ───────────────────────────────────────────
export function store() {
	const url = `https://mysite.com/${Math.random()}`;

	const start = Date.now();
	const res = http.post(
		`${BASE_URL}/api/url/store`,
		JSON.stringify({ url }),
		{ headers: { 'Content-Type': 'application/json' } },
	);

	storeDuration.add(Date.now() - start);

	const ok = check(res, {
		'store ok': (r) => r.status === 201,
	});

	successRate.add(ok);

	sleep(Math.random() * 0.5);
}
