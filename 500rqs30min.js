import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'http://localhost:8080';

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const storeSuccessRate = new Rate('store_success_rate');
const redirectSuccessRate = new Rate('redirect_success_rate');
const storeDuration = new Trend('store_duration', true);
const redirectDuration = new Trend('redirect_duration', true);
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');

// ─── Load Profile — 1 minute total ────────────────────────────────────────────
export const options = {
	scenarios: {
		store_url: {
			executor: 'ramping-arrival-rate',
			startRate: 0,
			timeUnit: '1s',
			preAllocatedVUs: 50,
			maxVUs: 300,
			stages: [
				{ duration: '15s', target: 100 }, // ramp up
				{ duration: '30s', target: 200 }, // sustain 200 req/s
				{ duration: '15s', target: 0 }, // cool down
			],
			exec: 'storeUrl',
		},
		redirect_url: {
			executor: 'ramping-arrival-rate',
			startRate: 0,
			timeUnit: '1s',
			preAllocatedVUs: 200,
			maxVUs: 1000,
			startTime: '10s',
			stages: [
				{ duration: '15s', target: 400 }, // ramp up
				{ duration: '25s', target: 800 }, // sustain 800 req/s
				{ duration: '10s', target: 0 }, // cool down
			],
			exec: 'redirectUrl',
		},
	},

	thresholds: {
		store_duration: ['p(95)<500', 'p(99)<1000'],
		redirect_duration: ['p(95)<200', 'p(99)<500'],
		store_success_rate: ['rate>0.95'],
		redirect_success_rate: ['rate>0.95'],
		http_req_failed: ['rate<0.05'],
	},
};

// ─── Setup ─────────────────────────────────────────────────────────────────────
export function setup() {
	console.log('Seeding tokens...');
	const tokens = [];

	for (let i = 0; i < 200; i++) {
		const res = http.post(
			`${BASE_URL}/api/url/store`,
			JSON.stringify({
				url: `https://www.google.com/search?q=seed-${i}-${Date.now()}`,
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

	console.log(`Seeded ${tokens.length}/200 tokens`);
	return { tokens };
}

// ─── Store ─────────────────────────────────────────────────────────────────────
export function storeUrl() {
	const uniqueUrl = `https://www.google.com/search?q=load-${__VU}-${__ITER}-${Date.now()}`;

	const start = Date.now();
	const res = http.post(
		`${BASE_URL}/api/url/store`,
		JSON.stringify({ url: uniqueUrl }),
		{ headers: { 'Content-Type': 'application/json' } },
	);
	storeDuration.add(Date.now() - start);

	const success = check(res, {
		'store: status 201': (r) => r.status === 201,
		'store: has url in body': (r) => {
			try {
				return JSON.parse(r.body).url !== undefined;
			} catch {
				return false;
			}
		},
	});

	storeSuccessRate.add(success);
	if (!success)
		console.log(`store FAILED — status:${res.status} body:${res.body}`);
}

// ─── Redirect ──────────────────────────────────────────────────────────────────
export function redirectUrl(data) {
	const { tokens } = data;
	if (!tokens || tokens.length === 0) return;

	// Hotspot — 20% tokens get 80% traffic
	const hotCount = Math.max(1, Math.floor(tokens.length * 0.2));
	const useHot = Math.random() < 0.8;
	const pool = useHot ? tokens.slice(0, hotCount) : tokens;
	const token = pool[Math.floor(Math.random() * pool.length)];

	const start = Date.now();
	const res = http.get(`${BASE_URL}/r/${token}`, { redirects: 0 });
	const duration = Date.now() - start;
	redirectDuration.add(duration);

	if (duration < 15) cacheHits.add(1);
	else cacheMisses.add(1);

	const success = check(res, {
		'redirect: status 301 or 302': (r) =>
			r.status === 301 || r.status === 302,
		'redirect: has Location header': (r) =>
			r.headers['Location'] !== undefined,
	});

	redirectSuccessRate.add(success);
	if (!success)
		console.log(`redirect FAILED — token:${token} status:${res.status}`);
}
