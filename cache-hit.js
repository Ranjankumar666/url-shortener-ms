import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'http://localhost:8080';

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const cacheHitRate = new Rate('cache_hit_rate');
const firstRedirect = new Trend('first_redirect_ms', true); // cold — should be slow (DB)
const secondRedirect = new Trend('second_redirect_ms', true); // warm — should be fast (Redis)

export const options = {
	scenarios: {
		cache_hit_test: {
			executor: 'ramping-vus',
			startVUs: 1,
			stages: [
				{ duration: '10s', target: 10 },
				{ duration: '40s', target: 30 },
				{ duration: '10s', target: 0 },
			],
			exec: 'cacheHitTest',
		},
	},
	thresholds: {
		// If cache is working, 2nd redirect should be significantly faster
		second_redirect_ms: ['p(95)<50'], // Redis should serve in <50ms
		first_redirect_ms: ['p(95)<300'], // DB path allowed more time
		cache_hit_rate: ['rate>0.70'], // expect 70%+ cache hits
	},
};

export function cacheHitTest() {
	// Step 1 — Store a brand new unique URL
	const uniqueUrl = `https://www.google.com/search?q=cachetest-${__VU}-${__ITER}-${Date.now()}`;

	const storeRes = http.post(
		`${BASE_URL}/api/url/store`,
		JSON.stringify({ url: uniqueUrl }),
		{ headers: { 'Content-Type': 'application/json' } },
	);

	const storeOk = check(storeRes, {
		'store: status 201': (r) => r.status === 201,
		'store: has url': (r) => {
			try {
				return JSON.parse(r.body).url !== undefined;
			} catch {
				return false;
			}
		},
	});

	if (!storeOk) {
		console.log(
			`store FAILED — status:${storeRes.status} body:${storeRes.body}`,
		);
		sleep(1);
		return;
	}

	const token = JSON.parse(storeRes.body).url.split('/r/').pop();

	// Small pause to let cache write complete
	sleep(0.1);

	// Step 2 — First redirect (should be cache HIT since store wrote to Redis directly)
	const start1 = Date.now();
	const res1 = http.get(`${BASE_URL}/r/${token}`, { redirects: 0 });
	const duration1 = Date.now() - start1;
	firstRedirect.add(duration1);

	check(res1, {
		'first redirect: 301 or 302': (r) =>
			r.status === 301 || r.status === 302,
		'first redirect: has Location': (r) =>
			r.headers['Location'] !== undefined,
	});

	// Step 3 — Second redirect immediately (definitely cache HIT)
	const start2 = Date.now();
	const res2 = http.get(`${BASE_URL}/r/${token}`, { redirects: 0 });
	const duration2 = Date.now() - start2;
	secondRedirect.add(duration2);

	check(res2, {
		'second redirect: 301 or 302': (r) =>
			r.status === 301 || r.status === 302,
		'second redirect: has Location': (r) =>
			r.headers['Location'] !== undefined,
	});

	// Cache hit detection — second redirect should be meaningfully faster than first
	// If both are similarly fast, Redis is serving both (cache working perfectly)
	// If second is much faster than first, first was a DB miss, second was cache hit
	const isHit = duration2 < 50; // under 15ms = Redis
	if (isHit) cacheHits.add(1);
	else cacheMisses.add(1);
	cacheHitRate.add(isHit);

	console.log(
		`VU:${__VU} ITER:${__ITER} token:${token} 1st:${duration1}ms 2nd:${duration2}ms ${isHit ? '✓ CACHE HIT' : '✗ CACHE MISS'}`,
	);

	sleep(0.5);
}
