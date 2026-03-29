import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'http://localhost:8080';

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const storeSuccessRate = new Rate('store_success_rate');
const redirectSuccessRate = new Rate('redirect_success_rate');
const storeDuration = new Trend('store_duration', true);
const redirectDuration = new Trend('redirect_duration', true);
const storeErrors = new Counter('store_errors');
const redirectErrors = new Counter('redirect_errors');
const cacheHits = new Counter('redirect_cache_hits'); // fast redirects < 10ms
const cacheMisses = new Counter('redirect_cache_misses'); // slow redirects >= 10ms

// ─── Load Profile ──────────────────────────────────────────────────────────────
// Real world URL shorteners have ~80% reads (redirects) vs ~20% writes (stores)
// Traffic pattern: cold start → ramp → sustained peak → spike → cool down
export const options = {
	scenarios: {
		// Writes — 20% of traffic
		store_url: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: 5 }, // cold start
				{ duration: '60s', target: 15 }, // ramp up
				{ duration: '60s', target: 15 }, // sustained load
				{ duration: '20s', target: 40 }, // traffic spike
				{ duration: '20s', target: 15 }, // spike recovery
				{ duration: '30s', target: 0 }, // cool down
			],
			exec: 'storeUrl',
		},

		// Reads — 80% of traffic
		redirect_url: {
			executor: 'ramping-vus',
			startVUs: 0,
			startTime: '15s', // slight delay so tokens exist before redirects start
			stages: [
				{ duration: '30s', target: 20 }, // cold start
				{ duration: '60s', target: 60 }, // ramp up
				{ duration: '60s', target: 60 }, // sustained load
				{ duration: '20s', target: 150 }, // traffic spike
				{ duration: '20s', target: 60 }, // spike recovery
				{ duration: '30s', target: 0 }, // cool down
			],
			exec: 'redirectUrl',
		},

		// Burst scenario — sudden spike of new URL creations (e.g. marketing campaign)
		burst_store: {
			executor: 'constant-vus',
			vus: 20,
			duration: '10s',
			startTime: '130s', // fires during the spike window
			exec: 'storeUrl',
		},
	},

	thresholds: {
		// Latency
		store_duration: ['p(95)<500', 'p(99)<1000'],
		redirect_duration: ['p(95)<200', 'p(99)<500'],

		// Success rates
		store_success_rate: ['rate>0.99'], // 99% of stores must succeed
		redirect_success_rate: ['rate>0.99'], // 99% of redirects must succeed

		// Overall HTTP
		'http_req_duration{scenario:store_url}': ['p(95)<500'],
		'http_req_duration{scenario:redirect_url}': ['p(95)<200'],
		http_req_failed: ['rate<0.01'],
	},
};

// ─── Setup — pre-seed tokens ───────────────────────────────────────────────────
export function setup() {
	console.log('Seeding initial tokens...');
	const tokens = [];

	// Seed 50 tokens so redirects have plenty to work with from the start
	for (let i = 0; i < 50; i++) {
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

	console.log(`Seeded ${tokens.length}/50 tokens`);
	return { tokens };
}

// ─── Store Scenario ────────────────────────────────────────────────────────────
export function storeUrl() {
	// Simulate real URLs of varying lengths
	const urls = [
		`https://www.github.com/user/repo-${__VU}-${__ITER}`,
		`https://www.youtube.com/watch?v=${randomString(11)}`,
		`https://www.google.com/search?q=${randomString(20)}&hl=en&source=hp`,
		`https://www.amazon.com/dp/${randomString(10)}?ref=nav_custrec`,
		`https://medium.com/@user/article-${randomString(15)}-${__ITER}`,
	];

	const url = urls[Math.floor(Math.random() * urls.length)];

	const start = Date.now();
	const res = http.post(
		`${BASE_URL}/api/url/store`,
		JSON.stringify({ url }),
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
	if (!success) {
		storeErrors.add(1);
		console.log(
			`store FAILED — VU:${__VU} ITER:${__ITER} status:${res.status} body:${res.body}`,
		);
	}

	// Real users don't hammer — think time between actions
	sleep(randomBetween(0.5, 2));
}

// ─── Redirect Scenario ─────────────────────────────────────────────────────────
export function redirectUrl(data) {
	const { tokens } = data;

	if (!tokens || tokens.length === 0) {
		sleep(1);
		return;
	}

	// Simulate hotspot traffic — 20% of tokens get 80% of traffic (Pareto distribution)
	const hotTokenCount = Math.max(1, Math.floor(tokens.length * 0.2));
	const useHotToken = Math.random() < 0.8;
	const pool = useHotToken ? tokens.slice(0, hotTokenCount) : tokens;
	const token = pool[Math.floor(Math.random() * pool.length)];

	const start = Date.now();
	const res = http.get(`${BASE_URL}/r/${token}`, {
		redirects: 0,
	});
	const duration = Date.now() - start;
	redirectDuration.add(duration);

	// Track cache hits vs misses based on response time
	if (duration < 10) cacheHits.add(1);
	else cacheMisses.add(1);

	const success = check(res, {
		'redirect: status 301 or 302': (r) =>
			r.status === 301 || r.status === 302,
		'redirect: has Location header': (r) =>
			r.headers['Location'] !== undefined,
	});

	redirectSuccessRate.add(success);
	if (!success) {
		redirectErrors.add(1);
		console.log(
			`redirect FAILED — token:${token} status:${res.status} body:${res.body}`,
		);
	}

	// Redirects are fast user actions — short think time
	sleep(randomBetween(0.1, 0.5));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function randomString(length) {
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

function randomBetween(min, max) {
	return Math.random() * (max - min) + min;
}
