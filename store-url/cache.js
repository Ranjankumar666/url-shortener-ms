import { Redis } from 'ioredis';

export const redis = new Redis({
	host: process.env.REDIS_HOST,
	port: process.env.REDIS_HOST_PORT,
	retryStrategy: (times) => Math.min(times * 50, 2000), // Smart reconnection
});
const BF_filter_name = 'url_id_check';
redis.on('connect', async () => {
	console.log('ioredis connected!');
	try {
		await redis.call('BF.RESERVE', BF_filter_name, 0.01, 10000);
	} catch (err) {
		if (err.message !== 'ERR item exists') throw err;
	}
});

export const addToCache = async (key, val, expiry = 1800) => {
	await redis.set(key, val, 'EX', expiry);
};

export const addToBF = async (id) => {
	await redis.call('BF.ADD', BF_filter_name, id);
};

export const checkBF = async (id) => {
	const res = await redis.call('BF.EXISTS', BF_filter_name, id);
	return res === 1;
};
