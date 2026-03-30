import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:8080';

export const options = {
	scenarios: {
		store_url: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '10s', target: 20 },
				{ duration: '30s', target: 20 },
				{ duration: '10s', target: 0 },
			],
			exec: 'storeUrl',
		},
		redirect_url: {
			executor: 'ramping-vus',
			startVUs: 0,
			startTime: '20s',
			stages: [
				{ duration: '10s', target: 50 },
				{ duration: '30s', target: 50 },
				{ duration: '10s', target: 0 },
			],
			exec: 'redirectUrl',
		},
	},
	thresholds: {
		'http_req_duration{scenario:store_url}': ['p(95)<500'],
		'http_req_duration{scenario:redirect_url}': ['p(95)<200'],
		'http_req_failed{scenario:store_url}': ['rate<0.01'],
		'http_req_failed{scenario:redirect_url}': ['rate<0.01'],
	},
};

// Runs once before the test — seeds tokens for redirect scenario
export function setup() {
	// console.log('Seeding tokens for redirect scenario...');
	const tokens = [];

	for (let i = 0; i < 20; i++) {
		// Unique URL per seed to avoid duplicates
		const url = `https://www.google.com/search?q=seed-${i}-${Date.now()}`;
		const res = http.post(
			`${BASE_URL}/api/url/store`,
			JSON.stringify({ url }),
			{ headers: { 'Content-Type': 'application/json' } },
		);

		// console.log(`seed [${i}] status: ${res.status} body: ${res.body}`);

		if (res.status === 201) {
			try {
				const body = JSON.parse(res.body);
				const token = body.url.split('/r/').pop();
				if (token) tokens.push(token);
			} catch (_) {}
		}
	}

	// console.log(`Seeded ${tokens.length} tokens`);
	return { tokens };
}

export function storeUrl() {
	// Unique URL per request to avoid duplicate conflicts
	const uniqueUrl = `https://www.google.com/search?q=test-${__VU}-${__ITER}-${Date.now()}`;

	const res = http.post(
		`${BASE_URL}/api/url/store`,
		JSON.stringify({ url: uniqueUrl }),
		{ headers: { 'Content-Type': 'application/json' } },
	);

	// Log failures only
	if (res.status !== 201) {
		console.log(`store FAILED — status: ${res.status} body: ${res.body}`);
	}

	check(res, {
		'store: status 201': (r) => r.status === 201,
		'store: has url in response': (r) => {
			try {
				const body = JSON.parse(r.body);
				return body.url !== undefined;
			} catch {
				return false;
			}
		},
	});

	sleep(1);
}

export function redirectUrl(data) {
	const { tokens } = data;

	if (!tokens || tokens.length === 0) {
		console.warn('No tokens available for redirect test');
		sleep(1);
		return;
	}

	const token = tokens[Math.floor(Math.random() * tokens.length)];

	const res = http.get(`${BASE_URL}/r/${token}`, {
		redirects: 0, // check for 301/302, don't follow
	});

	// Log failures only
	if (res.status !== 301 && res.status !== 302) {
		console.log(
			`redirect FAILED — token: ${token} status: ${res.status} body: ${res.body}`,
		);
	}

	check(res, {
		'redirect: status 301 or 302': (r) =>
			r.status === 301 || r.status === 302,
		'redirect: has Location header': (r) =>
			r.headers['Location'] !== undefined,
	});

	sleep(0.5);
}
