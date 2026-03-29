import { addToBF, addToCache, checkBF, redis } from './cache.js';
import { Urls } from './db.js';

export const getDocByPk = async (pk) => {
	if (!(await checkBF(pk))) return undefined; // Doc doesnt exists

	const cachedDoc = await redis.get(pk);
	if (cachedDoc) {
		console.log(`Fetched Doc ${pk} using cache`);
		return JSON.parse(cachedDoc);
	}

	const dbDOC = await Urls.findByPk(pk, {
		attributes: ['url'],
	});

	if (dbDOC) {
		await addToCache(pk, JSON.stringify(dbDOC.toJSON()));
	}

	return dbDOC;
};

export const addDoc = async ({ id, url }) => {
	if (!checkBF(id)) await addToBF(id);

	const cachedDoc = await redis.get(pk);
	if (!cachedDoc) await addToCache(id, JSON.stringify({ id, url }));

	const doc = await Urls.create({
		id,
		url,
	});

	return doc;
};
